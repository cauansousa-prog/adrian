-- Disponibilidade por horario local de Fortaleza.
-- Bloqueios anteriores, sem horario, continuam representando o dia inteiro.
-- Nenhum detalhe privado de evento e armazenado nesta tabela.

alter table public.availability_blocks
  add column start_time time without time zone,
  add column end_time time without time zone;

alter table public.availability_blocks
  add constraint availability_blocks_valid_time_range
  check (
    (start_time is null and end_time is null)
    or (
      start_time is not null
      and end_time is not null
      and (start_date + start_time) < (end_date + end_time)
    )
  );

alter table public.availability_blocks
  add column occupied_period tsrange
  generated always as (
    tsrange(
      start_date + coalesce(start_time, time '00:00'),
      end_date
        + case when end_time is null then 1 else 0 end
        + coalesce(end_time, time '00:00'),
      '[)'
    )
  ) stored;

alter table public.availability_blocks
  drop constraint availability_blocks_no_overlap;

alter table public.availability_blocks
  add constraint availability_blocks_no_overlap
  exclude using gist (occupied_period with &&);

grant select (start_time, end_time)
  on table public.availability_blocks to anon;
