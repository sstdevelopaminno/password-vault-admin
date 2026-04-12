-- Team rooms + shared team vault items + room chat messages 
 
do $$ 
begin 
  create type public.team_room_member_role as enum ('owner', 'member'); 
exception 
  when duplicate_object then null; 
end $$;
do $$ 
begin 
  create type public.team_message_type as enum ('text', 'shared_item'); 
exception 
  when duplicate_object then null; 
end $$;
create table if not exists public.team_rooms ( 
  id uuid primary key default gen_random_uuid(), 
  name text not null, 
  description text, 
  created_by uuid not null references public.profiles(id) on delete cascade, 
  created_at timestamptz not null default now(), 
  updated_at timestamptz not null default now() 
);
create table if not exists public.team_room_members ( 
  room_id uuid not null references public.team_rooms(id) on delete cascade, 
  user_id uuid not null references public.profiles(id) on delete cascade, 
  member_role public.team_room_member_role not null default 'member', 
  joined_at timestamptz not null default now(), 
  primary key (room_id, user_id) 
);
create table if not exists public.team_room_items ( 
  id uuid primary key default gen_random_uuid(), 
  room_id uuid not null references public.team_rooms(id) on delete cascade, 
  created_by uuid not null references public.profiles(id) on delete cascade, 
  title text not null, 
  username_value_encrypted text not null, 
  secret_value_encrypted text not null, 
  url text, 
  category text, 
  notes_encrypted text, 
  created_at timestamptz not null default now(), 
  updated_at timestamptz not null default now() 
);
create table if not exists public.team_room_messages ( 
  id uuid primary key default gen_random_uuid(), 
  room_id uuid not null references public.team_rooms(id) on delete cascade, 
  sender_user_id uuid not null references public.profiles(id) on delete cascade, 
  message_type public.team_message_type not null default 'text', 
  body_text text, 
  metadata_json jsonb not null default '{}'::jsonb, 
  created_at timestamptz not null default now() 
);
create index if not exists team_rooms_created_by_updated_idx 
  on public.team_rooms (created_by, updated_at desc);
create index if not exists team_room_members_user_room_idx 
  on public.team_room_members (user_id, room_id);
create index if not exists team_room_items_room_updated_idx 
  on public.team_room_items (room_id, updated_at desc, id desc);
create index if not exists team_room_messages_room_created_idx 
  on public.team_room_messages (room_id, created_at desc, id desc);
alter table public.team_rooms enable row level security;
alter table public.team_room_members enable row level security;
alter table public.team_room_items enable row level security;
alter table public.team_room_messages enable row level security;
create policy "team_rooms_select_member" 
on public.team_rooms for select
using ( 
  exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_rooms.id 
      and m.user_id = auth.uid() 
  ) 
);
create policy "team_rooms_insert_creator" 
on public.team_rooms for insert 
with check (created_by = auth.uid());
create policy "team_rooms_update_owner" 
on public.team_rooms for update 
using ( 
  exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_rooms.id 
      and m.user_id = auth.uid() 
      and m.member_role = 'owner' 
  ) 
) 
with check ( 
  exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_rooms.id 
      and m.user_id = auth.uid() 
      and m.member_role = 'owner' 
  ) 
);
create policy "team_rooms_delete_owner" 
on public.team_rooms for delete 
using ( 
  exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_rooms.id 
      and m.user_id = auth.uid() 
      and m.member_role = 'owner' 
  ) 
);
create policy "team_room_members_select_member" 
on public.team_room_members for select
using ( 
  exists ( 
    select 1
    from public.team_room_members me 
    where me.room_id = team_room_members.room_id 
      and me.user_id = auth.uid() 
  ) 
);
create policy "team_room_members_insert_owner_or_self" 
on public.team_room_members for insert 
with check ( 
  user_id = auth.uid() 
  or exists ( 
    select 1
    from public.team_room_members owner_member 
    where owner_member.room_id = team_room_members.room_id 
      and owner_member.user_id = auth.uid() 
      and owner_member.member_role = 'owner' 
  ) 
  or exists ( 
    select 1
    from public.team_rooms r 
    where r.id = team_room_members.room_id 
      and r.created_by = auth.uid() 
  ) 
);
create policy "team_room_members_delete_owner_or_self" 
on public.team_room_members for delete 
using ( 
  user_id = auth.uid() 
  or exists ( 
    select 1
    from public.team_room_members owner_member 
    where owner_member.room_id = team_room_members.room_id 
      and owner_member.user_id = auth.uid() 
      and owner_member.member_role = 'owner' 
  ) 
);
create policy "team_room_items_member_all" 
on public.team_room_items for all 
using ( 
  exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_room_items.room_id 
      and m.user_id = auth.uid() 
  ) 
) 
with check ( 
  exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_room_items.room_id 
      and m.user_id = auth.uid() 
  ) 
);
create policy "team_room_messages_select_member" 
on public.team_room_messages for select
using ( 
  exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_room_messages.room_id 
      and m.user_id = auth.uid() 
  ) 
);
create policy "team_room_messages_insert_member" 
on public.team_room_messages for insert 
with check ( 
  sender_user_id = auth.uid() 
  and exists ( 
    select 1
    from public.team_room_members m 
    where m.room_id = team_room_messages.room_id 
      and m.user_id = auth.uid() 
  ) 
);
