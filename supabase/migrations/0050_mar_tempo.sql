-- MAR com tempo de verdade: minutagem de cada episódio, onde parou no episódio/filme, minutos livres
-- (vídeos e podcasts), Timer ligado a um título e desfazer exato.
-- Regra única: todo minuto do MAR é uma linha de study_sessions (categoria Idiomas, language = idioma,
-- mar_titulo_id = título). mar_log é o livro-caixa das ações: o que mudou (antes/depois), quanto tempo
-- pôs (segundos + sessao_id), quanto veio do Timer (credito). Nenhuma tela soma tempo de outro lugar.
-- Para cada corrida do Timer ligada a um título, conta o MAIOR entre o tempo medido e a minutagem
-- marcada — nunca a soma. A sobra de uma corrida (medido e ainda não virou episódio) cobre episódios
-- marcados até 6 h depois da última gravação dela.
-- Idempotente: pode rodar duas vezes. Não grava dado pessoal (meta e começo do MAR entram pela tela Configurar).

-- versões de rascunho com outra assinatura (nunca aplicadas; por garantia)
drop function if exists public.mar_registrar(uuid, text, int, int, boolean, text, uuid, text);
drop function if exists public.mar_timer(uuid, uuid, int, timestamptz, text);

-- ─── títulos ───
-- min_ep: minutos de cada episódio (série) ou a duração do filme
-- minutagem: exceções em minutos — {"2": 23} (todos os episódios da T2) e {"10.17": 44} (só o T10E17)
-- parcial_seg: segundos do episódio seguinte (ou do filme) que já contaram ("parei em 12 min")
alter table public.mar_titulos add column if not exists minutagem jsonb not null default '{}'::jsonb;
alter table public.mar_titulos add column if not exists parcial_seg int not null default 0;
alter table public.mar_titulos drop constraint if exists mar_titulos_minutagem_check;
alter table public.mar_titulos add constraint mar_titulos_minutagem_check check (jsonb_typeof(minutagem) = 'object');
alter table public.mar_titulos drop constraint if exists mar_titulos_parcial_check;
alter table public.mar_titulos add constraint mar_titulos_parcial_check check (parcial_seg between 0 and 18000);

-- ─── idiomas: meta diária do MAR (o Mairo: no mínimo 1 h por dia) e o começo da etapa ───
alter table public.languages add column if not exists mar_meta_min int not null default 60;
alter table public.languages add column if not exists mar_inicio date;
alter table public.languages drop constraint if exists languages_mar_meta_check;
alter table public.languages add constraint languages_mar_meta_check check (mar_meta_min between 0 and 600);

-- ─── study_sessions: de qual título do MAR é este tempo ───
alter table public.study_sessions add column if not exists mar_titulo_id uuid references public.mar_titulos (id) on delete set null;
create index if not exists study_sessions_mar on public.study_sessions (mar_titulo_id) where mar_titulo_id is not null;

