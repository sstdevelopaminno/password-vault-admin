-- Optimize QR login rate-limit and status polling lookups

create index if not exists idx_admin_qr_login_challenges_pending_ip_created
  on public.admin_qr_login_challenges (requested_by_ip, created_at asc)
  where status = 'pending' and requested_by_ip is not null;

create index if not exists idx_admin_qr_login_challenges_pending_id_expires
  on public.admin_qr_login_challenges (id, expires_at asc)
  where status = 'pending';
