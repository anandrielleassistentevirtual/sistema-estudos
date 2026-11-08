-- Cadastro de idiomas (com meta semanal) e tempo de estudo por idioma
create table if not exists public.languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  weekly_goal_min int,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.languages enable row level security;
drop policy if exists dono on public.languages;
create policy dono on public.languages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- sessões de estudo passam a saber de qual idioma são
alter table public.study_sessions add column if not exists language text;
create index if not exists study_user_lang on public.study_sessions (user_id, language, day);

-- idiomas que já têm lições viram idiomas cadastrados
insert into public.languages (user_id, name)
select distinct user_id, language from public.lessons
on conflict (user_id, name) do nothing;