-- ─── livro-caixa ───
alter table public.mar_log add column if not exists tipo text not null default 'ep';
alter table public.mar_log add column if not exists segundos int not null default 0;     -- o que a sessão desta linha (sessao_id) tem
alter table public.mar_log add column if not exists credito jsonb not null default '[]'::jsonb; -- [{"log": id da corrida, "seg": n}]
alter table public.mar_log add column if not exists medido_seg int not null default 0;   -- corrida: tudo o que o Timer mediu
alter table public.mar_log add column if not exists sobra_seg int not null default 0;    -- corrida: o que ainda cobre episódios
alter table public.mar_log add column if not exists sobra_ate timestamptz;               -- corrida: a sobra vale até aqui (última gravação + 6 h)
alter table public.mar_log add column if not exists trechos uuid[] not null default '{}';  -- corrida: gravações do Timer já somadas (reenvio não soma de novo)
alter table public.mar_log add column if not exists sem_timer boolean not null default false; -- "Somar mesmo": não usa nem entra em corrida do Timer
alter table public.mar_log add column if not exists corrida uuid;                        -- a corrida do Timer (linha 'timer' e marcações dentro dela)
alter table public.mar_log add column if not exists inicio timestamptz;                  -- quando a corrida começou
alter table public.mar_log add column if not exists ontem boolean not null default false; -- marcado como "foi ontem"
alter table public.mar_log add column if not exists antes jsonb;                         -- {ep_vistos, parcial_seg, situacao, visto_em}
alter table public.mar_log add column if not exists depois jsonb;
alter table public.mar_log add column if not exists ref text not null default '';        -- "T1E3", "T1E3 até 12 min", "+30 min"
alter table public.mar_log add column if not exists chave uuid;                          -- um clique = uma ação
alter table public.mar_log drop constraint if exists mar_log_tipo_check;
alter table public.mar_log add constraint mar_log_tipo_check check (tipo in ('ep', 'parcial', 'min', 'ajuste', 'timer'));
alter table public.mar_log drop constraint if exists mar_log_numeros_check;
alter table public.mar_log add constraint mar_log_numeros_check check (segundos >= 0 and medido_seg >= 0 and sobra_seg >= 0 and episodios >= 0);
create unique index if not exists mar_log_chave on public.mar_log (user_id, chave) where chave is not null;
create unique index if not exists mar_log_corrida on public.mar_log (user_id, corrida) where tipo = 'timer';
create index if not exists mar_log_titulo_criado on public.mar_log (titulo_id, created_at desc);

-- sessões antigas "MAR · <título> …" (se houver) ganham o vínculo; linhas antigas do livro-caixa ganham os segundos
update public.study_sessions s set mar_titulo_id = t.id
  from public.mar_titulos t
 where s.mar_titulo_id is null and s.category = 'Idiomas' and s.user_id = t.user_id
   and s.language = t.idioma and left(s.label, length('MAR · ' || t.titulo)) = 'MAR · ' || t.titulo;
update public.mar_log l set segundos = s.seconds
  from public.study_sessions s
 where l.sessao_id = s.id and l.segundos = 0;

-- ─── minutagem de um episódio (k = 1 é o T1E1), em segundos ───
create or replace function public.mar_dur_seg(p_temporadas int[], p_minutagem jsonb, p_min_ep int, p_k int)
returns int language sql immutable set search_path = '' as $$
  select 60 * coalesce(
    (select coalesce(
              case when (p_minutagem ->> (x.i || '.' || (p_k - x.antes))) ~ '^[0-9]{1,3}$'
                   then nullif((p_minutagem ->> (x.i || '.' || (p_k - x.antes)))::int, 0) end,
              case when (p_minutagem ->> x.i::text) ~ '^[0-9]{1,3}$'
                   then nullif((p_minutagem ->> x.i::text)::int, 0) end)
       from (select i, n, coalesce(sum(n) over (order by i rows between unbounded preceding and 1 preceding), 0) as antes
               from unnest(p_temporadas) with ordinality as u(n, i)) x
      where p_k > x.antes and p_k <= x.antes + x.n),
    p_min_ep, 25)
$$;

-- "T2E5" do episódio k
create or replace function public.mar_ref(p_temporadas int[], p_k int)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    (select 'T' || x.i || 'E' || (p_k - x.antes)
       from (select i, n, coalesce(sum(n) over (order by i rows between unbounded preceding and 1 preceding), 0) as antes
               from unnest(p_temporadas) with ordinality as u(n, i)) x
      where p_k > x.antes and p_k <= x.antes + x.n),
    'E' || p_k)
$$;

