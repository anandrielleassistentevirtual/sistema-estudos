-- Obras de consulta (dicionários, referências, livros de história…): abrem onde você parou,
-- mas nada conta nos indicadores, não entram na fila nem nas palavras "pela frente".
alter table public.books drop constraint if exists books_status_check;
alter table public.books add constraint books_status_check check (status in ('aguardando', 'lendo', 'pausado', 'lido', 'consulta'));
