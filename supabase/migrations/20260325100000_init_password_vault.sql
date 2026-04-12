-- Password Vault initial schema
create extension if not exists "pgcrypto";
create type public.app_role as enum ('pending','user','approver','admin','super_admin');
create type public.account_status as enum ('pending_approval','active','disabled');
create type public.request_status as enum ('pending','approved','rejected');
create type public.otp_purpose as enum ('signup','reset_password','change_email','change_profile','change_password','change_pin');
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'pending',
  status public.account_status not null default 'pending_approval',
  pin_hash text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  username_value_encrypted text not null,
  secret_value_encrypted text not null,
  url text,
  category text,
  notes_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create table if not exists public.otp_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email_target text not null,
  otp_hash text not null,
  purpose public.otp_purpose not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id),
  action_type text not null,
  target_user_id uuid references public.profiles(id),
  target_vault_item_id uuid references public.vault_items(id),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.sessions_security (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_info text,
  ip_address text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.vault_items enable row level security;
alter table public.approval_requests enable row level security;
alter table public.otp_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sessions_security enable row level security;
create policy "profiles_self_read"
on public.profiles for select
using (auth.uid() = id);
create policy "profiles_self_update"
on public.profiles for update
using (auth.uid() = id);
create policy "profiles_admin_read"
on public.profiles for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','super_admin','approver')
  )
);
create policy "vault_items_owner_all"
on public.vault_items for all
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);
create policy "vault_items_admin_read"
on public.vault_items for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','super_admin')
  )
);
create policy "approvals_moderators"
on public.approval_requests for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('approver','admin','super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('approver','admin','super_admin')
  )
);
create policy "otp_owner_only"
on public.otp_requests for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "audit_owner_or_admin"
on public.audit_logs for select
using (
  actor_user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','super_admin')
  )
);
create policy "audit_insert_by_api"
on public.audit_logs for insert
with check (auth.uid() is not null);
create policy "sessions_owner_or_admin"
on public.sessions_security for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','super_admin')
  )
);
