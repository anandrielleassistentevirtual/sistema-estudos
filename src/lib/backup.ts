"use client";
import { supabase } from "./supabase/client";
import { compilarMarkdown, type Doc, type Projeto, type Referencia } from "./escrita";

/** Todas as tabelas com dados da conta (cada uma vira dados/<tabela>.json na cópia). */
const TABELAS = [
  "folders", "books", "annotations", "reading_sessions", "study_sessions", "notes",
  "languages", "anki_daily",
  "lectio_dias", "lectio_registros",
  "escrita_projetos", "escrita_docs", "escrita_sessoes", "escrita_referencias",
  "objetivos", "objetivo_itens",
  "confissoes", // só as datas; o exame de consciência (exame_cofre) nunca entra na cópia
] as const;

type Linha = Record<string, unknown>;

async function tudo(tabela: string): Promise<Linha[]> {
  const sb = supabase();
  const out: Linha[] = [];
  for (let i = 0; ; i += 1000) {
    // ordem fixa para a paginação não pular nem repetir linhas
    const { data, error } = await sb.from(tabela).select("*").order(tabela.endsWith("_daily") ? "day" : "id").range(i, i + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...((data as Linha[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const seguro = (s: string) => (s || "sem nome").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
const ehLink = (s: string) => /^https?:\/\//.test(s);

/**
 * Gera um .zip com uma cópia completa da conta:
 * - dados/*.json: todas as tabelas, completas (dá para reconstruir tudo a partir delas);
 * - versões legíveis: aulas, notas, diário da Lectio e textos da Escrita em Markdown;
 * - arquivos/: livros e capas.
 */
export async function baixarCopia(progresso: (msg: string) => void): Promise<{ arquivos: number; falhas: string[] }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const sb = supabase();
  const dados: Record<string, Linha[]> = {};

  for (const [k, t] of TABELAS.entries()) {
    progresso(`Copiando dados (${k + 1}/${TABELAS.length})…`);
    dados[t] = await tudo(t);
    zip.file(`dados/${t}.json`, JSON.stringify(dados[t], null, 1));
  }

  // versões legíveis
  progresso("Montando as versões legíveis…");
  const livros = new Map((dados.books as Linha[]).map((b) => [b.id as string, b]));
  for (const n of dados.notes as Linha[]) {
    const titulo = seguro(n.title as string);
    if (n.kind === "estudo") {
      const pasta = [n.course, ...String(n.folder ?? "").split(" › ")].filter(Boolean).map((x) => seguro(String(x))).join("/");
      zip.file(`legivel/estudos/${pasta ? pasta + "/" : ""}${titulo}.md`, String(n.content ?? ""));
      if (String(n.anotacoes ?? "").trim()) zip.file(`legivel/estudos/${pasta ? pasta + "/" : ""}${titulo} (anotações).md`, String(n.anotacoes));
    } else if (n.kind === "literaria") {
      const l = livros.get(n.book_id as string);
      const livro = l ? seguro(`${l.author ? `${l.author} - ` : ""}${l.title}`) : "sem livro";
      zip.file(`legivel/notas/literarias/${livro}/${titulo}.md`, `${n.quote ? `> ${n.quote}\n\n` : ""}${n.content ?? ""}`);
    } else {
      zip.file(`legivel/notas/${n.kind === "atomica" ? "atomicas" : "outras"}/${titulo}.md`, String(n.content ?? ""));
    }
  }
  const diario = (dados.lectio_registros as Linha[])
    .sort((a, b) => String(a.dia).localeCompare(String(b.dia)))
    .map((r) => `## ${r.dia} · ${r.referencia}\n\n${r.palavra ? `**Palavra:** ${r.palavra}\n\n` : ""}${r.oracao ? `${r.oracao}\n\n` : ""}${r.proposito ? `**Propósito:** ${r.proposito}\n` : ""}`)
    .join("\n");
  if (diario) zip.file("legivel/lectio/diario-de-oracao.md", `# Diário de oração\n\n${diario}`);
  const docs = dados.escrita_docs as unknown as Doc[];
  const refs = dados.escrita_referencias as unknown as Referencia[];
  for (const p of dados.escrita_projetos as unknown as Projeto[]) {
    const ds = docs.filter((d) => d.projeto_id === p.id);
    const base = `legivel/escrita/${seguro(p.titulo)}`;
    zip.file(`${base}/${seguro(p.titulo)}.md`, compilarMarkdown(p, ds, refs.filter((r) => r.projeto_id === p.id)));
    for (const d of ds.filter((x) => x.secao !== "manuscrito")) zip.file(`${base}/${d.secao}/${seguro(d.titulo)}.md`, d.conteudo);
  }

  // arquivos (livros e capas)
  const lista: { bucket: string; path: string }[] = [];
  for (const b of dados.books as Linha[]) {
    if (b.file_path) lista.push({ bucket: "livros", path: String(b.file_path) });
    if (b.cover_path && !ehLink(String(b.cover_path))) lista.push({ bucket: "livros", path: String(b.cover_path) });
  }
  const unicos = [...new Map(lista.map((x) => [`${x.bucket}/${x.path}`, x])).values()];
  const falhas: string[] = [];
  for (const [k, f] of unicos.entries()) {
    progresso(`Copiando arquivos (${k + 1}/${unicos.length})…`);
    const { data, error } = await sb.storage.from(f.bucket).download(f.path);
    if (error || !data) { falhas.push(`${f.bucket}/${f.path}`); continue; }
    // tira a pasta da conta (o id) do caminho: arquivos/livros/xyz.epub
    zip.file(`arquivos/${f.bucket}/${f.path.split("/").slice(1).join("/") || f.path}`, data);
  }

  zip.file("LEIA-ME.txt", [
    "Cópia de segurança do Sistema de Estudos",
    `Feita em ${new Date().toLocaleString("pt-BR")}.`,
    "",
    "legivel/  → para ler: aulas, notas, diário da Lectio e textos da Escrita, em Markdown (abre no Obsidian ou em qualquer editor).",
    "arquivos/ → os livros (EPUB, TXT, MD) e as capas, como você enviou.",
    "dados/    → todas as tabelas completas em JSON: com elas é possível reconstruir o sistema inteiro em outro banco.",
    falhas.length ? `\nNão foi possível copiar: ${falhas.join(", ")}` : "",
  ].join("\n"));

  progresso("Compactando…");
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sistema-estudos-copia-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 10000);
  await sb.auth.updateUser({ data: { ultima_copia: new Date().toISOString() } });
  return { arquivos: unicos.length - falhas.length, falhas };
}
