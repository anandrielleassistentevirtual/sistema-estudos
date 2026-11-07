# Sistema de Estudos

Site pessoal de estudos: leitor de EPUB/TXT/MD com métricas (palavras por minuto,
palavras por semana), biblioteca em pastas (**Mapa da Ignorância**), fila de
leitura, timer/pomodoro, calendário estilo *Review Heatmap*, notas em Markdown
com `[[wikilinks]]` (compatível com Obsidian), transcrições de aulas, lições de
idiomas com texto + áudio e contagem de leituras por frase, e integração com o
Anki via AnkiConnect.

**Stack:** Next.js 15 · React 19 · Tailwind 4 · Supabase (login, Postgres, Storage).

## Módulos

| Rota | O que faz |
|---|---|
| `/` | Dashboard: tempo hoje/semana, sequência, ppm, palavras por semana, heatmap |
| `/timer` | Pomodoro e cronômetro; cada sessão vai para o calendário |
| `/calendario` | Heatmap anual por tempo, palavras, frases ou revisões do Anki |
| `/biblioteca` | Mapa da Ignorância: pastas aninhadas, upload, status, horas restantes |
| `/fila` | Fila de leitura ordenável |
| `/ler/[id]` | Leitor (EPUB/TXT/MD): temas, fonte, destaques, notas, ppm ao vivo |
| `/notas` | Notas Markdown com `[[links]]`, backlinks, importação/exportação de vault |
| `/estudos` | Transcrições de aulas por professor → curso |
| `/idiomas` | Lições texto + áudio: +1 por frase, meta de leituras, sincronização |
| `/idiomas/playlist` | Playlist de áudios em loop; cada áudio completo conta uma escuta |
| `/anki` | Baralhos e pendências, histórico de revisões, abrir revisão no Anki |

## Como as leituras são medidas

Cada página que você **avança** credita as palavras daquela página e o tempo que
você passou nela. Não contam: tempo com a aba escondida, páginas viradas em menos
de 2 segundos, e o excesso acima de um teto por página (para não contar quando
você deixa o livro aberto e sai). Velocidade = palavras ÷ minutos creditados.

## Configuração

1. **Supabase:** no seu projeto, abra *SQL Editor* e rode
   `supabase/migrations/0001_init.sql`. Ele cria as tabelas, o RLS e os buckets
   privados `livros` e `audios`.
2. **Variáveis:** copie `.env.example` para `.env.local` e preencha
   `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (*Project Settings → API*).
3. Rode:

```bash
npm install
```

```bash
npm run dev
```

4. Crie sua conta em `/login`. Se não quiser confirmação por e-mail, desligue em
   *Authentication → Providers → Email → Confirm email*.

### Publicar (Vercel)

Importe o repositório na Vercel e cadastre as duas variáveis `NEXT_PUBLIC_…`.
Depois, em *Supabase → Authentication → URL Configuration*, coloque o domínio da
Vercel como *Site URL*.

## Importar conteúdo

Veja [`conteudo/README.md`](conteudo/README.md) para o padrão de pastas.
Os scripts usam `SUPABASE_SERVICE_ROLE_KEY` e `DONO_EMAIL` (nunca vão para o
navegador).

```bash
npm run importar -- licao conteudo/idiomas
```
