-- Estudos: as palavras de uma aula não contam o glossário do fim ("## Glossário…", que o leitor esconde e mostra
-- só nos balões dos termos), e um termo marcado [[#Termo|texto]] conta só o texto que aparece.
create or replace function public.texto_para_contar(t text)
returns text language sql immutable set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(t, ''), E'\\n##[ \\t]+Gloss[áa]rio.*$', ''),
             E'\\[\\[[^]|\\n]*\\|([^]\\n]*)\\]\\]', E'\\1', 'g'),
           E'\\[\\[[^]#\\n]*#?([^]\\n]*)\\]\\]', E'\\1', 'g')
$$;

create or replace function public.notes_contar_palavras()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    -- mesma regra do sistema: sequências de letras/números (com hífen ou apóstrofo no meio)
    new.palavras := (select count(*) from regexp_matches(public.texto_para_contar(new.content), '[[:alnum:]]+(?:[''’-][[:alnum:]]+)*', 'g'));
  end if;
  return new;
end;
$$;
