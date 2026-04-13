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

