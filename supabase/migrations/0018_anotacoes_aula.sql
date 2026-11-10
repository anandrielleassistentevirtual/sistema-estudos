-- Estudos: anotações pessoais de cada aula (separadas da transcrição)
alter table public.notes add column if not exists anotacoes text not null default '';
