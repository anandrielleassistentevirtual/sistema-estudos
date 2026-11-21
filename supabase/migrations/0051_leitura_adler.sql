-- Níveis de leitura de Mortimer Adler ("Como ler livros"): cada livro diz como vai ser lido
-- (elementar, inspecional, analítica ou sintópica) e guarda o roteiro do método: as etapas cumpridas e as respostas.
-- tema: o assunto da leitura sintópica (os livros com o mesmo tema formam a bibliografia).
alter table public.books add column if not exists nivel_leitura text;
alter table public.books drop constraint if exists books_nivel_leitura_check;
alter table public.books add constraint books_nivel_leitura_check
  check (nivel_leitura is null or nivel_leitura in ('elementar', 'inspecional', 'analitica', 'sintopica'));
alter table public.books add column if not exists roteiro jsonb not null default '{}'::jsonb;
alter table public.books drop constraint if exists books_roteiro_check;
alter table public.books add constraint books_roteiro_check check (jsonb_typeof(roteiro) = 'object');
alter table public.books add column if not exists tema text;
create index if not exists books_tema on public.books (user_id, tema) where tema is not null;
