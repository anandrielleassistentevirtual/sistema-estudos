-- Motivo de leitura (Adler): entretenimento, informação ou conhecimento — por que o livro é lido
-- (o nível de leitura, em nivel_leitura, diz como).
alter table public.books add column if not exists motivo_leitura text;
alter table public.books drop constraint if exists books_motivo_leitura_check;
alter table public.books add constraint books_motivo_leitura_check
  check (motivo_leitura is null or motivo_leitura in ('entretenimento', 'informacao', 'conhecimento'));
