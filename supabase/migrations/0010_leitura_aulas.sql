-- Leitura das aulas (Estudos) também mede palavras por minuto
alter table public.reading_sessions add column if not exists note_id uuid references public.notes on delete set null;
create index if not exists reading_note on public.reading_sessions (note_id);
