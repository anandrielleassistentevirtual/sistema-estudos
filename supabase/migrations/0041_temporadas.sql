-- Temporadas (ano de 12 semanas + sazonalidade): cada estação do ano é uma temporada de 13 semanas
-- (12 de execução + 1 de revisão). O plano guarda os minutos por dia previstos para cada área;
-- as metas (1 a 3) ligam a temporada a livros, cursos, escrita ou horas, e o sistema projeta com o ritmo real.
create table if not exists public.temporadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ano int not null,
  estacao text not null check (estacao in ('verao', 'outono', 'inverno', 'primavera')),
  inicio date not null,
  fim date not null,
  comeca_em date not null,          -- quando você começou de fato (meia temporada)
  plano jsonb not null default '{}', -- { leitura: min/dia, estudos, idiomas, escrita, pesquisa, exercicio }
  nota text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, ano, estacao)
);
alter table public.temporadas enable row level security;
drop policy if exists dono on public.temporadas;
create policy dono on public.temporadas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.temporada_metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  temporada_id uuid not null references public.temporadas on delete cascade,
  area text not null check (area in ('leitura', 'estudos', 'idiomas', 'escrita', 'pesquisa', 'exercicio')),
  tipo text not null check (tipo in ('livros', 'curso', 'palavras', 'horas')),
  titulo text not null,
  alvo numeric not null default 0,  -- palavras ou horas (livros e curso: o que falta vem dos próprios itens)
  refs jsonb not null default '[]',  -- ids de livros, a pasta do curso, o projeto de escrita…
  posicao int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.temporada_metas enable row level security;
drop policy if exists dono on public.temporada_metas;
create policy dono on public.temporada_metas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists temporada_metas_temporada on public.temporada_metas (temporada_id);

-- Exercício não é tempo de estudo: fica fora dos indicadores intelectuais (aparece nas Temporadas)
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
     where day >= desde and category <> 'Exercício' and not (label like 'Anki ·%' and (select ligado from ankiweb))
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
