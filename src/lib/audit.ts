import { createAdminClient } from "@/lib/supabase/admin";
import type { ApiRequestContext } from "@/lib/api/request-context";
import { logApiError } from "@/lib/api/observability";

type AuditInput = {
  actionType: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  targetVaultItemId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAdminAuditEvent(ctx: ApiRequestContext, input: AuditInput) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      action_type: input.actionType,
      actor_user_id: input.actorUserId ?? null,
      target_user_id: input.targetUserId ?? null,
      target_vault_item_id: input.targetVaultItemId ?? null,
      metadata_json: input.metadata ?? {},
    });

    if (error) {
      throw error;
    }

    return { ok: true as const };
  } catch (error) {
    // Audit should never break user flow for read-only endpoints.
    logApiError(ctx, 500, error, { hook: "audit_write_failed", actionType: input.actionType });
    return { ok: false as const };
  }
}
