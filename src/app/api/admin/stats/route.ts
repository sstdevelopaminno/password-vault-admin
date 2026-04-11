import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/admin/stats";

const statsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  adminUsers: z.number().int().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  reviewedApprovals24h: z.number().int().nonnegative(),
  recentSensitiveActions24h: z.number().int().nonnegative(),
});

type StatsPayload = z.infer<typeof statsSchema>;

let nativeCache: { expiresAt: number; payload: StatsPayload } | null = null;

async function fetchNativeStats(): Promise<StatsPayload> {
  const admin = createAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [usersRes, activeUsersRes, adminsRes, pendingApprovalsRes, reviewedTodayRes, logsRes] =
    await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("role", ["admin", "super_admin", "approver"]),
      admin
        .from("approval_requests")
        .select("id", { count: "exact", head: true })
        .eq("request_status", "pending"),
      admin
        .from("approval_requests")
        .select("id", { count: "exact", head: true })
        .gte("reviewed_at", since24h),
      admin.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    ]);

  const firstError = [
    usersRes.error,
    activeUsersRes.error,
    adminsRes.error,
    pendingApprovalsRes.error,
    reviewedTodayRes.error,
    logsRes.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  return statsSchema.parse({
    totalUsers: usersRes.count ?? 0,
    activeUsers: activeUsersRes.count ?? 0,
    adminUsers: adminsRes.count ?? 0,
    pendingApprovals: pendingApprovalsRes.count ?? 0,
    reviewedApprovals24h: reviewedTodayRes.count ?? 0,
    recentSensitiveActions24h: logsRes.count ?? 0,
  });
}

async function tryFetchLegacyStats(request: Request): Promise<StatsPayload | null> {
  if (!env.LEGACY_PASSWORD_VAULT_API_BASE_URL) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LEGACY_PASSWORD_VAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.LEGACY_PASSWORD_VAULT_API_BASE_URL}/api/admin/stats`, {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    return statsSchema.parse(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const guard = await requireAdminApiContext(ctx);
    if (!guard.ok) {
      logApiSuccess(ctx, guard.response.status, { guard: "blocked" });
      return guard.response;
    }

    const now = Date.now();
    const cacheMs = env.ADMIN_STATS_CACHE_MS;
    const shouldTryLegacy = env.ADMIN_API_SOURCE === "legacy";

    if (!shouldTryLegacy && nativeCache && now < nativeCache.expiresAt) {
      logApiSuccess(ctx, 200, { cache: "hit", source: "native" });
      return jsonData(ctx, nativeCache.payload, {
        headers: { "x-stats-cache": "hit", "x-stats-source": "native" },
      });
    }

    let payload: StatsPayload | null = null;
    let source: "native" | "legacy" | "native_fallback" = "native";

    if (shouldTryLegacy) {
      payload = await tryFetchLegacyStats(request);
      if (payload) {
        source = "legacy";
      } else {
        source = "native_fallback";
      }
    }

    if (!payload) {
      payload = await fetchNativeStats();
      nativeCache = {
        payload,
        expiresAt: now + cacheMs,
      };
    }

    void writeAdminAuditEvent(ctx, {
      actionType: "admin_stats_viewed",
      actorUserId: guard.value.authUser.id,
      metadata: { source },
    });

    logApiSuccess(ctx, 200, {
      cache: source === "native" ? "miss" : "bypass",
      source,
    });

    return jsonData(ctx, payload, {
      headers: {
        "x-stats-cache": source === "native" ? "miss" : "bypass",
        "x-stats-source": source,
      },
    });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load admin stats", { status: 500 });
  }
}
