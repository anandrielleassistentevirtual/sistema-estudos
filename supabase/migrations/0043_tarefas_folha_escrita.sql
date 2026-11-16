-- Tarefas de escrever ganham uma folha na sala de Escrita (as palavras contam como escrita, como qualquer texto)
alter table public.estudo_tarefas add column if not exists escrita_doc_id uuid references public.escrita_docs(id) on delete set null;
