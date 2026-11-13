-- Listening em vários aparelhos (PC, notebook, celular): cada um com a sua chave e um nome.
alter table public.integracao_chaves add column if not exists aparelho text not null default '';

-- instalação com um toque: um código de uso curto (30 min) que entrega o script com a chave dentro.
-- A chave em texto fica aqui só durante esses 30 minutos; ninguém lê esta tabela direto.
create table if not exists public.listening_instalacao (
  codigo text primary key,
  chave text not null,
  idioma text not null,
  aparelho text not null default '',
  expira_em timestamptz not null
);
alter table public.listening_instalacao enable row level security;
revoke all on public.listening_instalacao from anon, authenticated;

create or replace function public.criar_instalacao_listening(p_idioma text, p_aparelho text)
returns json language plpgsql security definer set search_path = ''
as $$
declare k text := encode(extensions.gen_random_bytes(24), 'hex'); c text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if (select auth.uid()) is null then raise exception 'sem login'; end if;
  delete from public.listening_instalacao where expira_em < now();
  insert into public.integracao_chaves (user_id, idioma, aparelho, hash)
  values ((select auth.uid()), p_idioma, coalesce(p_aparelho, ''), encode(extensions.digest(k, 'sha256'), 'hex'));
  insert into public.listening_instalacao (codigo, chave, idioma, aparelho, expira_em)
  values (c, k, p_idioma, coalesce(p_aparelho, ''), now() + interval '30 minutes');
  return json_build_object('codigo', c, 'chave', k);
end $$;
revoke all on function public.criar_instalacao_listening(text, text) from public, anon;
grant execute on function public.criar_instalacao_listening(text, text) to authenticated;

create or replace function public.pegar_instalacao_listening(p_codigo text)
returns json language sql security definer set search_path = ''
as $$ select json_build_object('chave', chave, 'idioma', idioma, 'aparelho', aparelho)
      from public.listening_instalacao where codigo = p_codigo and expira_em > now() $$;
revoke all on function public.pegar_instalacao_listening(text) from public;
grant execute on function public.pegar_instalacao_listening(text) to anon, authenticated;
