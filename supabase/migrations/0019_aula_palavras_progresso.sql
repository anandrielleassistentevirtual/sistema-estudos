-- Estudos: palavras de cada aula (contadas sozinhas quando o texto muda) e quanto dela já foi lido
alter table public.notes add column if not exists palavras int not null default 0;
alter table public.notes add column if not exists progresso real not null default 0;

create or replace function public.notes_contar_palavras()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.content is distinct from old.content then
    -- mesma regra do sistema: sequências de letras/números (com hífen ou apóstrofo no meio)
    new.palavras := (select count(*) from regexp_matches(coalesce(new.content, ''), '[[:alnum:]]+(?:[''’-][[:alnum:]]+)*', 'g'));
  end if;
  return new;
end;
$$;

drop trigger if exists notes_contar_palavras on public.notes;
create trigger notes_contar_palavras before insert or update of content on public.notes
  for each row execute function public.notes_contar_palavras();

-- aulas que já existem
update public.notes set palavras = (select count(*) from regexp_matches(coalesce(content, ''), '[[:alnum:]]+(?:[''’-][[:alnum:]]+)*', 'g'))
where kind = 'estudo';
update public.notes set progresso = 1 where kind = 'estudo' and completed_at is not null;
