-- Limpeza do banco: remove funções e índice que não são mais usados.
-- Nada aqui apaga ou altera dados de uso — só objetos órfãos que ficaram de versões antigas.
-- É reversível: as funções e o índice podem ser recriados a qualquer momento.

-- 1) Funções das antigas lições de idiomas (texto + áudio por frase), apontam para tabelas
--    que foram removidas na migration 0026 (lesson_sentences, lessons, language_daily).
--    Ninguém mais as chama (o Listening de hoje usa registrar_escuta(text,int,date,text)).
drop function if exists public.registrar_leitura(uuid, uuid, date);
drop function if exists public.desfazer_leitura(uuid, uuid, date);
drop function if exists public.registrar_escuta(uuid, date);

-- 2) Índice redundante: notes_user_kind (user_id, kind) é um prefixo de
--    notes_user_kind_status (user_id, kind, status), criado na 0008. O índice maior já
--    atende as consultas por (user_id, kind), então o menor só ocupa espaço e pesa nas gravações.
drop index if exists public.notes_user_kind;
