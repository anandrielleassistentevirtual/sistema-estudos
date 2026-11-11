-- Revisão do banco (alertas do Supabase).
-- Nada aqui apaga ou altera dados de uso: só regras de acesso, índices e tabelas vazias que não são mais usadas.

-- 1) Regras de acesso "dono": auth.uid() passa a ser avaliado uma vez por consulta, não uma vez por linha.
--    A regra continua exatamente a mesma (cada um só vê e mexe no que é seu).
do $$
declare t text;
begin
  for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'dono' loop
    execute format('drop policy dono on public.%I', t);
    execute format(
      'create policy dono on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- 2) Índices nas ligações entre tabelas (apagar uma pasta/livro/nota não varre a tabela inteira)
create index if not exists annotations_user on public.annotations (user_id);
create index if not exists books_folder on public.books (folder_id);
create index if not exists estudo_pastas_parent on public.estudo_pastas (parent_id);
create index if not exists folders_parent on public.folders (parent_id);
create index if not exists folders_user on public.folders (user_id);
create index if not exists notes_annotation on public.notes (annotation_id);
create index if not exists notes_source on public.notes (source_id);
create index if not exists reading_sessions_book on public.reading_sessions (book_id);
create index if not exists study_sessions_book on public.study_sessions (book_id);
create index if not exists study_sessions_note on public.study_sessions (note_id);

-- 3) Tabelas das antigas lições de idiomas (removidas do sistema; estavam vazias)
drop table if exists public.lesson_sentences;
drop table if exists public.lessons;
drop table if exists public.language_daily;

-- 4) Uso do armazenamento: roda com a permissão de quem chama (vê só os próprios arquivos), não como administrador
create or replace function public.uso_armazenamento() returns json
language sql stable security invoker set search_path = '' as $$
  select json_build_object(
    'banco', pg_database_size(current_database()),
    'dados', (
      select coalesce(sum(pg_total_relation_size(c.oid)), 0)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ),
    'arquivos', coalesce((
      select sum((o.metadata->>'size')::bigint) from storage.objects o
      where o.bucket_id in ('livros', 'audios') and (storage.foldername(o.name))[1] = (select auth.uid())::text
    ), 0),
    'qtd_arquivos', (
      select count(*) from storage.objects o
      where o.bucket_id in ('livros', 'audios') and (storage.foldername(o.name))[1] = (select auth.uid())::text
    )
  );
$$;
revoke execute on function public.uso_armazenamento() from public, anon;
grant execute on function public.uso_armazenamento() to authenticated;
