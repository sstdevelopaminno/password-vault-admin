import { z } from "zod";
import { getAdminAllowedRoles, isAdminQrLoginEnabled } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { getClientIp, getClientUserAgent, hashQrSecret } from "@/lib/qr-login";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/auth/qr/challenge/[challengeId]/exchange";

const requestSchema = z.object({
  token: z.string().min(20),
  nonce: z.string().min(8),
});

type ChallengeRow = {
  id: string;
  nonce: string;
  status: string;
  expires_at: string;
  approved_by_user_id: string | null;
  consumed_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string;
  role: string;
  status: string;
};

async function measureMs<T>(bucket: Record<string, number>, key: string, fn: () => PromiseLike<T> | T): Promise<T> {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    bucket[key] = Math.max(0, Date.now() - startedAt);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ challengeId: string }> },
) {
  const ctx = createApiRequestContext(request, ROUTE);
  const timingsMs: Record<string, number> = {};

  try {
    if (!isAdminQrLoginEnabled()) {
      logApiSuccess(ctx, 404, { reason: "feature_disabled", timingsMs });
      return jsonError(ctx, "QR login is disabled", { status: 404 });
    }

    const { challengeId } = await context.params;
    const payload = requestSchema.parse(await request.json());
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: challenge, error } = await measureMs(timingsMs, "db.challenge.selectMs", () =>
      admin
        .from("admin_qr_login_challenges")
        .select("id,nonce,status,expires_at,approved_by_user_id,consumed_at")
        .eq("id", challengeId)
        .eq("challenge_token_hash", hashQrSecret(payload.token))
        .maybeSingle<ChallengeRow>(),
    );

    if (error) {
      throw error;
    }

    if (!challenge || challenge.nonce !== payload.nonce) {
      logApiSuccess(ctx, 404, { reason: "challenge_not_found", timingsMs });
      return jsonError(ctx, "Challenge not found", { status: 404 });
    }

    if (challenge.status === "pending" && Date.parse(challenge.expires_at) <= Date.now()) {
      await measureMs(timingsMs, "db.challenge.expireMs", () =>
        admin
          .from("admin_qr_login_challenges")
          .update({ status: "expired", updated_at: nowIso })
          .eq("id", challenge.id)
          .eq("status", "pending"),
      );
      logApiSuccess(ctx, 409, { reason: "challenge_expired", challengeId: challenge.id, timingsMs });
      return jsonError(ctx, "Challenge expired", { status: 409 });
    }

    if (challenge.status !== "approved" || !challenge.approved_by_user_id) {
      logApiSuccess(ctx, 409, { reason: "challenge_not_approved", challengeId: challenge.id, timingsMs });
      return jsonError(ctx, "Challenge is not approved yet", { status: 409 });
    }

    if (challenge.consumed_at) {
      logApiSuccess(ctx, 409, { reason: "challenge_already_consumed", challengeId: challenge.id, timingsMs });
      return jsonError(ctx, "Challenge already consumed", { status: 409 });
    }

    const { data: approver, error: approverError } = await measureMs(timingsMs, "db.profiles.approverByIdMs", () =>
      admin
        .from("profiles")
        .select("id,email,role,status")
        .eq("id", challenge.approved_by_user_id)
        .single<ProfileRow>(),
    );

    if (approverError || !approver) {
      logApiSuccess(ctx, 404, { reason: "approver_profile_not_found", challengeId: challenge.id, timingsMs });
      return jsonError(ctx, "Approver profile not found", { status: 404 });
    }

    const allowedRoles = getAdminAllowedRoles();
    if (approver.status !== "active" || !allowedRoles.includes(approver.role)) {
      logApiSuccess(ctx, 403, { reason: "approver_forbidden", challengeId: challenge.id, timingsMs });
      return jsonError(ctx, "Approver has no admin access", { status: 403 });
    }

    const { data: magicLink, error: linkError } = await measureMs(timingsMs, "auth.generateMagicLinkMs", () =>
      admin.auth.admin.generateLink({
        type: "magiclink",
        email: approver.email,
      }),
    );

    if (linkError || !magicLink?.properties?.hashed_token) {
      throw linkError ?? new Error("Unable to create one-time sign-in token");
    }

    const { data: consumedChallenge, error: consumeError } = await measureMs(timingsMs, "db.challenge.consumeMs", () =>
      admin
        .from("admin_qr_login_challenges")
        .update({
          status: "consumed",
          consumed_at: nowIso,
          consumed_by_ip: getClientIp(request),
          consumed_user_agent: getClientUserAgent(request),
          updated_at: nowIso,
        })
        .eq("id", challenge.id)
        .eq("status", "approved")
        .is("consumed_at", null)
        .select("id")
        .maybeSingle(),
    );

    if (consumeError) {
      throw consumeError;
    }

    if (!consumedChallenge) {
      logApiSuccess(ctx, 409, { reason: "challenge_already_consumed", challengeId: challenge.id, timingsMs });
      return jsonError(ctx, "Challenge already consumed", { status: 409 });
    }

    void writeAdminAuditEvent(ctx, {
      actionType: "admin_qr_login_consumed",
      actorUserId: approver.id,
      metadata: { challengeId: challenge.id },
    });

    logApiSuccess(ctx, 200, { challengeId: challenge.id, userId: approver.id, timingsMs });
    return jsonData(
      ctx,
      {
        exchange: {
          tokenHash: magicLink.properties.hashed_token,
          type: "magiclink",
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      logApiSuccess(ctx, 400, { reason: "invalid_payload", timingsMs });
      return jsonError(ctx, "Invalid request payload", { status: 400 });
    }

    logApiError(ctx, 500, error, { route: ROUTE, timingsMs });
    return jsonError(ctx, "Unable to exchange QR login challenge", { status: 500 });
  }
}

