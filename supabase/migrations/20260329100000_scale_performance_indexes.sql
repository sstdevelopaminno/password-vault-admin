-- Performance indexes for high-volume user/admin traffic
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_status_created ON public.profiles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending_created ON public.approval_requests (created_at ASC) WHERE request_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs (action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_items_owner_title ON public.vault_items (owner_user_id, title);
