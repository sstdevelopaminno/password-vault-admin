import { NextResponse } from "next/server";
import type { ApiRequestContext } from "@/lib/api/request-context";

type JsonPayload = Record<string, unknown> | Array<unknown>;

function decorate(response: NextResponse, ctx: ApiRequestContext) {
  response.headers.set("x-request-id", ctx.requestId);
  response.headers.set("x-admin-api-source", ctx.source);
  return response;
}

export function jsonData(
  ctx: ApiRequestContext,
  payload: JsonPayload,
  options?: { status?: number; headers?: HeadersInit },
) {
  const response = NextResponse.json(payload, {
    status: options?.status ?? 200,
    headers: options?.headers,
  });

  return decorate(response, ctx);
}

export function jsonError(
  ctx: ApiRequestContext,
  message: string,
  options?: { status?: number; headers?: HeadersInit; code?: string },
) {
  const response = NextResponse.json(
    {
      error: message,
      code: options?.code,
      requestId: ctx.requestId,
    },
    {
      status: options?.status ?? 400,
      headers: options?.headers,
    },
  );

  return decorate(response, ctx);
}
