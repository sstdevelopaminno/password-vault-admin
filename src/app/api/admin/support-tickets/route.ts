import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiContext } from "@/lib/admin-api";
import { createApiRequestContext } from "@/lib/api/request-context";
import { jsonData, jsonError } from "@/lib/api/response";
import { logApiError, logApiSuccess } from "@/lib/api/observability";
import { writeAdminAuditEvent } from "@/lib/audit";

const ROUTE = "/api/admin/support-tickets";

const patchSchema = z.object({
  ticketId: z.string().uuid(),
  action: z.enum(["in_progress", "resolved", "cancel"]),
  note: z.string().trim().max(500).optional(),
});

function mapActionToStatus(action: z.infer<typeof patchSchema>["action"]) {
  if (action === "in_progress") return "in_progress";
  if (action === "resolved") return "resolved";
  return "closed";
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
    const { data: tickets, error } = await admin
      .from("support_tickets")
      .select("id,user_id,category,priority,subject,message,status,admin_response,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return jsonError(ctx, error.message, { status: 400 });
    }

    const userIds = [...new Set((tickets ?? []).map((item) => item.user_id))];
    const { data: users, error: usersError } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

    if (usersError) {
      return jsonError(ctx, usersError.message, { status: 400 });
    }

    const userMap = new Map((users ?? []).map((user) => [user.id, user]));
    const rows = (tickets ?? []).map((ticket) => {
      const user = userMap.get(ticket.user_id);
      return {
        id: ticket.id,
        userId: ticket.user_id,
        userName: user?.full_name ?? "-",
        userEmail: user?.email ?? "-",
        category: ticket.category,
        priority: ticket.priority,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        adminResponse: ticket.admin_response,
        createdAt: ticket.created_at,
        updatedAt: ticket.updated_at,
      };
    });

    const summary = rows.reduce(
      (acc, row) => {
        if (row.status === "open") acc.open += 1;
        if (row.status === "in_progress") acc.inProgress += 1;
        if (row.status === "resolved") acc.resolved += 1;
        if (row.status === "closed") acc.closed += 1;
        return acc;
      },
      { open: 0, inProgress: 0, resolved: 0, closed: 0 },
    );

    logApiSuccess(ctx, 200, { source: "native" });
    return jsonData(ctx, { tickets: rows, summary });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to load support tickets", { status: 500 });
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

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError(ctx, "Invalid payload", { status: 400 });
    }

    const payload = parsed.data;
    const admin = createAdminClient();
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .select("id,user_id,status")
      .eq("id", payload.ticketId)
      .maybeSingle();

    if (ticketError || !ticket) {
      return jsonError(ctx, "Ticket not found", { status: 404 });
    }

    const status = mapActionToStatus(payload.action);
    const nextResponse =
      payload.action === "cancel"
        ? payload.note ?? "Cancelled by support and escalated to Owner/IT review."
        : payload.note ?? null;

    const { error: updateError } = await admin
      .from("support_tickets")
      .update({
        status,
        admin_response: nextResponse,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.ticketId);

    if (updateError) {
      return jsonError(ctx, updateError.message, { status: 400 });
    }

    void writeAdminAuditEvent(ctx, {
      actionType: "support_ticket_status_updated",
      actorUserId: guard.value.authUser.id,
      targetUserId: ticket.user_id,
      metadata: {
        ticketId: payload.ticketId,
        action: payload.action,
        fromStatus: ticket.status,
        toStatus: status,
        note: nextResponse,
      },
    });

    if (payload.action === "cancel") {
      void writeAdminAuditEvent(ctx, {
        actionType: "support_ticket_cancellation_escalated",
        actorUserId: guard.value.authUser.id,
        targetUserId: ticket.user_id,
        metadata: {
          ticketId: payload.ticketId,
          escalateTo: ["owner", "it"],
          reason: nextResponse,
        },
      });
    }

    const message =
      payload.action === "cancel"
        ? "Ticket cancelled. Escalation log sent to Owner/IT."
        : payload.action === "resolved"
          ? "Ticket marked as resolved."
          : "Ticket set to in progress.";

    logApiSuccess(ctx, 200, { source: "native", action: payload.action });
    return jsonData(ctx, { ok: true, message });
  } catch (error) {
    logApiError(ctx, 500, error, { route: ROUTE });
    return jsonError(ctx, "Unable to update support ticket", { status: 500 });
  }
}
