-- Zettelkasten: notas literárias (com status de kanban, ligadas ao livro e ao destaque)
-- e notas atômicas (ID único, fonte = nota literária)
alter table public.notes drop constraint if exists notes_kind_check;
alter table public.notes add constraint notes_kind_check check (kind in ('nota', 'estudo', 'literaria', 'atomica'));
alter table public.notes add column if not exists book_id uuid references public.books on delete set null;
alter table public.notes add column if not exists annotation_id uuid references public.annotations on delete set null;
alter table public.notes add column if not exists status text check (status in ('a_tratar', 'em_tratamento', 'concluida'));
alter table public.notes add column if not exists quote text not null default '';
alter table public.notes add column if not exists location text not null default '';
alter table public.notes add column if not exists zid text;
alter table public.notes add column if not exists source_id uuid references public.notes on delete set null;
alter table public.notes add column if not exists concluded_at timestamptz;
create index if not exists notes_user_kind_status on public.notes (user_id, kind, status);
create index if not exists notes_book on public.notes (book_id);
update public.notes set kind = 'atomica' where kind = 'nota';
