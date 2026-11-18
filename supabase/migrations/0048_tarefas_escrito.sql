-- Tarefas de escrever: o texto fica na própria tarefa (folha aberta nas Tarefas), não mais num projeto da sala de Escrita.
-- As sessões de escrita podem ser de uma tarefa (sem projeto), para as palavras contarem como escrita do dia.
alter table public.estudo_tarefas add column if not exists escrito text not null default '';
alter table public.estudo_tarefas add column if not exists escrito_palavras int not null default 0;
alter table public.escrita_sessoes alter column projeto_id drop not null;
alter table public.escrita_sessoes add column if not exists tarefa_id uuid references public.estudo_tarefas(id) on delete set null;
create index if not exists escrita_sessoes_tarefa on public.escrita_sessoes (tarefa_id) where tarefa_id is not null;
