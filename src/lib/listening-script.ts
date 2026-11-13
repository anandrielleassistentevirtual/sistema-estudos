/**
 * O script de Listening (Tampermonkey no Chrome/Firefox, Userscripts no Safari do iPhone), já com a chave.
 * Módulo neutro: usado pela tela e pela rota de instalação com um toque.
 * "@inject-into page": no Safari (Userscripts) o script precisa rodar na própria página para ver o player.
 */
/** O script do Tampermonkey, já com a chave. */
export function scriptListening(chave: string, idioma: string, aparelho = ""): string {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/registrar_escuta`;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const nome = aparelho ? `${idioma} · ${aparelho}` : idioma;
  return `// ==UserScript==
// @name         Sistema de Estudos · Listening (${nome})
// @namespace    sistema-estudos
// @version      1.2
// @description  Conta os minutos de áudio que tocam no curso e manda para o Sistema de Estudos (${idioma} → Listening).
// @match        https://curso.mairovergara.com/*
// @match        https://*.mairovergara.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
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

  // selo no canto da página do curso: mostra que o script está rodando, se achou o áudio e o que já enviou
  let enviados = 0, estado = "aguardando", recolhido = false, selo = null;
  const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  function desenharSelo() {
    if (window.top !== window || !document.body) return;
    if (!selo) {
      selo = document.createElement("div");
      selo.title = "Sistema de Estudos · Listening (clique para recolher)";
      selo.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:rgba(20,20,20,.86);color:#fff;padding:6px 10px;border-radius:999px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);user-select:none";
      selo.addEventListener("click", () => { recolhido = !recolhido; desenharSelo(); });
      document.body.appendChild(selo);
    }
    const total = enviados + pendente;
    const texto = estado === "chave" ? "⚠ chave cancelada ou inválida — reinstale pelo Sistema de Estudos"
      : estado === "rede" ? "⚠ sem conexão com o sistema — tento de novo · " + mmss(total)
      : estado === "ouvindo" ? "● ouvindo · " + mmss(total) + " contados" + (enviados ? " · " + mmss(enviados) + " enviados" : "")
      : enviados ? "✓ " + mmss(enviados) + " enviados ao sistema" : "aguardando o áudio tocar";
    selo.textContent = recolhido ? "🎧" : "🎧 Listening · " + texto;
  }

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
    if (estado !== "chave") estado = ouviu > 0 ? "ouvindo" : estado === "ouvindo" ? "aguardando" : estado;
    desenharSelo();
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
    }).then((r) => {
      if (r.ok) { enviados += s; if (estado === "rede") estado = "aguardando"; }
      else if (r.status === 400) estado = "chave";
      else { pendente += s; estado = "rede"; }
      desenharSelo();
    }).catch(() => { pendente += s; estado = "rede"; desenharSelo(); });
  }

  setInterval(tique, 1000);
  // o selo aparece assim que a página abre (sinal de que o script está rodando)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", desenharSelo); else desenharSelo();
  addEventListener("pagehide", () => { tique(); enviar(true); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { tique(); enviar(true); } });
})();
`;
}
