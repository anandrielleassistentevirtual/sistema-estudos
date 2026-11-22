-- Saúde: passos e sono do app Saúde do iPhone, enviados todo dia por um atalho (app Atalhos) com uma
-- CHAVE PESSOAL (sem login do sistema no iPhone). A chave só serve para gravar passos e sono; no banco fica
-- só o hash, e gerar uma nova invalida a anterior.

create table if not exists public.saude_dias (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  dia date not null,
  passos int,
  sono_min int,          -- minutos dormindo (todas as fases)
  na_cama_min int,       -- minutos "na cama" (iPhone sem relógio registra só isto)
  deitou timestamptz,    -- começo da noite principal
  acordou timestamptz,   -- fim da noite principal
  profundo_min int,
  rem_min int,
  essencial_min int,
  acordado_min int,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia)
);
alter table public.saude_dias enable row level security;
drop policy if exists dono on public.saude_dias;
create policy dono on public.saude_dias for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.saude_chave (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  hash text not null unique,
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz,
  ultimo_resumo text
);
alter table public.saude_chave enable row level security;
drop policy if exists dono on public.saude_chave;
create policy dono on public.saude_chave for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists dono_apaga on public.saude_chave;
create policy dono_apaga on public.saude_chave for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.saude_chave from anon;
revoke all on public.saude_dias from anon;

-- cria (ou troca) a chave e devolve o texto UMA vez
create or replace function public.criar_chave_saude()
returns text language plpgsql security definer set search_path = ''
as $$
declare k text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if (select auth.uid()) is null then raise exception 'sem login'; end if;
  insert into public.saude_chave (user_id, hash) values ((select auth.uid()), encode(extensions.digest(k, 'sha256'), 'hex'))
  on conflict (user_id) do update set hash = excluded.hash, created_at = now(), ultimo_uso = null, ultimo_resumo = null;
  return k;
end $$;
revoke all on function public.criar_chave_saude() from public, anon;
grant execute on function public.criar_chave_saude() to authenticated;

-- o endereço /api/saude chama esta função com os dias já calculados. Campo ausente (null) não apaga o que já existe.
create or replace function public.registrar_saude(p_chave text, p_dias jsonb, p_resumo text default null)
returns int language plpgsql security definer set search_path = ''
as $$
declare c public.saude_chave; d jsonb; n int := 0; dia date; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into c from public.saude_chave where hash = encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex');
  if c.user_id is null then raise exception 'chave inválida'; end if;
  if jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) > 400 then raise exception 'dados inválidos'; end if;
  for d in select * from jsonb_array_elements(p_dias) loop
    dia := (d->>'dia')::date;
    if dia is null or dia > hoje + 1 or dia < hoje - 3660 then continue; end if;
    insert into public.saude_dias as s (user_id, dia, passos, sono_min, na_cama_min, deitou, acordou, profundo_min, rem_min, essencial_min, acordado_min, atualizado_em)
    values (c.user_id, dia,
      least(greatest((d->>'passos')::int, 0), 200000),
      least(greatest((d->>'sono_min')::int, 0), 1440),
      least(greatest((d->>'na_cama_min')::int, 0), 1440),
      (d->>'deitou')::timestamptz, (d->>'acordou')::timestamptz,
      least(greatest((d->>'profundo_min')::int, 0), 1440), least(greatest((d->>'rem_min')::int, 0), 1440),
      least(greatest((d->>'essencial_min')::int, 0), 1440), least(greatest((d->>'acordado_min')::int, 0), 1440),
      now())
    on conflict (user_id, dia) do update set
      passos = coalesce(excluded.passos, s.passos),
      sono_min = case when excluded.sono_min is not null or excluded.na_cama_min is not null then excluded.sono_min else s.sono_min end,
      na_cama_min = case when excluded.sono_min is not null or excluded.na_cama_min is not null then excluded.na_cama_min else s.na_cama_min end,
      deitou = coalesce(excluded.deitou, s.deitou),
      acordou = coalesce(excluded.acordou, s.acordou),
      profundo_min = case when excluded.sono_min is not null then excluded.profundo_min else s.profundo_min end,
      rem_min = case when excluded.sono_min is not null then excluded.rem_min else s.rem_min end,
      essencial_min = case when excluded.sono_min is not null then excluded.essencial_min else s.essencial_min end,
      acordado_min = case when excluded.sono_min is not null or excluded.na_cama_min is not null then excluded.acordado_min else s.acordado_min end,
      atualizado_em = now();
    n := n + 1;
  end loop;
  update public.saude_chave set ultimo_uso = now(), ultimo_resumo = left(p_resumo, 300) where user_id = c.user_id;
  return n;
end $$;
revoke all on function public.registrar_saude(text, jsonb, text) from public;
grant execute on function public.registrar_saude(text, jsonb, text) to anon, authenticated;
