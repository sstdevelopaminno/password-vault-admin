import { z } from "zod";
import { isAdminQrLoginEnabled } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { hashQrSecret } from "@/lib/qr-login";

const ROUTE = "/api/auth/qr/challenge/[challengeId]";

const querySchema = z.object({
  token: z.string().min(20),
  nonce: z.string().min(8),
});

type ChallengeRow = {
  id: string;
  nonce: string;
  status: string;
  expires_at: string;
  approved_at: string | null;
  approved_by_email: string | null;
  rejected_reason: string | null;
  consumed_at: string | null;
};

type PendingChallengeCacheEntry = {
  challenge: ChallengeRow;
  cachedAtMs: number;
};

const PENDING_CACHE_TTL_MS = 2_500;
const PENDING_CACHE_MAX_ENTRIES = 2_000;
const pendingChallengeCache = new Map<string, PendingChallengeCacheEntry>();

function makePendingCacheKey(challengeId: string, tokenHash: string, nonce: string) {
  return `${challengeId}:${tokenHash}:${nonce}`;
}

function cleanupPendingCache(nowMs: number) {
  if (pendingChallengeCache.size === 0) return;

  for (const [key, entry] of pendingChallengeCache.entries()) {
    if (nowMs - entry.cachedAtMs > PENDING_CACHE_TTL_MS) {
      pendingChallengeCache.delete(key);
    }
  }

  if (pendingChallengeCache.size <= PENDING_CACHE_MAX_ENTRIES) return;

  for (const key of pendingChallengeCache.keys()) {
    pendingChallengeCache.delete(key);
    if (pendingChallengeCache.size <= PENDING_CACHE_MAX_ENTRIES) break;
  }
}

async function measureMs<T>(bucket: Record<string, number>, key: string, fn: () => PromiseLike<T> | T): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    bucket[key] = Math.max(0, Date.now() - startedAt);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ challengeId: string }> },
) {
  const ctx = createApiRequestContext(request, ROUTE);
  const timingsMs: Record<string, number> = {};

  try {
    if (!isAdminQrLoginEnabled()) {
      return jsonError(ctx, "QR login is disabled", { status: 404 });
    }

    const { challengeId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      token: url.searchParams.get("token"),
      nonce: url.searchParams.get("nonce"),
    });

    const admin = createAdminClient();
    const tokenHash = hashQrSecret(parsed.token);
    const cacheKey = makePendingCacheKey(challengeId, tokenHash, parsed.nonce);
    const nowMs = Date.now();
    cleanupPendingCache(nowMs);
    const cachedPending = pendingChallengeCache.get(cacheKey);

    if (cachedPending && nowMs - cachedPending.cachedAtMs <= PENDING_CACHE_TTL_MS) {
      const cachedChallenge = cachedPending.challenge;
      if (cachedChallenge.status === "pending" && Date.parse(cachedChallenge.expires_at) > nowMs) {
        timingsMs["cache.pendingHitMs"] = 0;
        logApiSuccess(ctx, 200, { challengeId: cachedChallenge.id, status: "pending", cacheHit: true, timingsMs });
        const serverNow = new Date().toISOString();
        return jsonData(
          ctx,
          {
            serverNow,
            challenge: {
              id: cachedChallenge.id,
              status: "pending",
              expiresAt: cachedChallenge.expires_at,
              approvedAt: cachedChallenge.approved_at,
              approvedByEmail: cachedChallenge.approved_by_email,
              rejectedReason: cachedChallenge.rejected_reason,
              consumedAt: cachedChallenge.consumed_at,
            },
          },
          { headers: { "cache-control": "no-store" } },
        );
      }

      pendingChallengeCache.delete(cacheKey);
    }

    const { data: challenge, error } = await measureMs(timingsMs, "db.challenge.selectMs", () =>
      admin
        .from("admin_qr_login_challenges")
        .select("id,nonce,status,expires_at,approved_at,approved_by_email,rejected_reason,consumed_at")
        .eq("id", challengeId)
        .eq("challenge_token_hash", tokenHash)
        .maybeSingle<ChallengeRow>(),
    );

    if (error) {
      throw error;
    }

    if (!challenge || challenge.nonce !== parsed.nonce) {
      pendingChallengeCache.delete(cacheKey);
      logApiSuccess(ctx, 404, { reason: "challenge_not_found", timingsMs });
      return jsonError(ctx, "Challenge not found", { status: 404 });
    }

    let status = challenge.status;
    if (status === "pending" && Date.parse(challenge.expires_at) <= Date.now()) {
      const { error: expireError } = await measureMs(timingsMs, "db.challenge.expireMs", () =>
        admin
          .from("admin_qr_login_challenges")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", challenge.id)
          .eq("status", "pending"),
      );

      if (!expireError) {
        status = "expired";
      }
    }

    if (status === "pending" && Date.parse(challenge.expires_at) > Date.now()) {
      pendingChallengeCache.set(cacheKey, {
        challenge: {
          ...challenge,
          status,
        },
        cachedAtMs: Date.now(),
      });
    } else {
      pendingChallengeCache.delete(cacheKey);
    }

    logApiSuccess(ctx, 200, { challengeId: challenge.id, status, timingsMs });
    const serverNow = new Date().toISOString();
    return jsonData(
      ctx,
      {
        serverNow,
        challenge: {
          id: challenge.id,
          status,
          expiresAt: challenge.expires_at,
          approvedAt: challenge.approved_at,
          approvedByEmail: challenge.approved_by_email,
          rejectedReason: challenge.rejected_reason,
          consumedAt: challenge.consumed_at,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(ctx, "Invalid challenge credentials", { status: 400 });
    }

    logApiError(ctx, 500, error, { route: ROUTE, timingsMs });
    return jsonError(ctx, "Unable to resolve QR challenge", { status: 500 });
  }
}

