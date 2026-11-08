-- CDD: código da pasta (ex.: 869.1) e ordem do livro dentro da pasta (numeração de chamada)
alter table public.folders add column if not exists code text;
alter table public.books add column if not exists position int;
