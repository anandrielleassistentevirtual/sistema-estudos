# Padrão de conteúdo

Tudo que entra no sistema segue um destes formatos. O Claude prepara as pastas
neste diretório e importa com `npm run importar`.

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
