-- Contagens regressivas do Dashboard (ex.: "Projeto fitness — 10 kg a menos até 24/12", "Conto perfeito até 31/12/2030")
create table if not exists public.contagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  titulo text not null,
  meta text not null default '',
  data date not null,
  -- de quando a contagem vale (a barrinha mostra o tempo já percorrido entre o início e a data)
  inicio date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.contagens enable row level security;
drop policy if exists dono on public.contagens;
create policy dono on public.contagens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists contagens_user on public.contagens (user_id, ordem);
