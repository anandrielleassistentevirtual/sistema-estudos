-- Capa do livro (imagem no bucket livros, em <uid>/capas/)
alter table public.books add column if not exists cover_path text;
