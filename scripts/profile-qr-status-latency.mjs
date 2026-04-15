#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const runs = Number(process.env.RUNS ?? 30);
const delayMs = Number(process.env.DELAY_MS ?? 200);
const maxCreateAttempts = Number(process.env.MAX_CREATE_ATTEMPTS ?? 8);

function summarize(values) {
  if (!values.length) {
    return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p90Ms: 0, p95Ms: 0, p99Ms: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  return {
    count: values.length,
    avgMs: Number((sum / values.length).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    p50Ms: Number(pick(0.5).toFixed(2)),
    p90Ms: Number(pick(0.9).toFixed(2)),
    p95Ms: Number(pick(0.95).toFixed(2)),
    p99Ms: Number(pick(0.99).toFixed(2)),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedFetch(url, init) {
  const startedAt = performance.now();
  const response = await fetch(url, init);
  const durationMs = performance.now() - startedAt;
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    status: response.status,
    durationMs,
    body: json,
    text,
  };
}

let create = null;
let createAttempts = 0;
while (createAttempts < maxCreateAttempts) {
  createAttempts += 1;
  create = await timedFetch(`${baseUrl}/api/auth/qr/challenge`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceLabel: "profile-status" }),
  });

  if (create.status === 201 && create.body?.challenge?.id && create.body?.challenge?.token && create.body?.challenge?.nonce) {
    break;
  }

  if (create.status === 429) {
    const retryAfter = Number(create.body?.retryAfterSeconds ?? 0);
    await sleep(Math.max(1_000, (Number.isFinite(retryAfter) ? retryAfter : 3) * 1_000));
    continue;
  }

  break;
}

const challenge = create?.body?.challenge;
if (!create?.status || !challenge?.id || !challenge?.token || !challenge?.nonce) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        step: "create",
        attempts: createAttempts,
        status: create?.status,
        body: create?.body,
        text: create?.text,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const url = `${baseUrl}/api/auth/qr/challenge/${challenge.id}?token=${encodeURIComponent(challenge.token)}&nonce=${encodeURIComponent(challenge.nonce)}`;
const latencies = [];
const statuses = {};

for (let i = 0; i < runs; i += 1) {
  const sample = await timedFetch(url, {
    method: "GET",
    cache: "no-store",
  });
  latencies.push(sample.durationMs);
  statuses[sample.status] = (statuses[sample.status] ?? 0) + 1;
  if (i + 1 < runs) {
    await sleep(delayMs);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      runs,
      delayMs,
      challengeId: challenge.id,
      statusEndpoint: "GET /api/auth/qr/challenge/[challengeId]",
      createAttempts,
      createStatus: create.status,
      latency: summarize(latencies),
      statuses,
    },
    null,
    2,
  ),
);
