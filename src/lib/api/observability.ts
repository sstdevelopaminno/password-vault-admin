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
  let normalizedError: Record<string, unknown>;
  if (error instanceof Error) {
    normalizedError = { name: error.name, message: error.message, stack: error.stack };
  } else if (error && typeof error === "object") {
    const source = error as Record<string, unknown>;
    normalizedError = {
      message: typeof source.message === "string" ? source.message : "Non-Error exception",
      ...(typeof source.name === "string" ? { name: source.name } : {}),
      ...(typeof source.code === "string" ? { code: source.code } : {}),
      ...(typeof source.details === "string" ? { details: source.details } : {}),
      ...(typeof source.hint === "string" ? { hint: source.hint } : {}),
      ...(typeof source.stack === "string" ? { stack: source.stack } : {}),
    };
  } else {
    normalizedError = { message: String(error) };
  }

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
