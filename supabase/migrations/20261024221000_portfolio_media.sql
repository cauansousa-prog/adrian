-- Mídias públicas dos tópicos Experiências, Galeria e Vídeos.
-- Os arquivos enviados pelo painel ficam em um bucket público para exibição no site;
-- somente administradores autorizados podem enviar ou remover arquivos e registros.

create table if not exists public.portfolio_media (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('experiencias', 'galeria', 'videos')),
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 1200),
  media_type text not null check (media_type in ('image', 'video')),
  asset_url text,
  storage_path text,
  position integer not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint portfolio_media_source_required check (
    (asset_url is not null and storage_path is null)
    or (asset_url is null and storage_path is not null)
  ),
  constraint portfolio_media_video_topic_only check (
    topic = 'videos' or media_type = 'image'
  )
);

create index if not exists portfolio_media_topic_position_idx
  on public.portfolio_media (topic, position, created_at);
create unique index if not exists portfolio_media_topic_asset_url_uidx
  on public.portfolio_media (topic, asset_url) where asset_url is not null;
create unique index if not exists portfolio_media_storage_path_uidx
  on public.portfolio_media (storage_path) where storage_path is not null;

alter table public.portfolio_media enable row level security;
revoke all on table public.portfolio_media from anon, authenticated;
grant select (id, topic, title, description, media_type, asset_url, storage_path, position, created_at)
  on table public.portfolio_media to anon, authenticated;
grant insert (topic, title, description, media_type, asset_url, storage_path, position)
  on table public.portfolio_media to authenticated;
grant update (topic, title, description, position)
  on table public.portfolio_media to authenticated;
grant delete on table public.portfolio_media to authenticated;

drop policy if exists "Visitors can view portfolio media" on public.portfolio_media;
create policy "Visitors can view portfolio media"
  on public.portfolio_media for select to anon, authenticated using (true);

drop policy if exists "Authorized administrators can add portfolio media" on public.portfolio_media;
create policy "Authorized administrators can add portfolio media"
  on public.portfolio_media for insert to authenticated
  with check (exists (
    select 1 from public.availability_admins admins
    where admins.user_id = (select auth.uid())
  ));

drop policy if exists "Authorized administrators can edit portfolio media" on public.portfolio_media;
create policy "Authorized administrators can edit portfolio media"
  on public.portfolio_media for update to authenticated
  using (exists (
    select 1 from public.availability_admins admins
    where admins.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.availability_admins admins
    where admins.user_id = (select auth.uid())
  ));

drop policy if exists "Authorized administrators can remove portfolio media" on public.portfolio_media;
create policy "Authorized administrators can remove portfolio media"
  on public.portfolio_media for delete to authenticated
  using (exists (
    select 1 from public.availability_admins admins
    where admins.user_id = (select auth.uid())
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio-media',
  'portfolio-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authorized administrators can read portfolio objects" on storage.objects;
create policy "Authorized administrators can read portfolio objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'portfolio-media'
    and exists (
      select 1 from public.availability_admins admins
      where admins.user_id = (select auth.uid())
    )
  );

drop policy if exists "Authorized administrators can upload portfolio objects" on storage.objects;
create policy "Authorized administrators can upload portfolio objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio-media'
    and exists (
      select 1 from public.availability_admins admins
      where admins.user_id = (select auth.uid())
    )
  );

drop policy if exists "Authorized administrators can delete portfolio objects" on storage.objects;
create policy "Authorized administrators can delete portfolio objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'portfolio-media'
    and exists (
      select 1 from public.availability_admins admins
      where admins.user_id = (select auth.uid())
    )
  );

