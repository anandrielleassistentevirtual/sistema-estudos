-- O nome do registro passa a ser só "Listening" (não importa de onde vem o áudio).
update public.study_sessions set label = 'Listening' where label = 'Listening (Mairo)';
-- registrar_escuta: a mesma função, gravando com o rótulo "Listening"
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
   where user_id = c.user_id and day = p_dia and category = 'Idiomas' and label = 'Listening';
  s := least(s, greatest(0, 16 * 3600 - ja));                      -- no máximo 16 h por dia
  if s = 0 then return 0; end if;
  update public.study_sessions set seconds = seconds + s
   where id = (select id from public.study_sessions
                where user_id = c.user_id and day = p_dia and category = 'Idiomas' and label = 'Listening' and language = c.idioma
                order by started_at limit 1);
  if not found then
    insert into public.study_sessions (user_id, day, started_at, seconds, category, label, language)
    values (c.user_id, p_dia, now(), s, 'Idiomas', 'Listening', c.idioma);
  end if;
  update public.integracao_chaves set ultimo_uso = now() where id = c.id;
  return s;
end $$;
