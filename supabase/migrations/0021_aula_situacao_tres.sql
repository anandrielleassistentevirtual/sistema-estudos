-- Estudos: três status para as aulas — pendente, lendo, concluída
alter table public.notes drop constraint if exists notes_situacao_check;
update public.notes set situacao = case situacao
  when 'aguardando' then 'pendente'
  when 'pausado' then 'lendo'
  when 'lido' then 'concluida'
  else situacao
end;
alter table public.notes alter column situacao set default 'pendente';
alter table public.notes add constraint notes_situacao_check check (situacao in ('pendente', 'lendo', 'concluida'));
