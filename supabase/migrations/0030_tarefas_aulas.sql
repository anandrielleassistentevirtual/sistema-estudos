-- Tarefas ligadas às aulas: de qual aula veio a tarefa e antes de qual aula ela precisa estar feita.
alter table public.estudo_tarefas add column if not exists aula_id uuid references public.notes on delete set null;
alter table public.estudo_tarefas add column if not exists antes_de uuid references public.notes on delete set null;
create index if not exists estudo_tarefas_aula on public.estudo_tarefas (aula_id) where aula_id is not null;
create index if not exists estudo_tarefas_antes on public.estudo_tarefas (antes_de) where antes_de is not null;
