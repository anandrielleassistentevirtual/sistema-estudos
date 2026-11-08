-- Lectio Divina: Evangelho do dia com comentários curados da Catena Aurea, e diário de oração
create table if not exists public.lectio_dias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  dia date not null,
  liturgia text not null default '',
  cor text not null default '',
  referencia text not null,
  titulo text not null default '',
  introducao text not null default '',
  versiculos jsonb not null default '[]',
  chave text not null default '',
  chave_ref text not null default '',
  comentarios jsonb not null default '[]',
  catena_url text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, dia)
);
create table if not exists public.lectio_registros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  dia date not null,
  referencia text not null default '',
  palavra text not null default '',
  oracao text not null default '',
  proposito text not null default '',
  segundos int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.lectio_dias enable row level security;
alter table public.lectio_registros enable row level security;
drop policy if exists dono on public.lectio_dias;
create policy dono on public.lectio_dias for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dono on public.lectio_registros;
create policy dono on public.lectio_registros for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists lectio_registros_dia on public.lectio_registros (user_id, dia);
