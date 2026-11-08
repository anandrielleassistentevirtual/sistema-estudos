-- Aula (ou nota) marcada como concluída
alter table public.notes add column if not exists completed_at timestamptz;
