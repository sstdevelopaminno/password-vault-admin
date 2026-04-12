import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";

const ROUTE = "/api/admin/audit-logs";

const searchSchema = z.object({
  q: z.string().trim().optional(),
  action: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  format: z.enum(["json", "csv"]).default("json"),
  cursor: z.string().trim().optional(),
  limit: z.string().trim().optional(),
});

type Cursor = { created_at: string; id: string };

type AuditLogRow = {
  id: string;
  action_type: string | null;
  target_user_id: string | null;
  target_vault_item_id: string | null;
  metadata_json: unknown;
  created_at: string;
  actor_user_id: string | null;
};

function parseLimit(raw: string | undefined, fallback: number, max: number) {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.created_at !== "string" || typeof parsed?.id !== "string") return null;
    return { created_at: parsed.created_at, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeCursor(value: Cursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function escapeCsv(value: unknown) {
  const quote = String.fromCharCode(34);
  const text = String(value ?? "").split(quote).join(quote + quote);
  return quote + text + quote;
}

function normalizeDateInput(value: string | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

async function tryFetchLegacyAuditLogs(request: Request) {
  if (!env.LEGACY_PASSWORD_VAULT_API_BASE_URL) {
    return null;
  }

  const targetUrl = new URL(`${env.LEGACY_PASSWORD_VAULT_API_BASE_URL}/api/admin/audit-logs`);
  const currentUrl = new URL(request.url);
  currentUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.LEGACY_PASSWORD_VAULT_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/csv")) {
      const csvText = await response.text();
      return { kind: "csv" as const, csvText };
    }

    const body = await response.json();
    return { kind: "json" as const, body };
  } catch {
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

    const url = new URL(request.url);
    const parsed = searchSchema.parse({
      q: url.searchParams.get("q") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      format: (url.searchParams.get("format") ?? "json").toLowerCase(),
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (env.ADMIN_API_SOURCE === "legacy") {
      const legacy = await tryFetchLegacyAuditLogs(request);
      if (legacy?.kind === "csv") {
        logApiSuccess(ctx, 200, { source: "legacy", format: "csv" });
        return new NextResponse(legacy.csvText, {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename=audit-logs-${Date.now()}.csv`,
            "x-request-id": ctx.requestId,
            "x-admin-api-source": "legacy",
          },
        });
      }
      if (legacy?.kind === "json") {
        logApiSuccess(ctx, 200, { source: "legacy", format: "json" });
        return jsonData(ctx, legacy.body as Record<string, unknown>, {
          headers: { "x-audit-source": "legacy" },
        });
      }
    }

    const format = parsed.format;
    const cursor = format === "json" ? decodeCursor(parsed.cursor) : null;
    const limit = format === "csv" ? parseLimit(parsed.limit, 2_000, 5_000) : parseLimit(parsed.limit, 100, 200);

    const fromDate = normalizeDateInput(parsed.from);
    const toDate = normalizeDateInput(parsed.to);

    const admin = createAdminClient();
    let query = admin
      .from("audit_logs")
      .select("id,action_type,target_user_id,target_vault_item_id,metadata_json,created_at,actor_user_id")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(format === "json" ? limit + 1 : limit);

    if (parsed.action) query = query.eq("action_type", parsed.action);
    if (parsed.q) query = query.ilike("action_type", `%${parsed.q}%`);
    if (fromDate) query = query.gte("created_at", fromDate.toISOString());
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }
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

    const logs = (data ?? []) as AuditLogRow[];

    if (format === "csv") {
      const header = [
        "id",
        "action_type",
        "created_at",
        "actor_user_id",
        "target_user_id",
        "target_vault_item_id",
        "metadata_json",
      ].join(",");
      const rows = logs.map((log) =>
        [
          escapeCsv(log.id),
          escapeCsv(log.action_type),
          escapeCsv(log.created_at),
          escapeCsv(log.actor_user_id),
          escapeCsv(log.target_user_id),
          escapeCsv(log.target_vault_item_id),
          escapeCsv(JSON.stringify(log.metadata_json ?? {})),
        ].join(","),
      );
      const csvText = header + "\n" + rows.join("\n");

      logApiSuccess(ctx, 200, { source: "native", format: "csv" });
      return new NextResponse(csvText, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename=audit-logs-${Date.now()}.csv`,
          "x-request-id": ctx.requestId,
          "x-admin-api-source": "native",
          "x-audit-source": "native",
        },
      });
    }

    const hasMore = logs.length > limit;
    const currentPage = logs.slice(0, limit);
    const last = currentPage[currentPage.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({
            created_at: new Date(last.created_at).toISOString(),
            id: String(last.id),
          })
        : null;

    logApiSuccess(ctx, 200, { source: "native", format: "json" });
    return jsonData(
      ctx,
      { logs: currentPage, pagination: { limit, hasMore, nextCursor } },
      { headers: { "x-audit-source": "native" } },
    );
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load audit logs", { status: 500 });
  }
}
