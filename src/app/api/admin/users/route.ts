import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/admin/users";

const patchPayloadSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["pending", "user", "approver", "admin", "super_admin"]).optional(),
  status: z.enum(["pending_approval", "active", "disabled"]).optional(),
  fullName: z.string().trim().min(1).max(120).optional(),
});

function parseLimit(raw: string | null, fallback = 50, max = 100) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function decodeCursor(raw: string | null): { created_at: string; id: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.created_at !== "string" || typeof parsed?.id !== "string") return null;
    return { created_at: parsed.created_at, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(value: { created_at: string; id: string }) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function proxyLegacyUsers(ctx: ReturnType<typeof createApiRequestContext>, request: Request, method: string) {
  if (!env.LEGACY_PASSWORD_VAULT_API_BASE_URL) {
    return null;
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${env.LEGACY_PASSWORD_VAULT_API_BASE_URL}/api/admin/users`);
  sourceUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LEGACY_PASSWORD_VAULT_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl.toString(), {
      method,
      headers: {
        cookie: request.headers.get("cookie") ?? "",
        "content-type": request.headers.get("content-type") ?? "application/json",
      },
      body: method === "GET" || method === "DELETE" ? undefined : await request.text(),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json().catch(() => ({ error: "Legacy response parse failed" }))) as Record<
      string,
      unknown
    >;

    return jsonData(ctx, body, {
      status: response.status,
      headers: { "x-users-source": "legacy" },
    });
  } catch (error) {
    logApiError(ctx, 502, error, { route: ROUTE, mode: "legacy_proxy_failed", method });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const guard = await requireAdminApiContext(ctx, request);
    if (!guard.ok) {
      logApiSuccess(ctx, guard.response.status, { guard: "blocked" });
      return guard.response;
    }

    if (env.ADMIN_API_SOURCE === "legacy") {
      const legacyResponse = await proxyLegacyUsers(ctx, request, "GET");
      if (legacyResponse) {
        logApiSuccess(ctx, legacyResponse.status, { source: "legacy" });
        return legacyResponse;
      }
    }

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursor = decodeCursor(url.searchParams.get("cursor"));

    const admin = createAdminClient();
    let query = admin
      .from("profiles")
      .select("id,email,full_name,role,status,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      logApiError(ctx, 400, error, { route: ROUTE });
      return jsonError(ctx, error.message, { status: 400 });
    }

    const users = data ?? [];
    const hasMore = users.length > limit;
    const currentPage = users.slice(0, limit);
    const last = currentPage[currentPage.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            created_at: new Date(last.created_at).toISOString(),
            id: String(last.id),
          })
        : null;

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(
      ctx,
      { users: currentPage, pagination: { limit, hasMore, nextCursor } },
      { headers: { "x-users-source": "native" } },
    );
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load users", { status: 500 });
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

    if (env.ADMIN_API_SOURCE === "legacy") {
      const legacyResponse = await proxyLegacyUsers(ctx, request, "PATCH");
      if (legacyResponse) {
        logApiSuccess(ctx, legacyResponse.status, { source: "legacy" });
        return legacyResponse;
      }

      return jsonError(ctx, "Legacy users backend unavailable", { status: 502 });
    }

    const payload = patchPayloadSchema.parse(await request.json());
    const updates: Record<string, string> = {};
    if (payload.role) updates.role = payload.role;
    if (payload.status) updates.status = payload.status;
    if (payload.fullName) updates.full_name = payload.fullName;

    if (!Object.keys(updates).length) {
      return jsonError(ctx, "No updates provided", { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update(updates).eq("id", payload.userId);
    if (error) {
      logApiError(ctx, 400, error, { route: ROUTE });
      return jsonError(ctx, error.message, { status: 400 });
    }

    void writeAdminAuditEvent(ctx, {
      actionType: "admin_user_updated",
      actorUserId: guard.value.authUser.id,
      targetUserId: payload.userId,
      metadata: { updates },
    });

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, { ok: true }, { headers: { "x-users-source": "native" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(ctx, "Invalid payload", { status: 400 });
    }

    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to update user", { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const guard = await requireAdminApiContext(ctx, request);
    if (!guard.ok) {
      logApiSuccess(ctx, guard.response.status, { guard: "blocked" });
      return guard.response;
    }

    if (env.ADMIN_API_SOURCE === "legacy") {
      const legacyResponse = await proxyLegacyUsers(ctx, request, "DELETE");
      if (legacyResponse) {
        logApiSuccess(ctx, legacyResponse.status, { source: "legacy" });
        return legacyResponse;
      }

      return jsonError(ctx, "Legacy users backend unavailable", { status: 502 });
    }

    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) {
      return jsonError(ctx, "userId is required", { status: 400 });
    }
    if (userId === guard.value.authUser.id) {
      return jsonError(ctx, "Cannot delete yourself", { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      logApiError(ctx, 400, error, { route: ROUTE });
      return jsonError(ctx, error.message, { status: 400 });
    }

    void writeAdminAuditEvent(ctx, {
      actionType: "admin_user_deleted",
      actorUserId: guard.value.authUser.id,
      targetUserId: userId,
    });

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, { ok: true }, { headers: { "x-users-source": "native" } });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to delete user", { status: 500 });
  }
}
