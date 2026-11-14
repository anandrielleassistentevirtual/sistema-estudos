-- Regra única de "tempo de estudo" (a mesma usada nas telas — ver src/lib/tempo.ts):
--   Timer e registros (inclui Listening e Aulas) + leitura no leitor sem o Timer
--   + tempo no Anki só nos baralhos ligados a um idioma.
-- Com o AnkiWeb ligado, a revisão feita dentro do sistema ("Anki · N cartões") não conta de novo.
-- As revisões do Anki também passam a contar só os baralhos ligados a um idioma.
create or replace function public.estatisticas_por_dia(desde date)
returns table(dia date, estudo bigint, leitura bigint, leitura_total bigint, palavras bigint, anki bigint, escritas bigint)
language sql stable set search_path to ''
as $function$
  with
  decks as (select unnest(anki_baralhos) as b from public.languages),
  ankiweb as (select exists (select 1 from public.anki_conta) as ligado),
  s as (
    select day as dia, seconds::bigint as estudo, 0::bigint as leitura, 0::bigint as leitura_total, 0::bigint as palavras, 0::bigint as anki, 0::bigint as escritas
      from public.study_sessions
     where day >= desde and not (label like 'Anki ·%' and (select ligado from ankiweb))
    union all
    select day, 0, case when during_timer then 0 else seconds end, seconds, words, 0, 0
      from public.reading_sessions where day >= desde
    union all
    select day, segundos, 0, 0, 0, reviews, 0
      from public.anki_baralho_dia where day >= desde and baralho in (select b from decks)
    union all
    select dia, 0, 0, 0, 0, 0, greatest(0, palavras) from public.escrita_sessoes where dia >= desde
  )
  select dia, sum(estudo), sum(leitura), sum(leitura_total), sum(palavras), sum(anki), sum(escritas)
  from s group by dia order by dia
$function$;
