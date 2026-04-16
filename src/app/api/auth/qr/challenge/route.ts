import { z } from "zod";
import { env, isAdminQrLoginEnabled } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import {
  buildQrPayload,
  generateQrSecret,
  getClientIp,
  getClientUserAgent,
  hashQrSecret,
} from "@/lib/qr-login";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/auth/qr/challenge";
const MAX_PENDING_PER_IP_PER_MINUTE = 8;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_BLOCK_CACHE_MAX = 2000;
const RATE_LIMIT_DB_CHECK_START_AT = 4;

type RateLimitBlockState = {
  blockedUntilMs: number;
};

type LocalRateLimitWindowState = {
  timestampsMs: number[];
};

type ErrorMetadata = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const blockedIpCache = new Map<string, RateLimitBlockState>();
const localRateWindowByIp = new Map<string, LocalRateLimitWindowState>();

function pruneWindowTimestamps(nowMs: number, timestampsMs: number[]) {
  const minAllowed = nowMs - RATE_LIMIT_WINDOW_MS;
  return timestampsMs.filter((value) => value > minAllowed);
}

function cleanupRateLimitCaches(nowMs: number) {
  if (blockedIpCache.size > RATE_LIMIT_BLOCK_CACHE_MAX) {
    for (const [ip, value] of blockedIpCache.entries()) {
      if (value.blockedUntilMs <= nowMs) {
        blockedIpCache.delete(ip);
      }
      if (blockedIpCache.size <= RATE_LIMIT_BLOCK_CACHE_MAX) break;
    }
  }

  if (localRateWindowByIp.size > RATE_LIMIT_BLOCK_CACHE_MAX) {
    for (const [ip, value] of localRateWindowByIp.entries()) {
      const pruned = pruneWindowTimestamps(nowMs, value.timestampsMs);
      if (pruned.length === 0) {
        localRateWindowByIp.delete(ip);
      } else {
        value.timestampsMs = pruned;
      }
      if (localRateWindowByIp.size <= RATE_LIMIT_BLOCK_CACHE_MAX) break;
    }
  }
}

const requestSchema = z.object({
  deviceLabel: z.string().trim().min(1).max(120).optional(),
});

async function measureMs<T>(bucket: Record<string, number>, key: string, fn: () => PromiseLike<T> | T): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    bucket[key] = Math.max(0, Date.now() - startedAt);
  }
}

async function parseBody(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return {};
  }

  return requestSchema.parse(JSON.parse(raw));
}

function extractErrorMetadata(error: unknown): ErrorMetadata {
  if (!error || typeof error !== "object") {
    return {};
  }

  const source = error as Record<string, unknown>;
  return {
    message: typeof source.message === "string" ? source.message : undefined,
    details: typeof source.details === "string" ? source.details : undefined,
    hint: typeof source.hint === "string" ? source.hint : undefined,
    code: typeof source.code === "string" ? source.code : undefined,
  };
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  const metadata = extractErrorMetadata(error);
  return new Error(metadata.message ?? fallbackMessage);
}

function isQrBackendUnavailableError(error: unknown): boolean {
  const metadata = extractErrorMetadata(error);
  const code = metadata.code?.toUpperCase();

  if (code && ["PGRST000", "PGRST002", "PGRST003", "PGRST202", "42883", "42P01", "57P03"].includes(code)) {
    return true;
  }

  const text = [metadata.message, metadata.details, metadata.hint]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return [
    "fetch failed",
    "network",
    "timeout",
    "timed out",
    "econn",
    "eacces",
    "enotfound",
    "eai_again",
    "connection refused",
  ].some((needle) => text.includes(needle));
}

