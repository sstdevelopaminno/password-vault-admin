-- Track personal-source linkage for team items so room deletion can return items safely.
alter table if exists public.team_room_items
 add column if not exists source_vault_item_id uuid references public.vault_items(id) on delete set null;
create index if not exists team_room_items_source_vault_item_idx
 on public.team_room_items (source_vault_item_id)
 where source_vault_item_id is not null;
