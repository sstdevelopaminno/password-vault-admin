import { randomUUID } from "crypto";
import { env } from "@/lib/env";

export type ApiRequestContext = {
  requestId: string;
  route: string;
  method: string;
  startedAtMs: number;
  source: "native" | "legacy";
};

export function createApiRequestContext(request: Request, route: string): ApiRequestContext {
  const incoming = request.headers.get("x-request-id");

  return {
    requestId: incoming && incoming.trim() ? incoming.trim() : randomUUID(),
    route,
    method: request.method,
    startedAtMs: Date.now(),
    source: env.ADMIN_API_SOURCE,
  };
}
