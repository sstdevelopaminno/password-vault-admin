import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/admin/support-user-insights";

const querySchema = z.object({
  userId: z.string().uuid(),
});

function monthsSince(createdAt: string) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  const now = new Date();
  const months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
  return Math.max(0, months);
}

export async function GET(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const guard = await requireAdminApiContext(ctx, request);
    if (!guard.ok) {
      logApiSuccess(ctx, guard.response.status, { guard: "blocked" });
      return guard.response;
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      userId: url.searchParams.get("userId"),
    });
    if (!parsed.success) {
      return jsonError(ctx, "userId is required", { status: 400 });
    }

    const admin = createAdminClient();
    const userId = parsed.data.userId;

    const [{ data: profile, error: profileError }, { count: vaultItemsCount }, { count: supportTicketCount }, { count: openIssueCount }, { count: copyActionCount }, { count: pinIssueCount }, { count: uiIssueCount }, { data: activities, error: activityError }, { data: latestBilling }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("id,email,full_name,role,status,created_at")
          .eq("id", userId)
          .maybeSingle(),
        admin.from("vault_items").select("*", { count: "exact", head: true }).eq("owner_user_id", userId),
        admin.from("support_tickets").select("*", { count: "exact", head: true }).eq("user_id", userId),
        admin.from("support_tickets").select("*", { count: "exact", head: true }).eq("user_id", userId).in("status", ["open", "in_progress"]),
        admin.from("audit_logs").select("*", { count: "exact", head: true }).eq("target_user_id", userId).ilike("action_type", "%copy%"),
        admin.from("audit_logs").select("*", { count: "exact", head: true }).eq("target_user_id", userId).ilike("action_type", "%pin%"),
        admin
          .from("support_tickets")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .or("category.ilike.%ui%,subject.ilike.%ui%,message.ilike.%ui%,message.ilike.%freeze%,message.ilike.%ค้าง%"),
        admin
          .from("audit_logs")
          .select("id,action_type,created_at,metadata_json")
          .eq("target_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(12),
        admin
          .from("audit_logs")
          .select("metadata_json,created_at")
          .eq("target_user_id", userId)
          .in("action_type", ["support_billing_updated", "support_billing_renewed"])
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    if (profileError || !profile) {
      return jsonError(ctx, "User not found", { status: 404 });
    }
    if (activityError) {
      return jsonError(ctx, activityError.message, { status: 400 });
    }

    const latestBillingMeta = (latestBilling?.[0]?.metadata_json ?? {}) as Record<string, unknown>;
    const packageType = typeof latestBillingMeta.packageType === "string" ? latestBillingMeta.packageType : "free";
    const paymentStatus = typeof latestBillingMeta.paymentStatus === "string" ? latestBillingMeta.paymentStatus : "free";
    const expiresAt = typeof latestBillingMeta.expiresAt === "string" ? latestBillingMeta.expiresAt : null;
    const accountAgeMonths = monthsSince(profile.created_at);
    const accountAgeText = `${Math.floor(accountAgeMonths / 12)}y ${accountAgeMonths % 12}m`;

    void writeAdminAuditEvent(ctx, {
      actionType: "support_user_insight_viewed",
      actorUserId: guard.value.authUser.id,
      targetUserId: userId,
      metadata: { viewedAt: new Date().toISOString() },
    });

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, {
      profile: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        status: profile.status,
        createdAt: profile.created_at,
      },
      usage: {
        accountAgeMonths,
        accountAgeText,
        vaultItemsCount: vaultItemsCount ?? 0,
        supportTicketCount: supportTicketCount ?? 0,
        openIssueCount: openIssueCount ?? 0,
        copyActionCount: copyActionCount ?? 0,
        pinIssueCount: pinIssueCount ?? 0,
        uiIssueCount: uiIssueCount ?? 0,
      },
      plan: {
        packageType,
        paymentStatus,
        expiresAt,
        lastUpdatedAt: latestBilling?.[0]?.created_at ?? null,
      },
      recentActivities: (activities ?? []).map((row) => ({
        id: row.id,
        actionType: row.action_type,
        createdAt: row.created_at,
        metadata: row.metadata_json ?? {},
      })),
    });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load support user insight", { status: 500 });
  }
}
