-- Estudos › Tarefas: uma lista única no estilo do Sistema de Autofoco (Mark Forster).
-- Cada tarefa pode pertencer a um curso (pasta), ligar a um livro da Biblioteca, ter um link (vídeo) e um prazo opcional.
create table if not exists public.estudo_tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  texto text not null,
  tipo text not null default 'outro' check (tipo in ('ler', 'assistir', 'escrever', 'revisar', 'praticar', 'outro')),
  pasta_id uuid references public.estudo_pastas on delete set null,
  book_id uuid references public.books on delete set null,
  link text not null default '',
  prazo date,                         -- opcional: até quando precisa estar feita
  aparece_em date,                    -- volta para a lista nesse dia (revisões, tarefas que se repetem)
  posicao bigint not null default 0,  -- ordem de entrada na lista; "fiz uma parte" reescreve no fim
  destacada boolean not null default false, -- marca-texto: sobrou depois de passar a página
  feita_em timestamptz,
  created_at timestamptz not null default now()
);
alter table public.estudo_tarefas enable row level security;
drop policy if exists dono on public.estudo_tarefas;
create policy dono on public.estudo_tarefas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists estudo_tarefas_lista on public.estudo_tarefas (user_id, feita_em, posicao);
create index if not exists estudo_tarefas_pasta on public.estudo_tarefas (pasta_id);
create index if not exists estudo_tarefas_book on public.estudo_tarefas (book_id);

-- o tempo do Timer dedicado a cada tarefa
alter table public.study_sessions add column if not exists tarefa_id uuid references public.estudo_tarefas on delete set null;
create index if not exists study_sessions_tarefa on public.study_sessions (tarefa_id) where tarefa_id is not null;
