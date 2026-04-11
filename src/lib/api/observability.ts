import type { ApiRequestContext } from "@/lib/api/request-context";

function durationMs(startedAtMs: number) {
  return Math.max(0, Date.now() - startedAtMs);
}

export function logApiSuccess(ctx: ApiRequestContext, status: number, metadata?: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      level: "info",
      event: "api_request",
      route: ctx.route,
      method: ctx.method,
      status,
      requestId: ctx.requestId,
      source: ctx.source,
      durationMs: durationMs(ctx.startedAtMs),
      metadata: metadata ?? {},
    }),
  );
}

export function logApiError(
  ctx: ApiRequestContext,
  status: number,
  error: unknown,
  metadata?: Record<string, unknown>,
) {
  const normalizedError =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

  console.error(
    JSON.stringify({
      level: "error",
      event: "api_request_error",
      route: ctx.route,
      method: ctx.method,
      status,
      requestId: ctx.requestId,
      source: ctx.source,
      durationMs: durationMs(ctx.startedAtMs),
      metadata: metadata ?? {},
      error: normalizedError,
    }),
  );
}
