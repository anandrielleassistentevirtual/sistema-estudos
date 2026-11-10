-- Estudos: quando as anotações da aula foram mexidas pela última vez (para ordenar e identificar depois)
alter table public.notes add column if not exists anotacoes_em timestamptz;
update public.notes set anotacoes_em = updated_at where anotacoes <> '' and anotacoes_em is null;
create index if not exists notes_anotacoes_em on public.notes (user_id, anotacoes_em desc) where anotacoes <> '';
