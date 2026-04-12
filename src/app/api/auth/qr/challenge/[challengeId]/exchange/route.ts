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

export async function POST(
  request: Request,
  context: { params: Promise<{ challengeId: string }> },
) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    if (!isAdminQrLoginEnabled()) {
      return jsonError(ctx, "QR login is disabled", { status: 404 });
    }

    const { challengeId } = await context.params;
    const payload = requestSchema.parse(await request.json());
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: challenge, error } = await admin
      .from("admin_qr_login_challenges")
      .select("id,nonce,status,expires_at,approved_by_user_id,consumed_at")
      .eq("id", challengeId)
      .eq("challenge_token_hash", hashQrSecret(payload.token))
      .maybeSingle<ChallengeRow>();

    if (error) {
      throw error;
    }

    if (!challenge || challenge.nonce !== payload.nonce) {
      return jsonError(ctx, "Challenge not found", { status: 404 });
    }

    if (challenge.status === "pending" && Date.parse(challenge.expires_at) <= Date.now()) {
      await admin
        .from("admin_qr_login_challenges")
        .update({ status: "expired", updated_at: nowIso })
        .eq("id", challenge.id)
        .eq("status", "pending");
      return jsonError(ctx, "Challenge expired", { status: 409 });
    }

    if (challenge.status !== "approved" || !challenge.approved_by_user_id) {
      return jsonError(ctx, "Challenge is not approved yet", { status: 409 });
    }

    if (challenge.consumed_at) {
      return jsonError(ctx, "Challenge already consumed", { status: 409 });
    }

    const { data: approver, error: approverError } = await admin
      .from("profiles")
      .select("id,email,role,status")
      .eq("id", challenge.approved_by_user_id)
      .single<ProfileRow>();

    if (approverError || !approver) {
      return jsonError(ctx, "Approver profile not found", { status: 404 });
    }

    const allowedRoles = getAdminAllowedRoles();
    if (approver.status !== "active" || !allowedRoles.includes(approver.role)) {
      return jsonError(ctx, "Approver has no admin access", { status: 403 });
    }

    const { data: magicLink, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: approver.email,
    });

    if (linkError || !magicLink?.properties?.hashed_token) {
      throw linkError ?? new Error("Unable to create one-time sign-in token");
    }

    const { data: consumedChallenge, error: consumeError } = await admin
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
      .maybeSingle();

    if (consumeError) {
      throw consumeError;
    }

    if (!consumedChallenge) {
      return jsonError(ctx, "Challenge already consumed", { status: 409 });
    }

    void writeAdminAuditEvent(ctx, {
      actionType: "admin_qr_login_consumed",
      actorUserId: approver.id,
      metadata: { challengeId: challenge.id },
    });

    logApiSuccess(ctx, 200, { challengeId: challenge.id, userId: approver.id });
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
    if (error instanceof z.ZodError) {
      return jsonError(ctx, "Invalid request payload", { status: 400 });
    }

    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to exchange QR login challenge", { status: 500 });
  }
}
