-- Estudos: ordem manual das aulas dentro da pasta (sem ordem definida, vale a ordem do título: Aula 1, 2… 10).
alter table public.notes add column if not exists ordem integer;

-- Regrava a ordem de uma pasta inteira de uma vez: a 1ª aula da lista fica com 0, a 2ª com 1…
-- Roda com a permissão de quem chama: só mexe nas aulas do próprio usuário.
create or replace function public.reordenar_aulas(ids uuid[]) returns void
language sql security invoker set search_path = '' as $$
  update public.notes n set ordem = x.pos - 1
  from unnest(ids) with ordinality as x(id, pos)
  where n.id = x.id and n.kind = 'estudo' and n.ordem is distinct from x.pos - 1;
$$;
revoke execute on function public.reordenar_aulas(uuid[]) from public, anon;
grant execute on function public.reordenar_aulas(uuid[]) to authenticated;
