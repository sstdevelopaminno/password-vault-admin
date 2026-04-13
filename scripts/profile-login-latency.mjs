#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const runs = Number(process.env.RUNS ?? 6);

function summarize(values) {
  if (!values.length) {
    return { count: 0, avgMs: 0, minMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0 };
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
    p95Ms: Number(pick(0.95).toFixed(2)),
  };
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

const endpointSamples = new Map();
const statusSamples = new Map();

function trackSample(name, status, durationMs) {
  const durations = endpointSamples.get(name) ?? [];
  durations.push(durationMs);
  endpointSamples.set(name, durations);

  const statuses = statusSamples.get(name) ?? {};
  statuses[status] = (statuses[status] ?? 0) + 1;
  statusSamples.set(name, statuses);
}

console.log(
  JSON.stringify(
    {
      step: "warmup",
      baseUrl,
      runs,
    },
    null,
    2,
  ),
);

const warmupLogin = await timedFetch(`${baseUrl}/login`, { method: "GET", cache: "no-store" });
trackSample("GET /login", warmupLogin.status, warmupLogin.durationMs);

await timedFetch(`${baseUrl}/api/admin/access`, {
  method: "GET",
  cache: "no-store",
});

const warmupCreate = await timedFetch(`${baseUrl}/api/auth/qr/challenge`, {
  method: "POST",
  cache: "no-store",
  headers: {
    "content-type": "application/json",
    "x-forwarded-for": "10.20.30.250",
    "x-real-ip": "10.20.30.250",
  },
  body: JSON.stringify({ deviceLabel: "warmup" }),
});

const warmupChallenge = warmupCreate.body?.challenge;
if (warmupChallenge?.id && warmupChallenge?.token && warmupChallenge?.nonce) {
  await timedFetch(
    `${baseUrl}/api/auth/qr/challenge/${warmupChallenge.id}?token=${encodeURIComponent(warmupChallenge.token)}&nonce=${encodeURIComponent(warmupChallenge.nonce)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  await timedFetch(`${baseUrl}/api/auth/qr/challenge/${warmupChallenge.id}/exchange`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token: warmupChallenge.token,
      nonce: warmupChallenge.nonce,
    }),
  });
}

for (let i = 0; i < runs; i += 1) {
  const ip = `10.20.30.${i + 1}`;

  const login = await timedFetch(`${baseUrl}/login`, {
    method: "GET",
    cache: "no-store",
  });
  trackSample("GET /login", login.status, login.durationMs);

  const access = await timedFetch(`${baseUrl}/api/admin/access`, {
    method: "GET",
    cache: "no-store",
  });
  trackSample("GET /api/admin/access", access.status, access.durationMs);

  const create = await timedFetch(`${baseUrl}/api/auth/qr/challenge`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "x-real-ip": ip,
    },
    body: JSON.stringify({ deviceLabel: `profile-${i + 1}` }),
  });
  trackSample("POST /api/auth/qr/challenge", create.status, create.durationMs);

  const challenge = create.body?.challenge;
  if (!challenge?.id || !challenge?.token || !challenge?.nonce) {
    continue;
  }

  const resolve = await timedFetch(
    `${baseUrl}/api/auth/qr/challenge/${challenge.id}?token=${encodeURIComponent(challenge.token)}&nonce=${encodeURIComponent(challenge.nonce)}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );
  trackSample("GET /api/auth/qr/challenge/[challengeId]", resolve.status, resolve.durationMs);

  const exchange = await timedFetch(`${baseUrl}/api/auth/qr/challenge/${challenge.id}/exchange`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token: challenge.token,
      nonce: challenge.nonce,
    }),
  });
  trackSample("POST /api/auth/qr/challenge/[challengeId]/exchange", exchange.status, exchange.durationMs);
}

const result = {};
for (const [name, durations] of endpointSamples.entries()) {
  result[name] = {
    latency: summarize(durations),
    statuses: statusSamples.get(name) ?? {},
  };
}

console.log(JSON.stringify({ step: "summary", result }, null, 2));
