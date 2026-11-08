#!/usr/bin/env node
/**
 * Grava (ou atualiza) os dias montados por montar_semana.py na tabela lectio_dias.
 *   npm run lectio:publicar -- dias.json
 * Usa NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e DONO_EMAIL (.env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.DONO_EMAIL;
if (!url || !key || !email) { console.error("Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e DONO_EMAIL."); process.exit(1); }
const fetchSemBearer = (input, init = {}) => {
  const h = new Headers(init.headers);
  if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
  return fetch(input, { ...init, headers: h });
};
const sb = createClient(url, key, { auth: { persistSession: false }, global: { fetch: fetchSemBearer } });
const { data: users, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) throw error;
const uid = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
if (!uid) throw new Error(`Usuário ${email} não encontrado`);
const dias = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rows = dias.map((d) => ({ user_id: uid, ...d }));
const r = await sb.from("lectio_dias").upsert(rows, { onConflict: "user_id,dia" });
if (r.error) throw r.error;
for (const d of dias) console.log(`  ✓ ${d.dia} ${d.referencia} — ${d.comentarios.length} comentários`);
