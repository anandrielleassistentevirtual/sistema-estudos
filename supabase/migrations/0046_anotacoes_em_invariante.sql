-- Estudos: "anotacoes_em" passa a valer como marcador exato de "a aula tem anotações".
-- O app agora zera anotacoes_em quando o texto das anotações fica vazio (ver estudos/[id]).
-- Aqui acertamos as linhas antigas em que as anotações foram apagadas mas a data ficou:
-- assim a lista de Estudos mostra o indicador de "tem anotação" sem baixar o texto inteiro.
update public.notes
   set anotacoes_em = null
 where kind = 'estudo'
   and anotacoes_em is not null
   and coalesce(btrim(anotacoes), '') = '';
