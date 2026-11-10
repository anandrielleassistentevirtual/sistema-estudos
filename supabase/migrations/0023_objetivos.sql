-- Mapa da Ignorância: mesas de objetivos (grupos de livros com nome, numa ordem definida)
create table if not exists public.objetivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text not null,
  descricao text not null default '',
  posicao int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.objetivo_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  objetivo_id uuid not null references public.objetivos on delete cascade,
  secao text not null default '',          -- ex.: "1.1. História da arte e educação do olhar"
  posicao int not null default 0,           -- ordem de leitura dentro da mesa
  cdd text not null default '',
  autor text not null default '',
  titulo text not null,
  feito boolean not null default false,
  feito_em timestamptz,
  book_id uuid references public.books on delete set null, -- o livro na biblioteca, quando existe
  created_at timestamptz not null default now()
);

alter table public.objetivos enable row level security;
alter table public.objetivo_itens enable row level security;
drop policy if exists dono on public.objetivos;
create policy dono on public.objetivos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dono on public.objetivo_itens;
create policy dono on public.objetivo_itens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists objetivos_user on public.objetivos (user_id, posicao);
create index if not exists objetivo_itens_objetivo on public.objetivo_itens (objetivo_id, posicao);
create index if not exists objetivo_itens_user on public.objetivo_itens (user_id);
create index if not exists objetivo_itens_book on public.objetivo_itens (book_id);
