-- Livro físico (páginas), timer ligado a livro/aula, leitura medida durante o timer
alter table public.books drop constraint if exists books_format_check;
alter table public.books add constraint books_format_check check (format in ('epub', 'txt', 'md', 'fisico'));
alter table public.books alter column file_path drop not null;
alter table public.books add column if not exists total_pages int;
alter table public.books add column if not exists current_page int;
alter table public.books add column if not exists words_per_page int not null default 300;

alter table public.study_sessions add column if not exists book_id uuid references public.books on delete set null;
alter table public.study_sessions add column if not exists note_id uuid references public.notes on delete set null;

-- leitura feita com o timer ligado: conta palavras/ppm, mas o tempo já está no timer
alter table public.reading_sessions add column if not exists during_timer boolean not null default false;
alter table public.reading_sessions add column if not exists pages int;

-- áudio individual de cada verso/frase
alter table public.lesson_sentences add column if not exists audio_path text;
