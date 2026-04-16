import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/admin/support-billing";

const patchSchema = z.object({
  userId: z.string().uuid(),
  packageType: z.enum(["free", "monthly", "annual"]).default("free"),
  paymentStatus: z.enum(["paid", "failed", "pending", "overdue"]).default("pending"),
  amount: z.number().nullable().optional(),
  currency: z.string().trim().max(12).default("THB"),
  expiresAt: z.string().nullable().optional(),
  renew: z.boolean().optional(),
});

type BillingMeta = {
  packageType: string;
  paymentStatus: string;
  amount: number | null;
  currency: string;
  expiresAt: string | null;
  updatedAt: string;
  renew: boolean;
};

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
      .select("target_user_id,metadata_json,created_at")
      .in("action_type", ["support_billing_updated", "support_billing_renewed"])
      .in("target_user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .limit(3000);

    if (logsError) {
      return jsonError(ctx, logsError.message, { status: 400 });
    }

    const latestByUser = new Map<string, BillingMeta>();
    for (const log of logs ?? []) {
      if (!log.target_user_id || latestByUser.has(log.target_user_id)) continue;
      const meta = (log.metadata_json ?? {}) as Record<string, unknown>;
      latestByUser.set(log.target_user_id, {
        packageType: typeof meta.packageType === "string" ? meta.packageType : "free",
        paymentStatus: typeof meta.paymentStatus === "string" ? meta.paymentStatus : "pending",
        amount: typeof meta.amount === "number" ? meta.amount : null,
        currency: typeof meta.currency === "string" ? meta.currency : "THB",
        expiresAt: typeof meta.expiresAt === "string" ? meta.expiresAt : null,
        updatedAt: log.created_at,
        renew: Boolean(meta.renew),
      });
    }

    const rows = (users ?? []).map((user) => {
      const meta = latestByUser.get(user.id);
      return {
        userId: user.id,
        userName: user.full_name ?? "-",
        userEmail: user.email ?? "-",
        packageType: meta?.packageType ?? "free",
        paymentStatus: meta?.paymentStatus ?? "pending",
        amount: meta?.amount ?? null,
        currency: meta?.currency ?? "THB",
        expiresAt: meta?.expiresAt ?? null,
        updatedAt: meta?.updatedAt ?? null,
      };
    });

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, { rows });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load billing monitor", { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const guard = await requireAdminApiContext(ctx, request);
    if (!guard.ok) {
      logApiSuccess(ctx, guard.response.status, { guard: "blocked" });
      return guard.response;
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(ctx, "Invalid payload", { status: 400 });
    }
    const payload = parsed.data;

    const expiresAt = payload.expiresAt && payload.expiresAt.trim() ? payload.expiresAt : null;
    const actionType = payload.renew ? "support_billing_renewed" : "support_billing_updated";
    const metadata = {
      packageType: payload.packageType,
      paymentStatus: payload.paymentStatus,
      amount: payload.amount ?? null,
      currency: payload.currency,
      expiresAt,
      renew: Boolean(payload.renew),
      updatedAt: new Date().toISOString(),
    };

    void writeAdminAuditEvent(ctx, {
      actionType,
      actorUserId: guard.value.authUser.id,
      targetUserId: payload.userId,
      metadata,
    });

    logApiSuccess(ctx, 200, { source: "native", actionType });
    return jsonData(ctx, {
      ok: true,
      message: payload.renew ? "Billing renewed successfully." : "Billing updated successfully.",
      metadata,
    });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to save billing update", { status: 500 });
  }
}
