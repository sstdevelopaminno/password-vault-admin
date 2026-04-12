-- Help center foundation: FAQs + support tickets

create table if not exists public.support_faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general',
  question text not null,
  answer text not null,
  sort_order integer not null default 100,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'general',
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_faqs_visible_order
  on public.support_faqs (is_published, sort_order asc, updated_at desc);
create index if not exists idx_support_tickets_user_created
  on public.support_tickets (user_id, created_at desc);
create index if not exists idx_support_tickets_status_created
  on public.support_tickets (status, created_at desc);
alter table public.support_faqs enable row level security;
alter table public.support_tickets enable row level security;
drop policy if exists "support_faqs_public_read" on public.support_faqs;
create policy "support_faqs_public_read"
on public.support_faqs for select
using (auth.uid() is not null and is_published = true);
drop policy if exists "support_faqs_admin_all" on public.support_faqs;
create policy "support_faqs_admin_all"
on public.support_faqs for all
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
drop policy if exists "support_tickets_owner_select" on public.support_tickets;
create policy "support_tickets_owner_select"
on public.support_tickets for select
using (auth.uid() = user_id);
drop policy if exists "support_tickets_owner_insert" on public.support_tickets;
create policy "support_tickets_owner_insert"
on public.support_tickets for insert
with check (auth.uid() = user_id);
drop policy if exists "support_tickets_owner_update" on public.support_tickets;
create policy "support_tickets_owner_update"
on public.support_tickets for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
drop policy if exists "support_tickets_admin_all" on public.support_tickets;
create policy "support_tickets_admin_all"
on public.support_tickets for all
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
insert into public.support_faqs (category, question, answer, sort_order, is_published)
select 'account',
       'How can I recover my account?',
       'Use Forgot Password on the login page, verify OTP, then reset your password and PIN.',
       10,
       true
where not exists (
  select 1 from public.support_faqs where question = 'How can I recover my account?'
);
insert into public.support_faqs (category, question, answer, sort_order, is_published)
select 'security',
       'How do I keep my vault secure?',
       'Enable PIN lock, use a strong unique password, and review trusted sessions regularly.',
       20,
       true
where not exists (
  select 1 from public.support_faqs where question = 'How do I keep my vault secure?'
);
insert into public.support_faqs (category, question, answer, sort_order, is_published)
select 'team',
       'How does Team Keys sharing work?',
       'Create a Team Room, invite members, then share selected vault items into that room.',
       30,
       true
where not exists (
  select 1 from public.support_faqs where question = 'How does Team Keys sharing work?'
);
