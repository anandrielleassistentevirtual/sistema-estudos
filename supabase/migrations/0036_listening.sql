-- Listening: um script no navegador (Tampermonkey) mede o áudio que toca de verdade no site do curso
-- e manda os segundos para cá com uma CHAVE PESSOAL (sem senha do curso, sem login do sistema).
-- A chave só serve para isto: somar minutos de escuta no idioma dela. Guardamos só o hash; dá para cancelar.
create table if not exists public.integracao_chaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  idioma text not null,
  hash text not null unique,
  created_at timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogada boolean not null default false
);
alter table public.integracao_chaves enable row level security;
drop policy if exists dono on public.integracao_chaves;
create policy dono on public.integracao_chaves for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists integracao_chaves_user on public.integracao_chaves (user_id);

-- cria a chave e devolve o texto UMA vez (no banco fica só o hash)
create or replace function public.criar_chave_listening(p_idioma text)
returns text language plpgsql security definer set search_path = ''
as $$
declare k text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if (select auth.uid()) is null then raise exception 'sem login'; end if;
  insert into public.integracao_chaves (user_id, idioma, hash)
  values ((select auth.uid()), p_idioma, encode(extensions.digest(k, 'sha256'), 'hex'));
  return k;
end $$;
revoke all on function public.criar_chave_listening(text) from public, anon;
grant execute on function public.criar_chave_listening(text) to authenticated;

-- o script chama esta função: soma os segundos na sessão "Listening (Mairo)" do dia, no idioma da chave
create or replace function public.registrar_escuta(p_chave text, p_segundos int, p_dia date)
returns int language plpgsql security definer set search_path = ''
as $$
declare c public.integracao_chaves; s int; hoje date := (now() at time zone 'America/Sao_Paulo')::date; ja int;
begin
  select * into c from public.integracao_chaves
   where hash = encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex') and not revogada;
  if c.id is null then raise exception 'chave inválida'; end if;
  s := least(greatest(coalesce(p_segundos, 0), 0), 900);          -- no máximo 15 min por envio
  if s = 0 then return 0; end if;
  if p_dia is null or p_dia < hoje - 1 or p_dia > hoje + 1 then p_dia := hoje; end if;
  select coalesce(sum(seconds), 0) into ja from public.study_sessions
   where user_id = c.user_id and day = p_dia and category = 'Idiomas' and label = 'Listening (Mairo)';
  s := least(s, greatest(0, 16 * 3600 - ja));                      -- no máximo 16 h por dia
  if s = 0 then return 0; end if;
  update public.study_sessions set seconds = seconds + s
   where id = (select id from public.study_sessions
                where user_id = c.user_id and day = p_dia and category = 'Idiomas' and label = 'Listening (Mairo)' and language = c.idioma
                order by started_at limit 1);
  if not found then
    insert into public.study_sessions (user_id, day, started_at, seconds, category, label, language)
    values (c.user_id, p_dia, now(), s, 'Idiomas', 'Listening (Mairo)', c.idioma);
  end if;
  update public.integracao_chaves set ultimo_uso = now() where id = c.id;
  return s;
end $$;
revoke all on function public.registrar_escuta(text, int, date) from public;
grant execute on function public.registrar_escuta(text, int, date) to anon, authenticated;

-- a tabela de chaves nem é visível para quem não está logado
revoke all on public.integracao_chaves from anon;
