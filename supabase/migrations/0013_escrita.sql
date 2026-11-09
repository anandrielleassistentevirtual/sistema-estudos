-- Escrita: projetos (livros e artigos), árvore de capítulos/cenas/notas, escaleta e sessões de escrita
create table if not exists public.escrita_projetos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text not null,
  autor text not null default '',
  tipo text not null default 'livro' check (tipo in ('livro', 'artigo')),
  meta_palavras int not null default 0,
  meta_diaria int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.escrita_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  projeto_id uuid not null references public.escrita_projetos on delete cascade,
  parent_id uuid references public.escrita_docs on delete cascade,
  -- manuscrito: capitulo/cena · apoio: pasta/nota
  tipo text not null check (tipo in ('capitulo', 'cena', 'pasta', 'nota')),
  secao text not null default 'manuscrito' check (secao in ('manuscrito', 'enredo', 'personagens', 'lugares', 'pesquisa')),
  titulo text not null default '',
  conteudo text not null default '',
  posicao int not null default 0,
  status text not null default 'rascunho',
  -- escaleta (cenas)
  resumo text not null default '',
  pov text not null default '',
  personagens text not null default '',
  personagens_indiretos text not null default '',
  espaco text not null default '',
  tempo text not null default '',
  pagina text not null default '',
  palavras int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.escrita_sessoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  projeto_id uuid not null references public.escrita_projetos on delete cascade,
  dia date not null default current_date,
  inicio timestamptz not null default now(),
  segundos int not null default 0,
  ocioso int not null default 0,
  palavras int not null default 0, -- saldo de palavras da sessão (pode ser negativo)
  created_at timestamptz not null default now()
);

alter table public.escrita_projetos enable row level security;
alter table public.escrita_docs enable row level security;
alter table public.escrita_sessoes enable row level security;
drop policy if exists dono on public.escrita_projetos;
create policy dono on public.escrita_projetos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dono on public.escrita_docs;
create policy dono on public.escrita_docs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dono on public.escrita_sessoes;
create policy dono on public.escrita_sessoes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists escrita_docs_projeto on public.escrita_docs (projeto_id, posicao);
create index if not exists escrita_docs_parent on public.escrita_docs (parent_id);
create index if not exists escrita_docs_user on public.escrita_docs (user_id);
create index if not exists escrita_sessoes_projeto on public.escrita_sessoes (projeto_id, dia);
create index if not exists escrita_sessoes_user on public.escrita_sessoes (user_id);
create index if not exists escrita_projetos_user on public.escrita_projetos (user_id);
