-- Temporadas: o plano de cada área na unidade que mede o avanço dela (palavras, cartões do Anki ou minutos),
-- metas de aulas escolhidas uma a uma e metas de baralho do Anki (total, cartões novos ou revisões).
alter table public.temporadas add column if not exists unidades jsonb not null default '{}';
alter table public.temporada_metas add column if not exists medida text check (medida in ('total', 'criados', 'revisoes'));
alter table public.temporada_metas drop constraint if exists temporada_metas_tipo_check;
alter table public.temporada_metas add constraint temporada_metas_tipo_check
  check (tipo in ('livros', 'aulas', 'curso', 'palavras', 'horas', 'anki'));
