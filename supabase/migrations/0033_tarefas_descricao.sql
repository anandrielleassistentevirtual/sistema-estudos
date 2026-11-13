-- Tarefas: descrição opcional (detalhes, passos, o que o professor pediu)
alter table public.estudo_tarefas add column if not exists descricao text not null default '';
