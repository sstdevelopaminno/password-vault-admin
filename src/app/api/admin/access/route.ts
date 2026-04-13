import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData } from "@/lib/api/response";
import { logApiSuccess } from "@/lib/api/observability";
import { requireAdminApiContext } from "@/lib/admin-api";

const ROUTE = "/api/admin/access";

export async function GET(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);
  const guard = await requireAdminApiContext(ctx, request);

  if (!guard.ok) {
    logApiSuccess(ctx, guard.response.status, {
      guard: "blocked",
      authSource: guard.profiling.authSource,
      guardDurationMs: guard.profiling.guardDurationMs,
      timingsMs: guard.profiling.timingsMs,
    });
    return guard.response;
  }

  logApiSuccess(ctx, 200, {
    guard: "ok",
    authSource: guard.profiling.authSource,
    guardDurationMs: guard.profiling.guardDurationMs,
    timingsMs: guard.profiling.timingsMs,
  });
  return jsonData(
    ctx,
    {
      ok: true,
      profile: {
        id: guard.value.profile.id,
        role: guard.value.profile.role,
        status: guard.value.profile.status,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