-- Preserve the real media already on the site as editable database records.
insert into public.portfolio_media (topic, title, description, media_type, asset_url, position) values
  ('experiencias', 'Normatel & Verdes Mares', 'Ativação esportiva da Normatel e Verdes Mares.', 'image', 'img/17-acao-publica-normatel-verdemares.jpeg', 10),
  ('experiencias', 'Fanta', 'Ativação de marca da Fanta.', 'image', 'img/18-promover-fanta.jpeg', 20),
  ('experiencias', 'Yopro', 'Distribuição e divulgação da marca Yopro.', 'image', 'img/21-distribuicao-yopro.jpeg', 30),
  ('experiencias', 'UNINASSAU', 'Participação em feira institucional.', 'image', 'img/23-mascote-uninassau.jpeg', 40),
  ('experiencias', 'Unifor', 'Ação promocional na Unifor.', 'image', 'img/07-unifor-acao-entrega-bebida.jpeg', 50),
  ('experiencias', 'Tijuca Alimentos', 'Atuação em corrida de rua.', 'image', 'img/04-corrida-tijucaalimentos.jpeg', 60),
  ('experiencias', 'Turatti – Gastrobar & Parrilla', 'Ação promocional no Turatti.', 'image', 'img/10-acao-restaurante-TURATTI.jpeg', 70),
  ('experiencias', 'Corrida da Construção', 'Recepção e organização de evento esportivo.', 'image', 'img/12-corrida-construcao.jpeg', 80),
  ('experiencias', 'Robô Star', 'Ativação de loja com o Robô Star.', 'image', 'img/13-acao-loja-robo-star.jpeg', 90),
  ('experiencias', 'Wepink', 'Ativação da marca Wepink.', 'image', 'img/14-promover-wepink.jpeg', 100),
  ('experiencias', 'Night Power', 'Ação de degustação e divulgação.', 'image', 'img/15-promover-energetico-nightpower.jpeg', 110),
  ('experiencias', 'Supermercado Êxito', 'Ações promocionais no Supermercado Êxito.', 'image', 'img/09-mascote-supermecado-êxito.jpeg', 120),
  ('experiencias', 'Shein', 'Ação promocional da Shein.', 'image', 'img/30-acao-shein.png', 130),
  ('experiencias', 'Nestonutri', 'Ação promocional da Nestonutri.', 'image', 'img/28-acao-nestonutri.png', 140),
  ('experiencias', 'Alares', 'Ação promocional da Alares.', 'image', 'img/27-acao-alares.png', 150),
  ('experiencias', 'Diálogo Sustentável', 'Apresentação e produção do evento.', 'image', 'img/29-apresentacao-dialogo_sustentavel.png', 160),
  ('experiencias', 'Casamento', 'Atuação de apoio em evento particular.', 'image', 'img/25-apoio-casamento.jpeg', 170),
  ('galeria', 'Retrato de Adrian', 'Retrato profissional de Adrian.', 'image', 'img/02-adrian-retrato.jpeg', 10),
  ('galeria', 'Colagem de eventos', 'Registros de diferentes eventos e ações.', 'image', 'img/03-adrian-colagem-eventos.jpeg', 20),
  ('galeria', 'Registro de evento', 'Momento registrado durante um evento.', 'image', 'img/16-adria-galeria.jpeg', 30),
  ('galeria', 'Inauguração com mascote robô', 'Registro de inauguração com mascote robô.', 'image', 'img/01-inauguracao-com-robo.jpeg', 40),
  ('galeria', 'Registro de evento', 'Momento registrado durante um evento.', 'image', 'img/19-adrian-galeria-2.jpeg', 50),
  ('galeria', 'Adrian com mascote', 'Adrian em atuação com mascote.', 'image', 'img/05-adrian-mascote.jpeg', 60),
  ('galeria', 'Registro de evento', 'Momento registrado durante um evento.', 'image', 'img/24-adrian-galeria-3.jpeg', 70),
  ('galeria', 'Ativação esportiva', 'Ativação com mascote em evento esportivo.', 'image', 'img/08-mascote-futebol.jpeg', 80),
  ('galeria', 'Ação de divulgação', 'Registro de ação de divulgação.', 'image', 'img/06-modelo-solar.jpeg', 90),
  ('galeria', 'Ativação em loja', 'Ativação com mascote em loja.', 'image', 'img/22-mascote-mascote-loja.jpeg', 100),
  ('galeria', 'Ação em supermercado', 'Ativação em supermercado.', 'image', 'img/11-mascote-supermercado-ana_Risorlange.jpeg', 110),
  ('galeria', 'Ação promocional Unifor', 'Registro de ação promocional na Unifor.', 'image', 'img/26-apoio-promover-unifor.jpeg', 120),
  ('galeria', 'Distribuição Night Power', 'Registro de distribuição Night Power.', 'image', 'img/20-distribuicao-nightpower.jpeg', 130),
  ('galeria', 'Normatel & Verdes Mares', 'Ação esportiva da Normatel e Verdes Mares.', 'image', 'img/17-acao-publica-normatel-verdemares.jpeg', 140),
  ('galeria', 'Ativação Fanta', 'Registro da ativação da marca Fanta.', 'image', 'img/18-promover-fanta.jpeg', 150),
  ('galeria', 'Ação Turatti', 'Registro da ação promocional no Turatti.', 'image', 'img/10-acao-restaurante-TURATTI.jpeg', 160),
  ('videos', 'Tijuca Alimentos', 'Corrida de rua · 00:11', 'video', 'img/24-video-tijuca-alimentos.mp4', 10),
  ('videos', 'Montagem de Eventos', 'Registros gerais · 00:20', 'video', 'img/25-video-montage-eventos.mp4', 20)
on conflict (topic, asset_url) where asset_url is not null do nothing;
