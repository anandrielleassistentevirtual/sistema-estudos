-- Escrita: seção "Rascunhos" (conta no esforço do dia, não no total do livro)
alter table public.escrita_docs drop constraint if exists escrita_docs_secao_check;
alter table public.escrita_docs add constraint escrita_docs_secao_check
  check (secao in ('manuscrito', 'rascunhos', 'enredo', 'personagens', 'lugares', 'pesquisa'));
-- escrita_sessoes.palavras passa a ser o esforço: palavras escritas em qualquer texto do projeto
comment on column public.escrita_sessoes.palavras is 'palavras escritas na sessão (esforço), em qualquer texto do projeto; apagar não desconta';
