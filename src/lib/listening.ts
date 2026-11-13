"use client";
/**
 * Listening automático no curso do Mairo: um script do Tampermonkey mede o áudio que toca de verdade em
 * curso.mairovergara.com e manda os segundos para o banco com uma chave pessoal (registrar_escuta).
 * Não usa a senha do curso nem o login do sistema; a chave só serve para somar minutos de escuta.
 */
import { supabase } from "./supabase/client";

export const ROTULO_LISTENING = "Listening (Mairo)";

export interface ChaveListening { id: string; idioma: string; created_at: string; ultimo_uso: string | null; revogada: boolean }

export async function chavesListening(): Promise<ChaveListening[]> {
  const { data } = await supabase().from("integracao_chaves").select("id,idioma,created_at,ultimo_uso,revogada").eq("revogada", false).order("created_at");
  return (data as ChaveListening[] | null) ?? [];
}

/** Cria a chave (o texto só existe agora; no banco fica só o hash). */
export async function criarChaveListening(idioma: string): Promise<string> {
  const { data, error } = await supabase().rpc("criar_chave_listening", { p_idioma: idioma });
  if (error || !data) throw new Error(error?.message ?? "Não consegui criar a chave.");
  return data as string;
}

export async function cancelarChaveListening(id: string) {
  await supabase().from("integracao_chaves").update({ revogada: true }).eq("id", id);
}

/** O script do Tampermonkey, já com a chave. */
export function scriptListening(chave: string, idioma: string): string {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/registrar_escuta`;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return `// ==UserScript==
// @name         Sistema de Estudos · Listening (${idioma})
// @namespace    sistema-estudos
// @version      1.0
// @description  Conta os minutos de áudio que tocam no curso e manda para o Sistema de Estudos (${idioma} → Listening).
// @match        https://curso.mairovergara.com/*
// @match        https://*.mairovergara.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  "use strict";
  const CHAVE = ${JSON.stringify(chave)};
  const URL = ${JSON.stringify(url)};
  const APIKEY = ${JSON.stringify(apikey)};

  // todos os áudios da página, inclusive os que o player cria sem pôr na tela
  const midias = new Set();
  const tocar = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { midias.add(this); return tocar.apply(this, arguments); };
  document.addEventListener("play", (e) => { if (e.target instanceof HTMLMediaElement) midias.add(e.target); }, true);

  const posicao = new WeakMap();
  let ultimoTique = Date.now(), pendente = 0, ultimoEnvio = Date.now();
  const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  // conta só o áudio que avançou tocando (pausado, mudo ou arrastando a barra não conta)
  function tique() {
    const agora = Date.now(), passou = (agora - ultimoTique) / 1000;
    ultimoTique = agora;
    document.querySelectorAll("audio, video").forEach((m) => midias.add(m));
    let ouviu = 0;
    for (const m of midias) {
      const t = m.currentTime, antes = posicao.get(m);
      posicao.set(m, t);
      if (antes == null || m.paused || m.ended || m.muted || m.volume === 0) continue;
      const avancou = (t - antes) / (m.playbackRate || 1);
      if (avancou > 0 && avancou <= passou + 2) ouviu = Math.max(ouviu, avancou);
    }
    pendente += ouviu;
    if (pendente >= 60 || (pendente >= 5 && agora - ultimoEnvio > 60000)) enviar(false);
  }

  function enviar(saindo) {
    const s = Math.floor(pendente);
    if (s < 1) return;
    pendente -= s;
    ultimoEnvio = Date.now();
    fetch(URL, {
      method: "POST", keepalive: saindo,
      headers: { "content-type": "application/json", apikey: APIKEY },
      body: JSON.stringify({ p_chave: CHAVE, p_segundos: s, p_dia: hoje() }),
    }).then((r) => { if (!r.ok && r.status !== 400) pendente += s; }).catch(() => { pendente += s; });
  }

  setInterval(tique, 1000);
  addEventListener("pagehide", () => { tique(); enviar(true); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { tique(); enviar(true); } });
})();
`;
}