-- ─── recalcula uma corrida do Timer: ela grava só o que passar da minutagem marcada durante ela ───
create or replace function public.mar_corrida_acertar(p_log uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  r public.mar_log;
  t public.mar_titulos;
  declarado int;
  excesso int;
  consumido int;
  sess uuid;
  m record;
begin
  select * into r from public.mar_log where id = p_log and tipo = 'timer' for update;
  if not found then return; end if;
  -- a sessão desta corrida foi apagada à mão (tela do Timer): esse tempo não volta
  if r.segundos > 0 and r.sessao_id is null then
    update public.mar_log set medido_seg = 0, segundos = 0, sobra_seg = 0 where id = r.id;
    return;
  end if;
  select * into t from public.mar_titulos where id = r.titulo_id;
  -- a parte de cada marcação que o Timer pode ter medido: no máximo o tempo da corrida que já tinha passado
  -- quando ela foi marcada (um episódio de ontem marcado aos 5 min da corrida só tira 5 min do Timer).
  -- Só conta a minutagem que ainda está no estudo (sessão apagada à mão não conta).
  declarado := 0;
  for m in
    select l.created_at, s.seconds
      from public.mar_log l join public.study_sessions s on s.id = l.sessao_id
     where l.corrida = r.corrida and l.tipo <> 'timer'
     order by l.created_at, l.id
  loop
    declarado := declarado + least(m.seconds, greatest(0, floor(extract(epoch from m.created_at - r.inicio))::int - declarado));
  end loop;
  excesso := greatest(0, r.medido_seg - declarado);
  select coalesce(sum((e ->> 'seg')::int), 0) into consumido
    from public.mar_log l, jsonb_array_elements(l.credito) e
   where l.titulo_id = r.titulo_id and (e ->> 'log')::uuid = r.id;
  sess := r.sessao_id;
  if excesso > 0 and sess is null then
    insert into public.study_sessions (day, started_at, seconds, category, label, language, mar_titulo_id)
    values (r.dia, r.inicio, excesso, 'Idiomas', 'MAR · ' || t.titulo, t.idioma, t.id)
    returning id into sess;
  elsif excesso > 0 then
    update public.study_sessions set seconds = excesso where id = sess;
  elsif sess is not null then
    delete from public.study_sessions where id = sess;
    sess := null;
  end if;
  update public.mar_log set segundos = excesso, sessao_id = sess, sobra_seg = greatest(0, excesso - consumido) where id = r.id;
end $$;

-- ─── marcar: episódio(s), "parei em", minutos livres ou posição corrigida ───
-- p_acao: 'ep' (p_valor episódios, padrão 1; filme: o filme inteiro) · 'parcial' (p_valor = minuto em que parou)
--         'min' (p_valor minutos) · 'ajuste' (p_valor = episódios vistos, p_parcial_min, p_situacao — o que vier
--         nulo fica como está; não soma tempo)
create or replace function public.mar_registrar(
  p_titulo uuid, p_acao text, p_valor int default null, p_parcial_min int default null,
  p_ontem boolean default false, p_tz text default 'America/Sao_Paulo', p_chave uuid default null,
  p_situacao text default null,
  p_ep_esperado int default null,      -- ep_vistos que a tela mostrava: se mudou (outro aparelho), não grava
  p_sem_timer boolean default false    -- "Somar mesmo": não usa a sobra do Timer nem entra em corrida
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  t public.mar_titulos;
  ja public.mar_log;
  c record;
  total int;
  n int := 0;
  k int;
  d int := 0;          -- minutagem declarada (segundos)
  resto int;           -- o que falta contar depois do crédito do Timer
  usado int := 0;
  fim int;
  credito jsonb := '[]'::jsonb;
  hoje date;
  dia date;
  inicio timestamptz;
  ref text := '';
  rotulo text;
  sess uuid;
  log_id uuid;
  no_dia bigint;
  ep_novo int; parcial_novo int; sit_nova text; visto_novo timestamptz;
begin
  begin
    hoje := (now() at time zone p_tz)::date;
  exception when others then
    p_tz := 'America/Sao_Paulo';
    hoje := (now() at time zone p_tz)::date;
  end;

  -- a trava do título enfileira cliques e aparelhos: um de cada vez
  select * into t from public.mar_titulos where id = p_titulo for update;
  if not found then raise exception 'MAR: título não encontrado'; end if;

  -- o mesmo clique chegando duas vezes não marca duas vezes
  if p_chave is not null then
    select * into ja from public.mar_log where chave = p_chave;
    if found then
      return jsonb_build_object('log', ja.id, 'segundos', ja.segundos, 'ref', ja.ref, 'dia', ja.dia, 'repetido', true,
                                'titulo', to_jsonb(t));
    end if;
  end if;

  -- a tela estava velha (outro aparelho já marcou): não grava, devolve o título como está
  if p_ep_esperado is not null and p_ep_esperado <> t.ep_vistos then
    return jsonb_build_object('conflito', true, 'ep_vistos', t.ep_vistos, 'titulo', to_jsonb(t));
  end if;

  total := coalesce((select sum(x) from unnest(t.temporadas) x), 0);
  ep_novo := t.ep_vistos; parcial_novo := t.parcial_seg; sit_nova := t.situacao; visto_novo := t.visto_em;

  if p_acao = 'ep' then
    if t.tipo = 'serie' and total > 0 then
      if coalesce(p_valor, 1) > 20 then raise exception 'MAR: no máximo 20 episódios de uma vez'; end if;
      n := least(greatest(coalesce(p_valor, 1), 1), total - t.ep_vistos);
      if n <= 0 then raise exception 'MAR: a série já acabou'; end if;
      for k in t.ep_vistos + 1 .. t.ep_vistos + n loop
        d := d + public.mar_dur_seg(t.temporadas, t.minutagem, t.min_ep, k);
      end loop;
      d := greatest(0, d - t.parcial_seg);
      ref := public.mar_ref(t.temporadas, t.ep_vistos + 1)
          || case when n > 1 then '–' || public.mar_ref(t.temporadas, t.ep_vistos + n) else '' end;
      ep_novo := t.ep_vistos + n; parcial_novo := 0;
      if ep_novo >= total then sit_nova := 'visto'; visto_novo := now();
      elsif t.situacao = 'quero' then sit_nova := 'assistindo'; end if;
    elsif t.tipo = 'filme' then
      if t.situacao = 'visto' then raise exception 'MAR: o filme já está em Vistos'; end if;
      d := greatest(0, t.min_ep * 60 - t.parcial_seg);
      parcial_novo := 0; sit_nova := 'visto'; visto_novo := now();
    else
      raise exception 'MAR: para vídeos e podcasts, some minutos';
    end if;

  elsif p_acao = 'parcial' then
    if t.tipo = 'serie' and total > 0 then
      if t.ep_vistos >= total then raise exception 'MAR: a série já acabou'; end if;
      fim := public.mar_dur_seg(t.temporadas, t.minutagem, t.min_ep, t.ep_vistos + 1);
      ref := public.mar_ref(t.temporadas, t.ep_vistos + 1);
    elsif t.tipo = 'filme' then
      fim := t.min_ep * 60;
    else
      raise exception 'MAR: para vídeos e podcasts, some minutos';
    end if;
    -- só anda para a frente e para antes do fim (no fim, é "+ episódio")
    if p_valor is null or p_valor * 60 <= t.parcial_seg or p_valor * 60 >= fim then
      raise exception 'MAR: o minuto tem de ser depois de % e antes de %', t.parcial_seg / 60, fim / 60;
    end if;
    d := p_valor * 60 - t.parcial_seg;
    parcial_novo := p_valor * 60;
    ref := ltrim(ref || ' até ' || p_valor || ' min');
    if t.situacao = 'quero' then sit_nova := 'assistindo'; end if;

  elsif p_acao = 'min' then
    if p_valor is null or p_valor < 1 or p_valor > 300 then raise exception 'MAR: de 1 a 300 minutos'; end if;
    d := p_valor * 60;
    ref := '+' || p_valor || ' min';
    if t.situacao = 'quero' then sit_nova := 'assistindo'; end if;

  elsif p_acao = 'ajuste' then
    -- posição corrigida à mão (editor de temporadas, "assistir de novo", ✓ sem tempo): não soma tempo
    -- sem p_valor / p_parcial_min: a posição fica como está (ex.: ✓ terminei sem ver o resto)
    ep_novo := least(greatest(coalesce(p_valor, t.ep_vistos), 0), total);
    -- (greatest ignora nulos: por isso o case)
    parcial_novo := case when p_parcial_min is not null then greatest(p_parcial_min, 0) * 60
                         when ep_novo = t.ep_vistos then t.parcial_seg else 0 end;
    fim := case when t.tipo = 'serie' and ep_novo < total then public.mar_dur_seg(t.temporadas, t.minutagem, t.min_ep, ep_novo + 1)
                when t.tipo = 'filme' then t.min_ep * 60 else 0 end;
    if parcial_novo > 0 and parcial_novo >= fim then raise exception 'MAR: "parei em" passa do fim'; end if;
    if p_situacao is not null then
      if p_situacao not in ('quero', 'assistindo', 'visto') then raise exception 'MAR: situação inválida'; end if;
      sit_nova := p_situacao;
      visto_novo := case when p_situacao = 'visto' then coalesce(t.visto_em, now()) else null end;
    end if;
    ref := case when p_situacao = 'visto' then 'terminei'
                when ep_novo = 0 and parcial_novo = 0 then 'do início'
                else 'posição ' || case when ep_novo > 0 then public.mar_ref(t.temporadas, ep_novo) else 'início' end end;
  else
    raise exception 'MAR: ação desconhecida (%)', p_acao;
  end if;

  -- o dia: o do começo do que foi visto (a mesma regra do Timer); "foi ontem" = ontem
  if p_ontem then
    dia := hoje - 1;
    inicio := (dia + time '12:00') at time zone p_tz;
  else
    inicio := now() - make_interval(secs => d);
    dia := (inicio at time zone p_tz)::date;
  end if;

  -- tempo do Timer deste título que ainda não virou episódio: cobre primeiro (não conta duas vezes)
  resto := d;
  if resto > 0 and not p_sem_timer then
    for c in
      select l.id, l.sobra_seg from public.mar_log l
       where l.titulo_id = t.id and l.tipo = 'timer' and l.sobra_seg > 0 and l.sessao_id is not null and l.sobra_ate >= now()
       order by l.created_at desc
         for update
    loop
      exit when resto = 0;
      k := least(c.sobra_seg, resto);
      update public.mar_log set sobra_seg = sobra_seg - k where id = c.id;
      credito := credito || jsonb_build_array(jsonb_build_object('log', c.id, 'seg', k));
      usado := usado + k;
      resto := resto - k;
    end loop;
  end if;

  if resto > 0 then
    select coalesce(sum(seconds), 0) into no_dia from public.study_sessions
     where day = dia and category = 'Idiomas' and language = t.idioma and mar_titulo_id is not null;
    if no_dia + resto > 16 * 3600 then raise exception 'MAR: passaria de 16 h num dia — confira'; end if;
    rotulo := 'MAR · ' || t.titulo || case when p_acao in ('ep', 'parcial') and ref <> '' then ' ' || ref else '' end;
    insert into public.study_sessions (day, started_at, seconds, category, label, language, mar_titulo_id)
    values (dia, inicio, resto, 'Idiomas', rotulo, t.idioma, t.id)
    returning id into sess;
  end if;

  update public.mar_titulos
     set ep_vistos = ep_novo, parcial_seg = parcial_novo, situacao = sit_nova, visto_em = visto_novo
   where id = t.id;

  insert into public.mar_log (titulo_id, dia, episodios, tipo, segundos, credito, sessao_id, ontem, sem_timer, inicio, antes, depois, ref, chave)
  values (t.id, case when p_acao = 'ajuste' then hoje else dia end,
          case when p_acao = 'ep' and t.tipo = 'serie' then n else 0 end,
          p_acao, case when sess is null then 0 else resto end, credito, sess, p_ontem, p_sem_timer, inicio,
          jsonb_build_object('ep_vistos', t.ep_vistos, 'parcial_seg', t.parcial_seg, 'situacao', t.situacao, 'visto_em', t.visto_em),
          jsonb_build_object('ep_vistos', ep_novo, 'parcial_seg', parcial_novo, 'situacao', sit_nova, 'visto_em', visto_novo),
          ref, p_chave)
  returning id into log_id;

  return jsonb_build_object('log', log_id, 'declarado', d, 'coberto', usado, 'segundos', case when sess is null then 0 else resto end,
                            'dia', dia, 'ref', ref, 'ep_vistos', ep_novo, 'parcial_seg', parcial_novo, 'situacao', sit_nova, 'visto_em', visto_novo,
                            'sessao', sess, 'titulo', (select to_jsonb(x) from public.mar_titulos x where x.id = t.id));
end $$;

-- ─── Timer ligado a um título: grava a corrida (chamado a cada vez que o Timer salva) ───
create or replace function public.mar_timer(
  p_corrida uuid, p_titulo uuid, p_segundos int, p_desde timestamptz, p_tz text default 'America/Sao_Paulo',
  p_trecho uuid default null   -- uma gravação do Timer: reenviada (rede caiu), não soma de novo
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  t public.mar_titulos;
  r public.mar_log;
  dia date;
begin
  begin
    perform now() at time zone p_tz;
  exception when others then
    p_tz := 'America/Sao_Paulo';
  end;
  if p_corrida is null or coalesce(p_segundos, 0) < 1 then return null; end if;
  select * into t from public.mar_titulos where id = p_titulo for update;
  if not found then raise exception 'MAR: título não encontrado'; end if;
  select * into r from public.mar_log where corrida = p_corrida and tipo = 'timer' for update;
  if not found then
    -- a corrida durou pelo menos o que o Timer mediu (relógio do aparelho adiantado não encurta a janela)
    p_desde := least(coalesce(p_desde, now()), now() - make_interval(secs => p_segundos));
    dia := (p_desde at time zone p_tz)::date;
    insert into public.mar_log (titulo_id, dia, episodios, tipo, medido_seg, corrida, inicio, sobra_ate, ref, trechos)
    values (t.id, dia, 0, 'timer', least(p_segundos, 16 * 3600), p_corrida, p_desde, now() + interval '6 hours', 'Timer',
            case when p_trecho is null then '{}'::uuid[] else array[p_trecho] end)
    returning * into r;
  elsif p_trecho is not null and p_trecho = any (r.trechos) then
    return r.sessao_id;   -- esta gravação já foi somada
  else
    update public.mar_log set medido_seg = least(medido_seg + p_segundos, 16 * 3600), sobra_ate = now() + interval '6 hours',
           trechos = case when p_trecho is null then trechos else trechos || p_trecho end
     where id = r.id returning * into r;
  end if;
  -- o que foi marcado deste título enquanto a corrida durou (em qualquer aparelho) é parte dela
  update public.mar_log set corrida = p_corrida
   where titulo_id = t.id and tipo in ('ep', 'parcial', 'min') and corrida is null and not ontem and not sem_timer
     and created_at >= r.inicio and created_at <= now();
  perform public.mar_corrida_acertar(r.id);
  return (select sessao_id from public.mar_log where id = r.id);
end $$;

-- ─── desfazer a última ação de um título: devolve exatamente o estado anterior ───
create or replace function public.mar_desfazer(p_titulo uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  t public.mar_titulos;
  l public.mar_log;
  e jsonb;
  tr uuid;
begin
  select * into t from public.mar_titulos where id = p_titulo for update;
  if not found then raise exception 'MAR: título não encontrado'; end if;
  select * into l from public.mar_log
   where titulo_id = t.id and tipo <> 'timer'
   order by created_at desc, id desc limit 1
     for update;
  if not found then return null; end if;
  if l.sessao_id is not null then delete from public.study_sessions where id = l.sessao_id; end if;
  -- linhas de antes desta migração (sem "antes"): volta só os episódios, como o −1 antigo
  update public.mar_titulos set
    ep_vistos = coalesce((l.antes ->> 'ep_vistos')::int, greatest(0, ep_vistos - l.episodios)),
    parcial_seg = coalesce((l.antes ->> 'parcial_seg')::int, parcial_seg),
    -- a situação só volta se ninguém mexeu nela depois
    situacao = case when l.antes is not null and situacao = l.depois ->> 'situacao' then l.antes ->> 'situacao' else situacao end,
    visto_em = case when l.antes is not null and situacao = l.depois ->> 'situacao' then (l.antes ->> 'visto_em')::timestamptz else visto_em end
  where id = t.id;
  tr := l.corrida;
  delete from public.mar_log where id = l.id;
  -- o tempo do Timer que esta ação usou volta a ser sobra
  for e in select * from jsonb_array_elements(l.credito) loop
    perform public.mar_corrida_acertar((e ->> 'log')::uuid);
  end loop;
  -- ação de dentro de uma corrida: o Timer volta a contar esse tempo (nenhum minuto medido se perde)
  if tr is not null then
    perform public.mar_corrida_acertar((select id from public.mar_log where corrida = tr and tipo = 'timer'));
  end if;
  -- devolve o título como ficou (a tela troca o cartão sem outra consulta)
  return jsonb_build_object('ref', l.ref, 'segundos', l.segundos, 'tipo', l.tipo,
    'titulo', (select to_jsonb(x) from public.mar_titulos x where x.id = t.id));
end $$;

-- ─── apagar uma sessão do MAR na tela do Timer: o resto do livro-caixa continua certo ───
-- sessão de uma corrida do Timer: os episódios que ela cobria voltam a contar pela minutagem;
-- sessão de um episódio que estava dentro de uma corrida: o Timer volta a contar esse tempo.
create or replace function public.mar_apagar_sessao(p_sessao uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  s public.study_sessions;
  t public.mar_titulos;
  r public.mar_log;
  c record;
  nova uuid;
begin
  select * into s from public.study_sessions where id = p_sessao;
  if not found then return; end if;
  if s.mar_titulo_id is not null then
    select * into t from public.mar_titulos where id = s.mar_titulo_id for update;
  end if;
  select * into r from public.mar_log where sessao_id = p_sessao for update;
  delete from public.study_sessions where id = p_sessao;
  if r.id is null then return; end if;
  if r.tipo = 'timer' then
    for c in
      select l.id, l.tipo, l.dia, l.inicio, l.ref, l.sessao_id, l.corrida, (e ->> 'seg')::int as seg, e as item
        from public.mar_log l, jsonb_array_elements(l.credito) e
       where l.titulo_id = r.titulo_id and (e ->> 'log')::uuid = r.id
    loop
      if c.sessao_id is not null then
        update public.study_sessions set seconds = seconds + c.seg where id = c.sessao_id;
        nova := c.sessao_id;
      else
        insert into public.study_sessions (day, started_at, seconds, category, label, language, mar_titulo_id)
        values (c.dia, coalesce(c.inicio, now()), c.seg, 'Idiomas',
                'MAR · ' || t.titulo || case when c.tipo in ('ep', 'parcial') and c.ref <> '' then ' ' || c.ref else '' end, t.idioma, t.id)
        returning id into nova;
      end if;
      update public.mar_log set sessao_id = nova, segundos = segundos + c.seg,
             credito = (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(credito) x where x <> c.item)
       where id = c.id;
      if c.corrida is not null then
        perform public.mar_corrida_acertar((select id from public.mar_log where corrida = c.corrida and tipo = 'timer'));
      end if;
    end loop;
    update public.mar_log set medido_seg = 0, segundos = 0, sobra_seg = 0 where id = r.id;
  else
    update public.mar_log set segundos = 0 where id = r.id;
    if r.corrida is not null then
      perform public.mar_corrida_acertar((select id from public.mar_log where corrida = r.corrida and tipo = 'timer'));
    end if;
  end if;
end $$;

-- ─── uma sessão do Timer em Idiomas que não estava ligada a título ("Inglês · Netflix") passa a ser do MAR ───
-- (a tela pergunta: "o Timer salvou 23 min de Inglês — este episódio está nesse tempo?"). Ela vira uma corrida:
-- o episódio marcado em seguida usa esse tempo em vez de somar de novo.
create or replace function public.mar_vincular_sessao(p_sessao uuid, p_titulo uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  t public.mar_titulos;
  s public.study_sessions;
  r public.mar_log;
  c uuid := gen_random_uuid();
begin
  select * into t from public.mar_titulos where id = p_titulo for update;
  if not found then raise exception 'MAR: título não encontrado'; end if;
  select * into s from public.study_sessions where id = p_sessao for update;
  if not found or s.category <> 'Idiomas' or s.language is distinct from t.idioma or s.mar_titulo_id is not null then
    raise exception 'MAR: essa sessão não pode virar MAR';
  end if;
  update public.study_sessions set mar_titulo_id = t.id, label = 'MAR · ' || t.titulo where id = s.id;
  insert into public.mar_log (titulo_id, dia, episodios, tipo, segundos, medido_seg, sobra_seg, sessao_id, corrida, inicio, sobra_ate, ref)
  values (t.id, s.day, 0, 'timer', s.seconds, s.seconds, s.seconds, s.id, c, s.started_at,
          greatest(now(), s.started_at + make_interval(secs => s.seconds)) + interval '6 hours', 'Timer')
  returning * into r;
  -- o que já foi marcado deste título enquanto aquela sessão corria é parte dela
  update public.mar_log set corrida = c
   where titulo_id = t.id and tipo in ('ep', 'parcial', 'min') and corrida is null and not ontem and not sem_timer
     and created_at >= s.started_at and created_at <= s.started_at + make_interval(secs => s.seconds) + interval '10 minutes';
  perform public.mar_corrida_acertar(r.id);
  return r.id;
end $$;

revoke all on function public.mar_vincular_sessao(uuid, uuid) from public, anon;
grant execute on function public.mar_vincular_sessao(uuid, uuid) to authenticated;
revoke all on function public.mar_apagar_sessao(uuid) from public, anon;
grant execute on function public.mar_apagar_sessao(uuid) to authenticated;
revoke all on function public.mar_registrar(uuid, text, int, int, boolean, text, uuid, text, int, boolean) from public, anon;
revoke all on function public.mar_timer(uuid, uuid, int, timestamptz, text, uuid) from public, anon;
revoke all on function public.mar_dur_seg(int[], jsonb, int, int) from public, anon;
revoke all on function public.mar_ref(int[], int) from public, anon;
revoke all on function public.mar_desfazer(uuid) from public, anon;
revoke all on function public.mar_corrida_acertar(uuid) from public, anon;
grant execute on function public.mar_registrar(uuid, text, int, int, boolean, text, uuid, text, int, boolean) to authenticated;
grant execute on function public.mar_timer(uuid, uuid, int, timestamptz, text, uuid) to authenticated;
grant execute on function public.mar_desfazer(uuid) to authenticated;
grant execute on function public.mar_corrida_acertar(uuid) to authenticated;
grant execute on function public.mar_dur_seg(int[], jsonb, int, int) to authenticated;
grant execute on function public.mar_ref(int[], int) to authenticated;
