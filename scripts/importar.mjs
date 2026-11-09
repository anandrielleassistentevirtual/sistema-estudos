#!/usr/bin/env node
/**
 * Importa conteúdo para o Sistema de Estudos usando a chave service_role.
 *
 *   npm run importar -- livro   <arquivo> [...] --pasta "Filosofia/Platão" [--status aguardando] [--fila]
 *   npm run importar -- estudo  <arquivo.md> [...] [--professor "Nome"] [--curso "Curso"]
 *
 * Variáveis: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DONO_EMAIL (em .env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DONO_EMAIL;
if (!url || !key || !email) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e DONO_EMAIL (ex.: em .env.local).");
  process.exit(1);
}
// Chaves novas (sb_secret_…) não são JWT: vão só no cabeçalho apikey, nunca em Authorization.
const fetchSemBearer = (input, init = {}) => {
  const h = new Headers(init.headers);
  if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
  return fetch(input, { ...init, headers: h });
};
const sb = createClient(url, key, { auth: { persistSession: false }, global: { fetch: fetchSemBearer } });

const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) {
    const k = rest[i].slice(2);
    const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true;
    flags[k] = v;
  } else args.push(rest[i]);
}

async function ownerId() {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`Usuário ${email} não encontrado. Crie a conta no site primeiro.`);
}

const words = (t) => (t.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length;
const lines = (t) => t.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);

function parseCues(src) {
  const toSec = (t) => {
    const p = t.replace(",", ".").split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  };
  const out = [];
  for (const b of src.replace(/\r/g, "").split(/\n\n+/)) {
    const ls = b.split("\n");
    const i = ls.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = ls[i].split("-->").map((s) => s.trim().split(" ")[0]);
    out.push({ start: toSec(a), end: toSec(z) });
  }
  return out;
}

async function folderPath(uid, path) {
  let parent = null;
  for (const name of String(path).split("/").map((s) => s.trim()).filter(Boolean)) {
    let q = sb.from("folders").select("id").eq("user_id", uid).eq("name", name);
    q = parent ? q.eq("parent_id", parent) : q.is("parent_id", null);
    const { data } = await q.maybeSingle();
    if (data) parent = data.id;
    else {
      const ins = await sb.from("folders").insert({ user_id: uid, name, parent_id: parent }).select("id").single();
      if (ins.error) throw ins.error;
      parent = ins.data.id;
    }
  }
  return parent;
}

async function importBook(uid, file, folderId) {
  const ext = extname(file).toLowerCase().replace(".", "");
  const format = ext === "markdown" ? "md" : ext;
  if (!["epub", "txt", "md"].includes(format)) throw new Error(`${file}: use EPUB, TXT ou MD`);
  const id = randomUUID();
  const path = `${uid}/${id}.${format}`;
  const buf = readFileSync(file);
  const up = await sb.storage.from("livros").upload(path, buf, {
    contentType: format === "epub" ? "application/epub+zip" : "text/plain; charset=utf-8",
  });
  if (up.error) throw up.error;
  let title = flags.titulo && args.length === 1 ? flags.titulo : basename(file).replace(/\.[^.]+$/, "").replace(/_+/g, " ");
  const text = format === "epub" ? "" : buf.toString("utf8");
  const h1 = text.match(/^#\s+(.+)$/m);
  if (format === "md" && h1 && !flags.titulo) title = h1[1].trim();
  let queue_position = null;
  if (flags.fila) {
    const { data } = await sb.from("books").select("queue_position").eq("user_id", uid).not("queue_position", "is", null)
      .order("queue_position", { ascending: false }).limit(1);
    queue_position = (data?.[0]?.queue_position ?? 0) + 1;
  }
  const ins = await sb.from("books").insert({
    id, user_id: uid, folder_id: folderId, title, author: flags.autor && args.length === 1 ? flags.autor : null,
    format, file_path: path, word_count: format === "epub" ? null : words(text),
    status: flags.status ?? "aguardando", queue_position,
  });
  if (ins.error) throw ins.error;
  console.log(`  ✓ ${title} (${format})`);
}

async function importStudy(uid, file) {
  let content = readFileSync(file, "utf8");
  let professor = flags.professor ?? "";
  let course = flags.curso ?? "";
  const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const l of fm[1].split("\n")) {
      const [k, ...v] = l.split(":");
      if (k.trim() === "professor" && !flags.professor) professor = v.join(":").trim();
      if (k.trim() === "curso" && !flags.curso) course = v.join(":").trim();
    }
    content = content.slice(fm[0].length);
  }
  const title = (content.match(/^#\s+(.+)$/m)?.[1] ?? basename(file).replace(/\.[^.]+$/, "")).trim();
  const ins = await sb.from("notes").insert({ user_id: uid, kind: "estudo", title, content, professor, course });
  if (ins.error) throw ins.error;
  console.log(`  ✓ ${professor || "—"} › ${course || "—"} › ${title}`);
}

const uid = await ownerId();
if (cmd === "livro") {
  const folderId = flags.pasta ? await folderPath(uid, flags.pasta) : null;
  console.log(`Importando ${args.length} livro(s)${flags.pasta ? ` em “${flags.pasta}”` : ""}…`);
  for (const f of args) await importBook(uid, f, folderId);
} else if (cmd === "estudo") {
  console.log(`Importando ${args.length} transcrição(ões)…`);
  for (const f of args) await importStudy(uid, f);
} else {
  console.log("Uso: npm run importar -- livro|estudo <caminhos…> (veja o topo deste arquivo)");
  process.exit(1);
}
