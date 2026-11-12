-- Anki: cartões e notas criados por dia (a data de criação vem do próprio id do cartão/nota no Anki)
alter table public.anki_daily add column if not exists criados int not null default 0;
alter table public.anki_daily add column if not exists notas_criadas int not null default 0;
