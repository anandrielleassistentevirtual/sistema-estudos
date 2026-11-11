-- Dashboard e calendário: os totais já somados por dia (uma linha por dia), em vez de baixar cada sessão.
-- Roda com a permissão de quem chama: as regras "dono" de cada tabela continuam valendo.
create or replace function public.estatisticas_por_dia(desde date)
returns table (dia date, estudo bigint, leitura bigint, leitura_total bigint, palavras bigint, anki bigint, escritas bigint)
language sql stable security invoker set search_path = '' as $$
  with s as (
    select day as dia, seconds::bigint as estudo, 0::bigint as leitura, 0::bigint as leitura_total, 0::bigint as palavras, 0::bigint as anki, 0::bigint as escritas
      from public.study_sessions where day >= desde
    union all
    -- leitura feita com o timer ligado já está no tempo do timer: entra só no total de leitura (para o ppm)
    select day, 0, case when during_timer then 0 else seconds end, seconds, words, 0, 0
      from public.reading_sessions where day >= desde
    union all
    select day, 0, 0, 0, 0, reviews, 0 from public.anki_daily where day >= desde
    union all
    select dia, 0, 0, 0, 0, 0, greatest(0, palavras) from public.escrita_sessoes where dia >= desde
  )
  select dia, sum(estudo), sum(leitura), sum(leitura_total), sum(palavras), sum(anki), sum(escritas)
  from s group by dia order by dia
$$;
revoke execute on function public.estatisticas_por_dia(date) from public, anon;
grant execute on function public.estatisticas_por_dia(date) to authenticated;
