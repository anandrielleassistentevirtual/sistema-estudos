-- Sistema de Estudos — esquema inicial
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run.
-- Todas as tabelas têm RLS: cada usuário só enxerga as próprias linhas.

create extension if not exists pgcrypto;

-- ───────────── Biblioteca (Mapa da Ignorância) ─────────────
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references public.folders on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  folder_id uuid references public.folders on delete set null,
  title text not null,
  author text,
  format text not null check (format in ('epub', 'txt', 'md')),
  file_path text not null,
  status text not null default 'aguardando'
    check (status in ('aguardando', 'lendo', 'pausado', 'lido')),
  queue_position int,
  word_count int,
  progress real not null default 0,
  last_location text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid not null references public.books on delete cascade,
  location text not null,
  quote text not null,
  note text not null default '',
  color text not null default 'amarelo',
  created_at timestamptz not null default now()
);

-- ───────────── Métricas de leitura e tempo ─────────────
create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  book_id uuid references public.books on delete set null,
  day date not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds int not null default 0,
  words int not null default 0
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  started_at timestamptz not null default now(),
  seconds int not null,
  category text not null default 'Estudo',
  label text not null default ''
);

-- ───────────── Notas (estilo Obsidian) e Estudos (transcrições) ─────────────
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'nota' check (kind in ('nota', 'estudo')),
  title text not null,
  folder text not null default '',
  content text not null default '',
  professor text not null default '',
  course text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Idiomas (texto + áudio, modelo Mairo Vergara) ─────────────
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  language text not null,
  collection text not null default '',
  title text not null,
  level text not null default '',
  position int not null default 0,
  audio_path text,
  read_goal int not null default 10,
  listen_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_sentences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lesson_id uuid not null references public.lessons on delete cascade,
  idx int not null,
  text text not null,
  translation text not null default '',
  start_s real,
  end_s real,
  read_count int not null default 0,
  unique (lesson_id, idx)
);

create table if not exists public.language_daily (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  reads int not null default 0,
  listens int not null default 0,
  primary key (user_id, day)
);

-- Revisões do Anki por dia (sincronizadas via AnkiConnect, pelo navegador)
create table if not exists public.anki_daily (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  reviews int not null default 0,
  primary key (user_id, day)
);

-- ───────────── Índices ─────────────
create index if not exists books_user_folder on public.books (user_id, folder_id);
create index if not exists reading_user_day on public.reading_sessions (user_id, day);
create index if not exists study_user_day on public.study_sessions (user_id, day);
create index if not exists notes_user_kind on public.notes (user_id, kind);
create index if not exists sentences_lesson on public.lesson_sentences (lesson_id, idx);
create index if not exists annotations_book on public.annotations (book_id);

-- ───────────── RLS ─────────────
do $$
declare t text;
begin
  foreach t in array array['folders','books','annotations','reading_sessions','study_sessions',
                           'notes','lessons','lesson_sentences','language_daily','anki_daily']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists dono on public.%I', t);
    execute format('create policy dono on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ───────────── Funções ─────────────
-- +1 leitura numa frase (ou em todas da lição, se p_sentence for null)
create or replace function public.registrar_leitura(p_lesson uuid, p_sentence uuid, p_day date)
returns void language plpgsql security invoker as $$
declare n int;
begin
  update public.lesson_sentences
     set read_count = read_count + 1
   where lesson_id = p_lesson
     and user_id = auth.uid()
     and (p_sentence is null or id = p_sentence);
  get diagnostics n = row_count;
  insert into public.language_daily (user_id, day, reads) values (auth.uid(), p_day, n)
  on conflict (user_id, day) do update set reads = public.language_daily.reads + excluded.reads;
end $$;

-- +1 escuta completa de uma lição
create or replace function public.registrar_escuta(p_lesson uuid, p_day date)
returns void language plpgsql security invoker as $$
begin
  update public.lessons set listen_count = listen_count + 1
   where id = p_lesson and user_id = auth.uid();
  insert into public.language_daily (user_id, day, listens) values (auth.uid(), p_day, 1)
  on conflict (user_id, day) do update set listens = public.language_daily.listens + 1;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- ───────────── Storage (arquivos privados por usuário) ─────────────
insert into storage.buckets (id, name, public) values ('livros', 'livros', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('audios', 'audios', false)
  on conflict (id) do nothing;

drop policy if exists "arquivos do dono" on storage.objects;
create policy "arquivos do dono" on storage.objects for all to authenticated
  using (bucket_id in ('livros', 'audios') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('livros', 'audios') and (storage.foldername(name))[1] = auth.uid()::text);
