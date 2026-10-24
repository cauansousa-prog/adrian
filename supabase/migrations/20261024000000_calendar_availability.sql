-- Agenda do Promotor Adrian.
-- A tabela publica guarda somente datas, sem nome, local, cliente ou observacoes de eventos.

create table if not exists public.availability_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_blocks_valid_dates check (end_date >= start_date),
  constraint availability_blocks_no_overlap
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

create index if not exists availability_blocks_end_date_idx
  on public.availability_blocks (end_date);

alter table public.availability_admins enable row level security;
alter table public.availability_blocks enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on table public.availability_admins from anon, authenticated;
revoke all on table public.availability_blocks from anon, authenticated;

grant select (user_id) on table public.availability_admins to authenticated;
grant select (start_date, end_date) on table public.availability_blocks to anon;
grant select, insert, update, delete on table public.availability_blocks to authenticated;

drop policy if exists "Administrators can read their own authorization" on public.availability_admins;
create policy "Administrators can read their own authorization"
  on public.availability_admins
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Visitors can read occupied date ranges" on public.availability_blocks;
create policy "Visitors can read occupied date ranges"
  on public.availability_blocks
  for select
  to anon
  using (true);

drop policy if exists "Administrators can read date ranges" on public.availability_blocks;
create policy "Administrators can read date ranges"
  on public.availability_blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.availability_admins as admins
      where admins.user_id = (select auth.uid())
    )
  );

drop policy if exists "Administrators can create date ranges" on public.availability_blocks;
create policy "Administrators can create date ranges"
  on public.availability_blocks
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.availability_admins as admins
      where admins.user_id = (select auth.uid())
    )
  );

drop policy if exists "Administrators can update date ranges" on public.availability_blocks;
create policy "Administrators can update date ranges"
  on public.availability_blocks
  for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.availability_admins as admins
      where admins.user_id = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.availability_admins as admins
      where admins.user_id = (select auth.uid())
    )
  );

drop policy if exists "Administrators can delete date ranges" on public.availability_blocks;
create policy "Administrators can delete date ranges"
  on public.availability_blocks
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.availability_admins as admins
      where admins.user_id = (select auth.uid())
    )
  );

create or replace function public.set_availability_blocks_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_availability_blocks_updated_at() from public, anon, authenticated;

drop trigger if exists availability_blocks_set_updated_at on public.availability_blocks;
create trigger availability_blocks_set_updated_at
  before update on public.availability_blocks
  for each row execute function public.set_availability_blocks_updated_at();


