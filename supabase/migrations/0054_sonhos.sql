-- Quadro dos sonhos (no fim do Dashboard): os sonhos de vida, com imagem, frase e área.
-- imagem: caminho no bucket "livros" (pasta <usuário>/sonhos/) ou o link de uma imagem da internet.
create table if not exists public.sonhos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text not null,
  frase text not null default '',
  area text not null default 'outro',
  imagem text,
  posicao int not null default 0,
  realizado_em date,
  created_at timestamptz not null default now()
);
alter table public.sonhos enable row level security;
drop policy if exists dono on public.sonhos;
create policy dono on public.sonhos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists sonhos_user on public.sonhos (user_id, posicao);
