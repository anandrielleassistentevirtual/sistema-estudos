-- Uso do banco separado em: seus dados (tabelas do sistema de estudos) e a parte fixa do Supabase
create or replace function public.uso_armazenamento()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'banco', pg_database_size(current_database()),
    'dados', (
      select coalesce(sum(pg_total_relation_size(c.oid)), 0)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ),
    'arquivos', coalesce((
      select sum((o.metadata->>'size')::bigint)
      from storage.objects o
      where o.bucket_id in ('livros', 'audios') and (storage.foldername(o.name))[1] = auth.uid()::text
    ), 0),
    'qtd_arquivos', (
      select count(*) from storage.objects o
      where o.bucket_id in ('livros', 'audios') and (storage.foldername(o.name))[1] = auth.uid()::text
    )
  );
$$;
revoke all on function public.uso_armazenamento() from public, anon;
grant execute on function public.uso_armazenamento() to authenticated;
