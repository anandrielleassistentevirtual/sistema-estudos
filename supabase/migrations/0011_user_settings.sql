-- Preferências por usuário guardadas no banco (valem em qualquer computador)
-- anki_since: só traz do Anki as revisões a partir desta data
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  anki_since date,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists dono on public.user_settings;
create policy dono on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
