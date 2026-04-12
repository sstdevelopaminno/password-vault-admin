import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { env, getAdminAllowedRoles } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { hashQrSecret } from "@/lib/qr-login";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/integrations/qr-login/approve";

const payloadSchema = z.object({
  challengeId: z.string().uuid(),
  challengeToken: z.string().min(20),
  nonce: z.string().min(8),
  userAccessToken: z.string().min(20),
  decision: z.enum(["approve", "reject"]).default("approve"),
  reason: z.string().trim().min(3).max(200).optional(),
  appInstanceId: z.string().trim().min(1).max(120).optional(),
});

type ProfileRow = {
  id: string;
  email: string;
  role: string;
  status: string;
};

type ChallengeRow = {
  id: string;
  status: string;
  expires_at: string;
};

function hasValidIntegrationSecret(request: Request) {
  const expected = env.ADMIN_QR_LOGIN_INTEGRATION_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return false;

  const provided = header.slice("bearer ".length).trim();
  if (!provided) return false;

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    if (!env.ADMIN_QR_LOGIN_INTEGRATION_SECRET) {
      return jsonError(ctx, "QR integration is not configured", { status: 503 });
    }

    if (!hasValidIntegrationSecret(request)) {
      logApiSuccess(ctx, 401, { reason: "invalid_integration_secret" });
      return jsonError(ctx, "Unauthorized integration", { status: 401 });
    }

    const payload = payloadSchema.parse(await request.json());
    const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(payload.userAccessToken);

    if (userError || !user) {
      logApiSuccess(ctx, 401, { reason: "invalid_user_token" });
      return jsonError(ctx, "Invalid user token", { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,email,role,status")
      .eq("id", user.id)
      .single<ProfileRow>();

    if (profileError || !profile) {
      return jsonError(ctx, "Profile not found", { status: 404 });
    }

    const allowedRoles = getAdminAllowedRoles();
    if (profile.status !== "active" || !allowedRoles.includes(profile.role)) {
      return jsonError(ctx, "User has no admin QR approval permission", { status: 403 });
    }

    const nowIso = new Date().toISOString();
    const challengeHash = hashQrSecret(payload.challengeToken);

    const { data: challenge, error: challengeError } = await admin
      .from("admin_qr_login_challenges")
      .select("id,status,expires_at")
      .eq("id", payload.challengeId)
      .eq("challenge_token_hash", challengeHash)
      .eq("nonce", payload.nonce)
      .maybeSingle<ChallengeRow>();

    if (challengeError) {
      throw challengeError;
    }

    if (!challenge) {
      return jsonError(ctx, "Challenge not found", { status: 404 });
    }

    if (Date.parse(challenge.expires_at) <= Date.now()) {
      await admin
        .from("admin_qr_login_challenges")
        .update({ status: "expired", updated_at: nowIso })
        .eq("id", challenge.id)
        .eq("status", "pending");
      return jsonError(ctx, "Challenge expired", { status: 409 });
    }

    if (challenge.status !== "pending") {
      return jsonError(ctx, `Challenge is already ${challenge.status}`, { status: 409 });
    }

    const nextStatus = payload.decision === "reject" ? "rejected" : "approved";
    const { data: updatedChallenge, error: updateError } = await admin
      .from("admin_qr_login_challenges")
      .update({
        status: nextStatus,
        approved_by_user_id: profile.id,
        approved_by_email: profile.email,
        approved_at: nowIso,
        rejected_reason: payload.decision === "reject" ? payload.reason ?? "Rejected by approver" : null,
        updated_at: nowIso,
        metadata_json: {
          source: "user_app_confirmation",
          appInstanceId: payload.appInstanceId ?? null,
          decision: payload.decision,
        },
      })
      .eq("id", challenge.id)
      .eq("status", "pending")
      .select("id,status")
      .maybeSingle<{ id: string; status: string }>();

    if (updateError) {
      throw updateError;
    }

    if (!updatedChallenge) {
      return jsonError(ctx, "Challenge already handled", { status: 409 });
    }

    void writeAdminAuditEvent(ctx, {
      actionType: payload.decision === "reject" ? "admin_qr_login_rejected" : "admin_qr_login_approved",
      actorUserId: profile.id,
      metadata: {
        challengeId: challenge.id,
        decision: payload.decision,
        appInstanceId: payload.appInstanceId ?? null,
      },
    });

    logApiSuccess(ctx, 200, { challengeId: challenge.id, decision: payload.decision, userId: profile.id });
    return jsonData(
      ctx,
      {
        ok: true,
        challenge: {
          id: challenge.id,
          status: updatedChallenge.status,
          approvedBy: {
            userId: profile.id,
            email: profile.email,
            role: profile.role,
          },
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(ctx, "Invalid request payload", { status: 400 });
    }

    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to process QR login approval", { status: 500 });
  }
}
