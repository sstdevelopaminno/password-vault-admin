import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";

const ROUTE = "/api/health";

export async function GET(request: Request) {
  const ctx = createApiRequestContext(request, ROUTE);

  try {
    const payload = { ok: true, service: "password-vault-admin", now: new Date().toISOString() };
    logApiSuccess(ctx, 200);
    return jsonData(ctx, payload);
  } catch (error) {
    logApiError(ctx, 500, error);
    return jsonError(ctx, "Health check failed", { status: 500 });
  }
}
