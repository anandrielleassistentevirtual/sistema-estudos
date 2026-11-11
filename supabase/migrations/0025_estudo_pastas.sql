-- Estudos: pastas e subpastas (autor › curso › módulo…), na ordem que você definir.
create table if not exists public.estudo_pastas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references public.estudo_pastas on delete cascade,
  nome text not null,
  posicao int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.estudo_pastas enable row level security;
drop policy if exists dono on public.estudo_pastas;
create policy dono on public.estudo_pastas for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists estudo_pastas_arvore on public.estudo_pastas (user_id, parent_id, posicao);

alter table public.notes add column if not exists pasta_id uuid references public.estudo_pastas on delete set null;
create index if not exists notes_pasta on public.notes (pasta_id) where pasta_id is not null;

-- Caminho completo da pasta: "Paulo Cantarelli › EFESC › Módulo 1"
create or replace function public.estudo_caminho(p uuid) returns text
language sql stable set search_path = public as $$
  with recursive c as (
    select id, parent_id, nome, 0 as n from public.estudo_pastas where id = p
    union all
    select e.id, e.parent_id, e.nome, c.n + 1 from public.estudo_pastas e join c on e.id = c.parent_id where c.n < 50
  )
  select string_agg(nome, ' › ' order by n desc) from c
$$;

-- A aula guarda o caminho em "course" (o resto do sistema — leitor, Notas, Timer, backup — continua lendo dali)
create or replace function public.notes_curso_da_pasta() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.pasta_id is not null and (tg_op = 'INSERT' or new.pasta_id is distinct from old.pasta_id) then
    new.course := coalesce(public.estudo_caminho(new.pasta_id), new.course);
    new.folder := '';
  end if;
  return new;
end $$;
drop trigger if exists notes_curso_da_pasta on public.notes;
create trigger notes_curso_da_pasta before insert or update of pasta_id on public.notes
  for each row execute function public.notes_curso_da_pasta();

-- Não deixa uma pasta ir para dentro dela mesma
create or replace function public.estudo_pastas_sem_ciclo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null and new.parent_id is distinct from old.parent_id then
    if exists (
      with recursive sub as (
        select id from public.estudo_pastas where id = new.id
        union all select e.id from public.estudo_pastas e join sub on e.parent_id = sub.id
      ) select 1 from sub where id = new.parent_id
    ) then raise exception 'Uma pasta não pode ir para dentro dela mesma.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists estudo_pastas_sem_ciclo on public.estudo_pastas;
create trigger estudo_pastas_sem_ciclo before update of parent_id on public.estudo_pastas
  for each row execute function public.estudo_pastas_sem_ciclo();

-- Renomear ou mover uma pasta atualiza o caminho das aulas dentro dela (e das subpastas)
create or replace function public.estudo_pastas_propagar() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.nome is distinct from old.nome or new.parent_id is distinct from old.parent_id then
    with recursive sub as (
      select id from public.estudo_pastas where id = new.id
      union all select e.id from public.estudo_pastas e join sub on e.parent_id = sub.id
    )
    update public.notes n set course = public.estudo_caminho(n.pasta_id), folder = ''
     where n.pasta_id in (select id from sub);
  end if;
  return null;
end $$;
drop trigger if exists estudo_pastas_propagar on public.estudo_pastas;
create trigger estudo_pastas_propagar after update on public.estudo_pastas
  for each row execute function public.estudo_pastas_propagar();
