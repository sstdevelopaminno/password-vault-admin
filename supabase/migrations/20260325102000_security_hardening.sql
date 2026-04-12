-- Security + performance hardening

-- 1) Prevent direct self-update privilege escalation on profiles
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
-- 2) Prevent admin direct vault reads from client; force API + PIN path
DROP POLICY IF EXISTS "vault_items_admin_read" ON public.vault_items;
-- 3) Helpful indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_vault_items_owner_updated
  ON public.vault_items (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role_status
  ON public.profiles (role, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status_created
  ON public.approval_requests (request_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON public.audit_logs (actor_user_id, created_at DESC);
