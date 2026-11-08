# Padrão de conteúdo

Tudo que entra no sistema segue um destes formatos. O Claude prepara as pastas
neste diretório e importa com `npm run importar`.

## Lições de idiomas (texto + áudio)

Uma pasta por lição:

```
conteudo/idiomas/<idioma>/<coleção>/<NN-nome-da-licao>/
  licao.json      metadados (obrigatório)
  texto.txt       uma frase (ou verso) por linha (obrigatório)
  traducao.txt    a tradução, na mesma ordem, uma por linha
  audio.mp3       áudio da lição (mp3, m4a, ogg, opus ou wav)
  tempos.vtt      opcional: início e fim de cada frase, na mesma ordem
```

`licao.json`:

```json
{
  "idioma": "Italiano",
  "colecao": "Divina Commedia — Inferno",
  "titulo": "Canto I, vv. 1–12",
  "nivel": "Literário",
  "ordem": 1,
  "meta": 10
}
```

- `meta` = quantas leituras completas do texto você quer fazer.
- Sem `tempos.vtt`, os tempos podem ser marcados dentro do site (botão
  “Sincronizar tempos”).
- Reimportar a mesma lição (mesmo idioma + coleção + título) atualiza o texto e
  o áudio **sem zerar** as contagens das frases que não mudaram.

```bash
npm run importar -- licao conteudo/idiomas/italiano
```

### Divina Comédia (gerada automaticamente)

`scripts/dante/gerar_licoes.py` monta as lições a partir do texto do Project
Gutenberg (#1012, domínio público), das traduções literais em
`conteudo/idiomas/italiano/traducoes/inferno-NN.txt` e de uma voz neural
italiana (Piper, `it_IT-paola-medium`). Cada canto vira lições de ~30 versos;
o áudio é gerado verso a verso, então os tempos são exatos. Os `audio.mp3`
não vão para o git (ficam no Supabase Storage).

## Livros

- **EPUB** é o formato preferido (melhor paginação, capítulos, metadados).
- **TXT** ou **MD** também funcionam: o leitor pagina em blocos de ~320 palavras.

```bash
npm run importar -- livro caminho/livro.epub --pasta "Literatura/Italiana" --fila
```

## Estudos (transcrições de aulas)

Markdown, com cabeçalho opcional:

```markdown
---
professor: Nome do Professor
curso: Nome do Curso
---
# Aula 3 — Título da aula

Texto da transcrição…
```

```bash
npm run importar -- estudo conteudo/estudos/*.md
```
