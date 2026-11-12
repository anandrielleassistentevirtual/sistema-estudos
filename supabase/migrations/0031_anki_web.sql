-- Anki pelo AnkiWeb: o sistema baixa uma cópia da sua coleção (só leitura) quando você toca em Atualizar,
-- sem precisar do Anki aberto. A senha nunca é guardada: só a chave de acesso que o AnkiWeb devolve no login.
create table if not exists public.anki_conta (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  usuario text not null,
  endpoint text,
  colecao_mod bigint,
  baralhos jsonb,
  resumo jsonb,
  sincronizado_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);
alter table public.anki_conta enable row level security;
drop policy if exists dono on public.anki_conta;
create policy dono on public.anki_conta for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- a chave de acesso fica à parte: sem políticas e sem permissões, ninguém a lê nem grava direto;
-- só as duas funções abaixo, e sempre para o próprio dono. Desligar o AnkiWeb (apagar a conta) apaga a chave.
create table if not exists public.anki_chave_acesso (
  user_id uuid primary key references public.anki_conta (user_id) on delete cascade,
  hkey text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.anki_chave_acesso enable row level security;
revoke all on public.anki_chave_acesso from anon, authenticated;

create or replace function public.anki_guardar_chave(p_hkey text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.anki_chave_acesso (user_id, hkey) values ((select auth.uid()), p_hkey)
  on conflict (user_id) do update set hkey = excluded.hkey, atualizado_em = now()
$$;
revoke all on function public.anki_guardar_chave(text) from public, anon;
grant execute on function public.anki_guardar_chave(text) to authenticated;

create or replace function public.anki_chave()
returns table (hkey text, endpoint text, colecao_mod bigint)
language sql stable security definer set search_path = ''
as $$
  select k.hkey, c.endpoint, c.colecao_mod
  from public.anki_chave_acesso k join public.anki_conta c on c.user_id = k.user_id
  where k.user_id = (select auth.uid())
$$;
revoke all on function public.anki_chave() from public, anon;
grant execute on function public.anki_chave() to authenticated;

-- tempo gasto nas revisões (segundos), vindo do histórico do Anki
alter table public.anki_daily add column if not exists segundos int not null default 0;
