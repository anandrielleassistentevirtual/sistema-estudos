-- Oração › Exame de consciência.
-- O exame é cifrado no navegador (AES-GCM, chave derivada da senha com PBKDF2) antes de chegar aqui:
-- o banco só guarda texto cifrado. A senha nunca sai do aparelho.
create table if not exists public.exame_cofre (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  sal text not null,                 -- base64, para derivar a chave da senha
  iteracoes int not null,            -- PBKDF2
  verificador text not null,         -- frase conhecida cifrada: confere se a senha está certa
  conteudo text,                     -- exame em andamento, cifrado; null = nada marcado
  atualizado_em timestamptz not null default now()
);

-- Só as datas (sem nenhum pecado): servem ao aviso do Dashboard.
create table if not exists public.confissoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  feita_em date not null,
  created_at timestamptz not null default now()
);

alter table public.exame_cofre enable row level security;
alter table public.confissoes enable row level security;
drop policy if exists dono on public.exame_cofre;
create policy dono on public.exame_cofre for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dono on public.confissoes;
create policy dono on public.confissoes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists confissoes_user on public.confissoes (user_id, feita_em desc);
