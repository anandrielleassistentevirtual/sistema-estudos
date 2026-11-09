-- Quanto do plano está em uso: tamanho do banco e dos arquivos da conta (para o painel de Armazenamento)
create or replace function public.uso_armazenamento()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'banco', pg_database_size(current_database()),
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
