-- Lista do MAR: filmes, séries, canais e podcasts em inglês de verdade, com a curadoria do próprio aluno
-- (quero ver → assistindo → visto), onde assistir, nível de dificuldade e se é com legenda em inglês ("boia") ou sem.
create table if not exists public.mar_titulos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  idioma text not null default 'Inglês',
  titulo text not null,
  tipo text not null default 'serie' check (tipo in ('filme', 'serie', 'youtube', 'podcast', 'livro')),
  situacao text not null default 'quero' check (situacao in ('quero', 'assistindo', 'visto')),
  onde text not null default '',
  legenda text not null default 'en' check (legenda in ('en', 'sem')),
  nivel int not null default 2 check (nivel between 1 and 3),
  progresso text not null default '',
  nota text not null default '',
  posicao int not null default 0,
  visto_em timestamptz,
  created_at timestamptz not null default now()
);
alter table public.mar_titulos enable row level security;
drop policy if exists dono on public.mar_titulos;
create policy dono on public.mar_titulos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists mar_titulos_user on public.mar_titulos (user_id, situacao);
