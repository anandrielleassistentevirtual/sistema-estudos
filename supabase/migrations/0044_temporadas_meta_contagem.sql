-- Metas de contagem: N itens até uma data (ex.: 28 aulas do curso em 14 dias). refs guarda a data de cada item feito.
alter table public.temporada_metas add column if not exists prazo date;
alter table public.temporada_metas add column if not exists unidade text;
alter table public.temporada_metas drop constraint if exists temporada_metas_tipo_check;
alter table public.temporada_metas add constraint temporada_metas_tipo_check
  check (tipo in ('livros', 'aulas', 'curso', 'palavras', 'horas', 'anki', 'contagem'));
