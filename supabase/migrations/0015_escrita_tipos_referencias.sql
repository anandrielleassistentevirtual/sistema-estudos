-- Escrita: tipos de projeto (conto, novela, romance, ensaio) e referências bibliográficas
alter table public.escrita_projetos drop constraint if exists escrita_projetos_tipo_check;
update public.escrita_projetos set tipo = 'romance' where tipo = 'livro';
update public.escrita_projetos set tipo = 'ensaio' where tipo = 'artigo';
alter table public.escrita_projetos alter column tipo set default 'romance';
alter table public.escrita_projetos add constraint escrita_projetos_tipo_check
  check (tipo in ('conto', 'novela', 'romance', 'ensaio'));

create table if not exists public.escrita_referencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  projeto_id uuid not null references public.escrita_projetos on delete cascade,
  autor text not null default '',   -- "Sobrenome, Nome; Sobrenome2, Nome2"
  titulo text not null default '',
  subtitulo text not null default '',
  edicao text not null default '',
  local text not null default '',
  editora text not null default '',
  ano text not null default '',
  url text not null default '',
  notas text not null default '',
  book_id uuid references public.books on delete set null,
  created_at timestamptz not null default now()
);
alter table public.escrita_referencias enable row level security;
drop policy if exists dono on public.escrita_referencias;
create policy dono on public.escrita_referencias for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists escrita_referencias_projeto on public.escrita_referencias (projeto_id);
create index if not exists escrita_referencias_user on public.escrita_referencias (user_id);
create index if not exists escrita_referencias_book on public.escrita_referencias (book_id);
