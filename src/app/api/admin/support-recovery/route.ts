import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/admin/support-recovery";

const ACTION_TO_EVENT: Record<string, string> = {
  request: "support_recovery_requested",
  verify_otp: "support_recovery_otp_verified",
  complete: "support_recovery_completed",
  reject: "support_recovery_rejected",
  cancel_delete: "support_delete_cancelled",
};

const postSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["request", "verify_otp", "complete", "reject", "cancel_delete"]),
  otpCode: z.string().trim().optional(),
  note: z.string().trim().max(500).optional(),
});

type RecoveryStatus = "idle" | "requested" | "otp_verified" | "completed" | "rejected";

type RecoveryRow = {
  userId: string;
  userName: string;
  userEmail: string;
  status: RecoveryStatus;
  lastActionAt: string | null;
  note: string | null;
};

function statusFromEvent(actionType: string): RecoveryStatus {
  if (actionType === "support_recovery_requested") return "requested";
  if (actionType === "support_recovery_otp_verified") return "otp_verified";
  if (actionType === "support_recovery_completed") return "completed";
  if (actionType === "support_recovery_rejected") return "rejected";
  if (actionType === "support_delete_cancelled") return "requested";
  return "idle";
}

export async function GET(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const guard = await requireAdminApiContext(ctx, request);
    if (!guard.ok) {
      logApiSuccess(ctx, guard.response.status, { guard: "blocked" });
      return guard.response;
    }

    const admin = createAdminClient();
    const { data: users, error: usersError } = await admin
      .from("profiles")
      .select("id,full_name,email,created_at")
      .in("role", ["pending", "user"])
      .order("created_at", { ascending: false })
      .limit(300);

    if (usersError) {
      return jsonError(ctx, usersError.message, { status: 400 });
    }

    const userIds = (users ?? []).map((user) => user.id);
    const { data: logs, error: logsError } = await admin
      .from("audit_logs")
      .select("target_user_id,action_type,metadata_json,created_at")
      .in("action_type", Object.values(ACTION_TO_EVENT))
      .in("target_user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .limit(4000);

    if (logsError) {
      return jsonError(ctx, logsError.message, { status: 400 });
    }

    const latestByUser = new Map<string, { status: RecoveryStatus; createdAt: string; note: string | null }>();
    for (const log of logs ?? []) {
      if (!log.target_user_id || latestByUser.has(log.target_user_id)) continue;
      const meta = (log.metadata_json ?? {}) as Record<string, unknown>;
      latestByUser.set(log.target_user_id, {
        status: statusFromEvent(log.action_type),
        createdAt: log.created_at,
        note: typeof meta.note === "string" ? meta.note : null,
      });
    }

    const rows: RecoveryRow[] = (users ?? []).map((user) => {
      const latest = latestByUser.get(user.id);
      return {
        userId: user.id,
        userName: user.full_name ?? "-",
        userEmail: user.email ?? "-",
        status: latest?.status ?? "idle",
        lastActionAt: latest?.createdAt ?? null,
        note: latest?.note ?? null,
      };
    });

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, { rows });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load recovery queue", { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const guard = await requireAdminApiContext(ctx, request);
    if (!guard.ok) {
      logApiSuccess(ctx, guard.response.status, { guard: "blocked" });
      return guard.response;
    }

    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(ctx, "Invalid payload", { status: 400 });
    }
    const payload = parsed.data;
    if (payload.action === "verify_otp") {
      const otp = payload.otpCode?.trim() ?? "";
      if (!/^\d{6}$/.test(otp)) {
        return jsonError(ctx, "OTP must be a 6-digit code", { status: 400 });
      }
    }

    const actionType = ACTION_TO_EVENT[payload.action];
    const metadata = {
      note: payload.note ?? null,
      otpValidated: payload.action === "verify_otp",
      otpCodeLast2: payload.otpCode ? payload.otpCode.slice(-2) : null,
      processedAt: new Date().toISOString(),
    };

    void writeAdminAuditEvent(ctx, {
      actionType,
      actorUserId: guard.value.authUser.id,
      targetUserId: payload.userId,
      metadata,
    });

    const messageMap: Record<z.infer<typeof postSchema>["action"], string> = {
      request: "Recovery request created.",
      verify_otp: "OTP verification recorded.",
      complete: "Recovery completed successfully.",
      reject: "Recovery request rejected.",
      cancel_delete: "Account deletion cancellation recorded.",
    };

    logApiSuccess(ctx, 200, { source: "native", actionType });
    return jsonData(ctx, {
      ok: true,
      message: messageMap[payload.action],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to process recovery action", { status: 500 });
  }
}
