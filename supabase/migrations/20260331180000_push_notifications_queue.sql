-- Push notification subscriptions + queue (priority + retry)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  device_label text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.push_notification_queue (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_kind text not null default 'general',
  title text not null,
  body text not null,
  href text,
  image_url text,
  tag text,
  payload_json jsonb not null default '{}'::jsonb,
  priority smallint not null default 5 check (priority between 1 and 10),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts >= 1),
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
alter table public.push_notification_queue enable row level security;
drop policy if exists "push_subscriptions_owner_select" on public.push_subscriptions;
create policy "push_subscriptions_owner_select"
on public.push_subscriptions for select
using (auth.uid() = user_id);
drop policy if exists "push_subscriptions_owner_insert" on public.push_subscriptions;
create policy "push_subscriptions_owner_insert"
on public.push_subscriptions for insert
with check (auth.uid() = user_id);
drop policy if exists "push_subscriptions_owner_update" on public.push_subscriptions;
create policy "push_subscriptions_owner_update"
on public.push_subscriptions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
drop policy if exists "push_subscriptions_owner_delete" on public.push_subscriptions;
create policy "push_subscriptions_owner_delete"
on public.push_subscriptions for delete
using (auth.uid() = user_id);
drop policy if exists "push_queue_owner_read" on public.push_notification_queue;
create policy "push_queue_owner_read"
on public.push_notification_queue for select
using (auth.uid() = user_id);
create index if not exists idx_push_subscriptions_user_active
on public.push_subscriptions (user_id, is_active, updated_at desc);
create index if not exists idx_push_queue_pending_priority
on public.push_notification_queue (status, scheduled_at asc, priority desc, id asc);
create index if not exists idx_push_queue_user_created
on public.push_notification_queue (user_id, created_at desc);
