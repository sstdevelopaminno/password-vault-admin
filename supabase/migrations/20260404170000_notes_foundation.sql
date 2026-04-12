-- Notes system + reminder background queue

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  reminder_at timestamptz,
  meeting_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.note_reminder_jobs (
  id bigserial primary key,
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'queued', 'cancelled', 'failed')),
  push_queue_id bigint references public.push_notification_queue(id) on delete set null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 8 check (max_attempts >= 1),
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notes_user_updated
  on public.notes (user_id, updated_at desc, id desc);
create index if not exists idx_notes_user_meeting
  on public.notes (user_id, meeting_at desc)
  where meeting_at is not null;
create index if not exists idx_notes_user_reminder
  on public.notes (user_id, reminder_at desc)
  where reminder_at is not null;
create index if not exists idx_note_reminder_jobs_due
  on public.note_reminder_jobs (status, next_retry_at asc, reminder_at asc, id asc);
create index if not exists idx_note_reminder_jobs_user_created
  on public.note_reminder_jobs (user_id, created_at desc);
create unique index if not exists idx_note_reminder_jobs_note_pending_unique
  on public.note_reminder_jobs (note_id, reminder_at)
  where status in ('pending', 'processing');
alter table public.notes enable row level security;
alter table public.note_reminder_jobs enable row level security;
drop policy if exists "notes_owner_all" on public.notes;
create policy "notes_owner_all"
on public.notes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
drop policy if exists "note_reminder_jobs_owner_select" on public.note_reminder_jobs;
create policy "note_reminder_jobs_owner_select"
on public.note_reminder_jobs for select
using (auth.uid() = user_id);
