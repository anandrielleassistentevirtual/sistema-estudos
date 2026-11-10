-- Estudos: status da aula igual ao dos livros (aguardando, lendo, pausado, lido)
alter table public.notes add column if not exists situacao text not null default 'aguardando';
alter table public.notes drop constraint if exists notes_situacao_check;
alter table public.notes add constraint notes_situacao_check check (situacao in ('aguardando', 'lendo', 'pausado', 'lido'));

update public.notes set situacao = case
  when completed_at is not null then 'lido'
  when progresso > 0.01 then 'lendo'
  else 'aguardando'
end
where kind = 'estudo';
