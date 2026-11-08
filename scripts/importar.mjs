#!/usr/bin/env node
/**
 * Importa conteúdo para o Sistema de Estudos usando a chave service_role.
 *
 *   npm run importar -- licao   <pasta> [...]          (pasta com licao.json, ou uma pasta-mãe com várias)
 *   npm run importar -- livro   <arquivo> [...] --pasta "Filosofia/Platão" [--status aguardando] [--fila]
 *   npm run importar -- estudo  <arquivo.md> [...] [--professor "Nome"] [--curso "Curso"]
 *
 * Variáveis: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DONO_EMAIL (em .env.local).
 * Formato das pastas: veja conteudo/README.md.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

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

const MIME = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav", ".opus": "audio/ogg" };

function findLessonDirs(p) {
  if (existsSync(join(p, "licao.json"))) return [p];
  return readdirSync(p)
    .map((n) => join(p, n))
    .filter((x) => statSync(x).isDirectory())
    .sort()
    .flatMap(findLessonDirs);
}

async function importLesson(uid, dir) {
  const meta = JSON.parse(readFileSync(join(dir, "licao.json"), "utf8"));
  const read = (n) => (existsSync(join(dir, n)) ? readFileSync(join(dir, n), "utf8") : "");
  const text = lines(read("texto.txt") || read("texto.md"));
  const tr = lines(read("traducao.txt") || read("traducao.md"));
  const cuesSrc = read("tempos.vtt") || read("tempos.srt");
  const cues = cuesSrc ? parseCues(cuesSrc) : [];
  if (!text.length) throw new Error(`${dir}: texto.txt vazio`);
  if (tr.length && tr.length !== text.length) console.warn(`  ⚠ ${basename(dir)}: ${text.length} frases e ${tr.length} traduções`);

  const audioFile = readdirSync(dir).find((n) => n.startsWith("audio") && MIME[extname(n).toLowerCase()]);

  const { data: existing } = await sb.from("lessons").select("id,audio_path")
    .eq("user_id", uid).eq("language", meta.idioma).eq("collection", meta.colecao ?? "").eq("title", meta.titulo).maybeSingle();
  const id = existing?.id ?? randomUUID();

  let audio_path = existing?.audio_path ?? null;
  if (audioFile) {
    const ext = extname(audioFile).toLowerCase();
    audio_path = `${uid}/${id}${ext}`;
    const up = await sb.storage.from("audios").upload(audio_path, readFileSync(join(dir, audioFile)), { contentType: MIME[ext], upsert: true });
    if (up.error) throw up.error;
  }

  const row = {
    id, user_id: uid, language: meta.idioma, collection: meta.colecao ?? "", title: meta.titulo,
    level: meta.nivel ?? "", position: meta.ordem ?? 0, read_goal: meta.meta ?? 10, audio_path,
  };
  const r = await sb.from("lessons").upsert(row);
  if (r.error) throw r.error;

  const { data: old } = await sb.from("lesson_sentences").select("idx,text,read_count").eq("lesson_id", id);
  const keep = new Map((old ?? []).map((s) => [s.idx, s]));
  const rows = text.map((t, idx) => ({
    lesson_id: id, user_id: uid, idx, text: t, translation: tr[idx] ?? "",
    start_s: cues[idx]?.start ?? null, end_s: cues[idx]?.end ?? null,
    read_count: keep.get(idx)?.text === t ? keep.get(idx).read_count : 0,
  }));
  await sb.from("lesson_sentences").delete().eq("lesson_id", id).gte("idx", rows.length);
  const s = await sb.from("lesson_sentences").upsert(rows, { onConflict: "lesson_id,idx" });
  if (s.error) throw s.error;
  console.log(`  ✓ ${meta.idioma} · ${meta.colecao ?? ""} · ${meta.titulo} — ${rows.length} frases${audioFile ? " + áudio" : ""}${cues.length ? " + tempos" : ""}`);
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
if (cmd === "licao") {
  const dirs = args.flatMap(findLessonDirs);
  console.log(`Importando ${dirs.length} lição(ões)…`);
  for (const d of dirs) await importLesson(uid, d);
} else if (cmd === "livro") {
  const folderId = flags.pasta ? await folderPath(uid, flags.pasta) : null;
  console.log(`Importando ${args.length} livro(s)${flags.pasta ? ` em “${flags.pasta}”` : ""}…`);
  for (const f of args) await importBook(uid, f, folderId);
} else if (cmd === "estudo") {
  console.log(`Importando ${args.length} transcrição(ões)…`);
  for (const f of args) await importStudy(uid, f);
} else {
  console.log("Uso: npm run importar -- licao|livro|estudo <caminhos…> (veja o topo deste arquivo)");
  process.exit(1);
}
