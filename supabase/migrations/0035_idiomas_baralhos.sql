-- Idiomas: bandeira e os baralhos do Anki de cada idioma (Inglês ← "English"…);
-- números do Anki por baralho e por dia, para cada idioma ver só os seus.
alter table public.languages add column if not exists bandeira text;
alter table public.languages add column if not exists anki_baralhos text[] not null default '{}';

create table if not exists public.anki_baralho_dia (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  baralho text not null,           -- baralho de cima (ex.: "English"; subbaralhos somam nele)
  reviews int not null default 0,
  segundos int not null default 0,
  criados int not null default 0,
  notas_criadas int not null default 0,
  primary key (user_id, day, baralho)
);
alter table public.anki_baralho_dia enable row level security;
drop policy if exists dono on public.anki_baralho_dia;
create policy dono on public.anki_baralho_dia for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
