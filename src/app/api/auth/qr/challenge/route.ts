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

const requestSchema = z.object({
  deviceLabel: z.string().trim().min(1).max(120).optional(),
});

async function expirePendingChallenges() {
  const admin = createAdminClient();
  await admin
    .from("admin_qr_login_challenges")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

async function parseBody(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return {};
  }

  return requestSchema.parse(JSON.parse(raw));
}

export async function POST(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    if (!isAdminQrLoginEnabled()) {
      logApiSuccess(ctx, 404, { reason: "feature_disabled" });
      return jsonError(ctx, "QR login is disabled", { status: 404 });
    }

    const payload = await parseBody(request);
    const admin = createAdminClient();

    await expirePendingChallenges();

    const requestIp = getClientIp(request);
    if (requestIp) {
      const nowMs = Date.now();
      const sinceIso = new Date(nowMs - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count, error } = await admin
        .from("admin_qr_login_challenges")
        .select("id", { head: true, count: "exact" })
        .eq("status", "pending")
        .eq("requested_by_ip", requestIp)
        .gte("created_at", sinceIso);

      if (error) {
        throw error;
      }

      if ((count ?? 0) >= MAX_PENDING_PER_IP_PER_MINUTE) {
        const { data: oldestPending, error: oldestError } = await admin
          .from("admin_qr_login_challenges")
          .select("created_at")
          .eq("status", "pending")
          .eq("requested_by_ip", requestIp)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle<{ created_at: string }>();

        if (oldestError) {
          throw oldestError;
        }

        const oldestCreatedAtMs = oldestPending ? Date.parse(oldestPending.created_at) : nowMs;
        const elapsedMs = Math.max(0, nowMs - oldestCreatedAtMs);
        const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsedMs) / 1000));

        logApiSuccess(ctx, 429, {
          reason: "rate_limited",
          requestIp,
          retryAfterSeconds,
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
    }

    const challengeToken = generateQrSecret(32);
    const nonce = generateQrSecret(18);
    const expiresAt = new Date(Date.now() + env.ADMIN_QR_LOGIN_TTL_SECONDS * 1000).toISOString();
    const origin = new URL(request.url).origin;

    const { data: inserted, error: insertError } = await admin
      .from("admin_qr_login_challenges")
      .insert({
        challenge_token_hash: hashQrSecret(challengeToken),
        nonce,
        status: "pending",
        requested_by_ip: requestIp,
        requested_user_agent: getClientUserAgent(request),
        requested_device_label: payload.deviceLabel ?? null,
        expires_at: expiresAt,
        metadata_json: {
          route: ROUTE,
          source: "admin_login_page",
        },
      })
      .select("id,nonce,status,expires_at")
      .single<{
        id: string;
        nonce: string;
        status: string;
        expires_at: string;
      }>();

    if (insertError || !inserted) {
      throw insertError ?? new Error("Unable to create challenge");
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

    logApiSuccess(ctx, 201, { challengeId: inserted.id });
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

    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to create QR login challenge", { status: 500 });
  }
}