export async function POST(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);
  const timingsMs: Record<string, number> = {};

  try {
    if (!isAdminQrLoginEnabled()) {
      logApiSuccess(ctx, 404, { reason: "feature_disabled" });
      return jsonError(ctx, "QR login is disabled", { status: 404 });
    }

    const payload = await parseBody(request);
    const admin = createAdminClient();

    const requestIp = getClientIp(request);
    const nowMs = Date.now();
    let localWindow: LocalRateLimitWindowState | null = null;
    if (requestIp) {
      localWindow = localRateWindowByIp.get(requestIp) ?? { timestampsMs: [] };
      localWindow.timestampsMs = pruneWindowTimestamps(nowMs, localWindow.timestampsMs);

      if (localWindow.timestampsMs.length >= MAX_PENDING_PER_IP_PER_MINUTE) {
        const oldestMs = localWindow.timestampsMs[0] ?? nowMs;
        const retryAfterSeconds = Math.max(1, Math.ceil((oldestMs + RATE_LIMIT_WINDOW_MS - nowMs) / 1000));
        blockedIpCache.set(requestIp, { blockedUntilMs: nowMs + retryAfterSeconds * 1000 });
        logApiSuccess(ctx, 429, {
          reason: "rate_limited_local_window",
          requestIp,
          retryAfterSeconds,
          timingsMs,
        });
        return jsonError(ctx, "Too many QR requests. Please wait and try again.", {
          status: 429,
          headers: {
            "cache-control": "no-store",
            "retry-after": String(retryAfterSeconds),
          },
          details: { retryAfterSeconds },
        });
      }

      const cached = blockedIpCache.get(requestIp);
      if (cached && cached.blockedUntilMs > nowMs) {
        const retryAfterSeconds = Math.max(1, Math.ceil((cached.blockedUntilMs - nowMs) / 1000));
        logApiSuccess(ctx, 429, {
          reason: "rate_limited_cache",
          requestIp,
          retryAfterSeconds,
          timingsMs,
        });
        return jsonError(ctx, "Too many QR requests. Please wait and try again.", {
          status: 429,
          headers: {
            "cache-control": "no-store",
            "retry-after": String(retryAfterSeconds),
          },
          details: { retryAfterSeconds },
        });
      }

      // Avoid DB rate-check roundtrip for the first few requests in the local window.
      if (localWindow.timestampsMs.length < RATE_LIMIT_DB_CHECK_START_AT) {
        timingsMs["db.rateLimit.pendingByIpMs"] = 0;
      }
    }

    const challengeToken = generateQrSecret(32);
    const nonce = generateQrSecret(18);
    const expiresAt = new Date(Date.now() + env.ADMIN_QR_LOGIN_TTL_SECONDS * 1000).toISOString();
    const origin = new URL(request.url).origin;

    const { data: created, error: createError } = await measureMs(timingsMs, "db.challenge.createViaRpcMs", () =>
      admin
        .rpc("create_admin_qr_login_challenge", {
          p_challenge_token_hash: hashQrSecret(challengeToken),
          p_nonce: nonce,
          p_requested_by_ip: requestIp,
          p_requested_user_agent: getClientUserAgent(request),
          p_requested_device_label: payload.deviceLabel ?? null,
          p_expires_at: expiresAt,
          p_metadata_json: {
            route: ROUTE,
            source: "admin_login_page",
          },
          p_max_pending: MAX_PENDING_PER_IP_PER_MINUTE,
          p_window_seconds: Math.floor(RATE_LIMIT_WINDOW_MS / 1000),
        })
        .single<{
          challenge_id: string | null;
          challenge_nonce: string | null;
          challenge_status: string | null;
          challenge_expires_at: string | null;
          rate_limited: boolean;
          retry_after_seconds: number | null;
        }>(),
    );

    if (createError || !created) {
      const failure = createError ?? new Error("Unable to create challenge");
      if (isQrBackendUnavailableError(failure)) {
        logApiError(ctx, 503, failure, {
          route: ROUTE,
          reason: "qr_backend_unavailable",
          timingsMs,
          error: extractErrorMetadata(failure),
        });
        return jsonError(ctx, "QR login backend is temporarily unavailable", {
          status: 503,
          code: "qr_backend_unavailable",
        });
      }

      throw toError(failure, "Unable to create challenge");
    }

    if (created.rate_limited) {
      const retryAfterSeconds = Math.max(1, created.retry_after_seconds ?? 1);
      if (requestIp) {
        blockedIpCache.set(requestIp, {
          blockedUntilMs: nowMs + retryAfterSeconds * 1000,
        });
      }
      cleanupRateLimitCaches(nowMs);

      logApiSuccess(ctx, 429, {
        reason: "rate_limited_db",
        requestIp,
        retryAfterSeconds,
        timingsMs,
      });
      return jsonError(ctx, "Too many QR requests. Please wait and try again.", {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(retryAfterSeconds),
        },
        details: { retryAfterSeconds },
      });
    }

    if (!created.challenge_id || !created.challenge_nonce || !created.challenge_status || !created.challenge_expires_at) {
      throw new Error("Invalid challenge row from create_admin_qr_login_challenge");
    }

    const inserted = {
      id: created.challenge_id,
      nonce: created.challenge_nonce,
      status: created.challenge_status,
      expires_at: created.challenge_expires_at,
    };

    if (requestIp && localWindow) {
      localWindow.timestampsMs.push(nowMs);
      localRateWindowByIp.set(requestIp, localWindow);
      cleanupRateLimitCaches(nowMs);
    }

    const qr = buildQrPayload({
      challengeId: inserted.id,
      challengeToken,
      nonce: inserted.nonce,
      expiresAtIso: inserted.expires_at,
      origin,
      scheme: env.NEXT_PUBLIC_ADMIN_QR_SCHEME,
    });

    void writeAdminAuditEvent(ctx, {
      actionType: "admin_qr_login_challenge_created",
      metadata: {
        challengeId: inserted.id,
        expiresAt: inserted.expires_at,
      },
    });

    logApiSuccess(ctx, 201, { challengeId: inserted.id, timingsMs });
    const serverNow = new Date().toISOString();
    return jsonData(
      ctx,
      {
        challenge: {
          id: inserted.id,
          token: challengeToken,
          nonce: inserted.nonce,
          status: inserted.status,
          expiresAt: inserted.expires_at,
          qrPayload: qr.serialized,
          qrDeepLink: qr.deepLink,
          pollIntervalMs: env.NEXT_PUBLIC_ADMIN_QR_LOGIN_POLL_MS,
          serverNow,
        },
      },
      {
        status: 201,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return jsonError(ctx, "Invalid request payload", { status: 400 });
    }

    if (isQrBackendUnavailableError(error)) {
      logApiError(ctx, 503, error, {
        route: ROUTE,
        reason: "qr_backend_unavailable",
        timingsMs,
        error: extractErrorMetadata(error),
      });
      return jsonError(ctx, "QR login backend is temporarily unavailable", {
        status: 503,
        code: "qr_backend_unavailable",
      });
    }

    logApiError(ctx, 500, error, { route: ROUTE, timingsMs });
    return jsonError(ctx, "Unable to create QR login challenge", { status: 500 });
  }
}
