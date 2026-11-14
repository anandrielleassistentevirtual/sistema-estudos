-- registrar_escuta ganha o tipo: 'listening' (áudio, padrão) ou 'aula' (aula em vídeo do curso) → rótulos "Listening" / "Aulas".
drop function if exists public.registrar_escuta(text, int, date);
create or replace function public.registrar_escuta(p_chave text, p_segundos int, p_dia date, p_tipo text default 'listening')
returns int language plpgsql security definer set search_path = ''
as $$
declare c public.integracao_chaves; s int; hoje date := (now() at time zone 'America/Sao_Paulo')::date; ja int;
        rotulo text := case when p_tipo = 'aula' then 'Aulas' else 'Listening' end;
begin
  select * into c from public.integracao_chaves
   where hash = encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex') and not revogada;
  if c.id is null then raise exception 'chave inválida'; end if;
  s := least(greatest(coalesce(p_segundos, 0), 0), 900);
  if s = 0 then return 0; end if;
  if p_dia is null or p_dia < hoje - 1 or p_dia > hoje + 1 then p_dia := hoje; end if;
  select coalesce(sum(seconds), 0) into ja from public.study_sessions
   where user_id = c.user_id and day = p_dia and category = 'Idiomas' and label = rotulo;
  s := least(s, greatest(0, 16 * 3600 - ja));
  if s = 0 then return 0; end if;
  update public.study_sessions set seconds = seconds + s
   where id = (select id from public.study_sessions
                where user_id = c.user_id and day = p_dia and category = 'Idiomas' and label = rotulo and language = c.idioma
                order by started_at limit 1);
  if not found then
    insert into public.study_sessions (user_id, day, started_at, seconds, category, label, language)
    values (c.user_id, p_dia, now(), s, 'Idiomas', rotulo, c.idioma);
  end if;
  update public.integracao_chaves set ultimo_uso = now() where id = c.id;
  return s;
end $$;
revoke all on function public.registrar_escuta(text, int, date, text) from public;
grant execute on function public.registrar_escuta(text, int, date, text) to anon, authenticated;
