-- MAR: episódios por temporada das séries (temporadas = nº de episódios de cada uma) e quantos já foram vistos
-- (contagem linear: T1 inteira, depois T2…). mar_log guarda os episódios vistos por dia, para os indicadores do período.
alter table public.mar_titulos add column if not exists temporadas int[] not null default '{}';
alter table public.mar_titulos add column if not exists ep_vistos int not null default 0;
create table if not exists public.mar_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo_id uuid not null references public.mar_titulos on delete cascade,
  dia date not null default current_date,
  episodios int not null default 1,
  created_at timestamptz not null default now()
);
alter table public.mar_log enable row level security;
drop policy if exists dono on public.mar_log;
create policy dono on public.mar_log for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists mar_log_user_dia on public.mar_log (user_id, dia);
create index if not exists mar_log_titulo on public.mar_log (titulo_id);

-- cada episódio marcado vira tempo de estudo do idioma (study_sessions, "MAR · série"), com a duração da série
alter table public.mar_titulos add column if not exists min_ep int not null default 25 check (min_ep between 1 and 300);
alter table public.mar_log add column if not exists sessao_id uuid references public.study_sessions(id) on delete set null;
