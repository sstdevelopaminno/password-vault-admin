import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/admin/support-ui-check";
const GENERAL_ROLES = new Set(["pending", "user"]);

const postSchema = z.object({
  userId: z.string().min(1),
  lookup: z.string().trim().max(160).optional(),
});

function parseLimit(value: string | null, fallback = 120, max = 300) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
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
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const keywordRaw = (url.searchParams.get("q") ?? "").trim();
    const keyword = keywordRaw.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim();

    let query = admin
      .from("profiles")
      .select("id,email,full_name,role,status,created_at")
      .in("role", ["pending", "user"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (keyword) {
      query = query.or(`full_name.ilike.%${keyword}%,email.ilike.%${keyword}%`);
    }

    const { data, error } = await query;
    if (error) {
      return jsonError(ctx, error.message, { status: 400 });
    }

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, { users: data ?? [] });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load UI check users", { status: 500 });
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

    const payload = postSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: user, error } = await admin
      .from("profiles")
      .select("id,role")
      .eq("id", payload.userId)
      .maybeSingle();

    if (error || !user) {
      return jsonError(ctx, "User not found", { status: 404 });
    }
    if (!GENERAL_ROLES.has((user.role ?? "").toLowerCase())) {
      return jsonError(ctx, "UI check supports general users only", { status: 400 });
    }

    const timestamp = new Date().toISOString();
    void writeAdminAuditEvent(ctx, {
      actionType: "support_ui_check_opened",
      actorUserId: guard.value.authUser.id,
      targetUserId: user.id,
      metadata: {
        lookup: payload.lookup ?? null,
        timestamp,
        source: "support_ui_check_workspace",
      },
    });

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, { ok: true, message: "UI check logged", timestamp });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(ctx, "Invalid payload", { status: 400 });
    }

    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to log UI check", { status: 500 });
  }
}

