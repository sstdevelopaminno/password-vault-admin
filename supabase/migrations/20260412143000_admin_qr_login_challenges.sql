-- Admin QR login challenge flow

create table if not exists public.admin_qr_login_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_token_hash text not null unique,
  nonce text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','consumed')),
  requested_by_ip text,
  requested_user_agent text,
  requested_device_label text,
  approved_by_user_id uuid references public.profiles(id) on delete set null,
  approved_by_email text,
  approved_at timestamptz,
  rejected_reason text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_ip text,
  consumed_user_agent text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_qr_login_challenges_status_expires
  on public.admin_qr_login_challenges (status, expires_at asc);

create index if not exists idx_admin_qr_login_challenges_approved_by_created
  on public.admin_qr_login_challenges (approved_by_user_id, created_at desc);

alter table public.admin_qr_login_challenges enable row level security;
