/**
 * O script de Listening (Tampermonkey no Chrome/Firefox, Userscripts no Safari do iPhone), já com a chave.
 * Módulo neutro: usado pela tela e pela rota de instalação com um toque.
 * "@inject-into page": no Safari (Userscripts) o script precisa rodar na própria página para ver o player.
 */
/** O script do Tampermonkey, já com a chave. Conta Listening (áudio) e Aulas (vídeo do Vimeo/YouTube) separados. */
export function scriptListening(chave: string, idioma: string, aparelho = ""): string {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/registrar_escuta`;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const nome = aparelho ? `${idioma} · ${aparelho}` : idioma;
  return `// ==UserScript==
// @name         Sistema de Estudos · Listening (${nome})
// @namespace    sistema-estudos
// @version      1.3
// @description  Conta os minutos de áudio (Listening) e de aula em vídeo (Aulas) no curso e manda para o Sistema de Estudos (${idioma}).
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

  // ---- o que está tocando ----
  // áudios e vídeos da própria página (inclusive os criados sem pôr na tela)
  const midias = new Set();
  const tocar = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { midias.add(this); return tocar.apply(this, arguments); };
  document.addEventListener("play", (e) => { if (e.target instanceof HTMLMediaElement) midias.add(e.target); }, true);

  // aulas em vídeo: o curso usa o Vimeo (às vezes o YouTube) numa janela embutida, que o script não enxerga por dentro;
  // então ele acompanha o próprio controle do player que a página do curso cria (play, pausa, posição)
  const vimeos = [], youtubes = [];
  function embrulhar(dono, nome, registrar) {
    const Orig = dono && dono[nome];
    if (typeof Orig !== "function" || Orig.__sistemaEstudos) return;
    function Embrulho() { const p = new Orig(...arguments); try { registrar(p); } catch (e) {} return p; }
    Embrulho.prototype = Orig.prototype;
    Object.setPrototypeOf(Embrulho, Orig);
    Embrulho.__sistemaEstudos = true;
    dono[nome] = Embrulho;
  }
  function acompanharVimeo(p) {
    const st = { p, tocando: false, pos: null, antes: null, rate: 1 };
    p.on("play", () => { st.tocando = true; });
    p.on("playing", () => { st.tocando = true; });
    p.on("pause", () => { st.tocando = false; });
    p.on("ended", () => { st.tocando = false; });
    p.on("timeupdate", (d) => { if (d && typeof d.seconds === "number") st.pos = d.seconds; });
    p.on("playbackratechange", (d) => { if (d && d.playbackRate) st.rate = d.playbackRate; });
    vimeos.push(st);
  }
  const registrarYT = (p) => youtubes.push({ p, antes: null });
  function procurarPlayers() {
    embrulhar(window.Vimeo, "Player", acompanharVimeo);
    embrulhar(window.YT, "Player", registrarYT);
  }
  // pega o player desde o início: quando a página define window.Vimeo / window.YT (e o .Player deles), já embrulha
  function vigiar(dono, nome, aoDefinir) {
    try {
      let valor = dono[nome];
      Object.defineProperty(dono, nome, { configurable: true, enumerable: true, get() { return valor; }, set(v) { valor = v; try { aoDefinir(v); } catch (e) {} } });
      if (valor) aoDefinir(valor);
    } catch (e) {}
  }
  function vigiarPlayer(registrar) {
    return (obj) => {
      if (!obj || (typeof obj !== "object" && typeof obj !== "function")) return;
      vigiar(obj, "Player", () => embrulhar(obj, "Player", registrar));
    };
  }
  vigiar(window, "Vimeo", vigiarPlayer(acompanharVimeo));
  vigiar(window, "YT", vigiarPlayer(registrarYT));

  // ---- selo no canto da página: mostra que o script está rodando, o que está contando e o que já enviou ----
  const conta = { listening: { pendente: 0, enviados: 0, ativo: false }, aula: { pendente: 0, enviados: 0, ativo: false } };
  let estado = "ok", recolhido = false, selo = null;
  const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  function desenharSelo() {
    if (window.top !== window || !document.body) return;
    if (!selo) {
      selo = document.createElement("div");
      selo.title = "Sistema de Estudos (clique para recolher)";
      selo.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;font:12px/1.3 system-ui,sans-serif;background:rgba(20,20,20,.86);color:#fff;padding:6px 10px;border-radius:999px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);user-select:none";
      selo.addEventListener("click", () => { recolhido = !recolhido; desenharSelo(); });
      document.body.appendChild(selo);
    }
    if (recolhido) { selo.textContent = "🎧"; return; }
    if (estado === "chave") { selo.textContent = "⚠ Sistema de Estudos: chave cancelada ou inválida — reinstale pelo sistema"; return; }
    const parte = (icone, nome, c) => (c.ativo ? "● " : "") + icone + " " + nome + " " + mmss(c.enviados + c.pendente);
    const partes = [];
    if (conta.listening.ativo || conta.listening.enviados + conta.listening.pendente >= 1) partes.push(parte("🎧", "Listening", conta.listening));
    if (conta.aula.ativo || conta.aula.enviados + conta.aula.pendente >= 1) partes.push(parte("🎬", "Aulas", conta.aula));
    selo.textContent = (partes.length ? partes.join(" · ") : "🎧 Sistema de Estudos · aguardando o áudio ou a aula tocar")
      + (estado === "rede" ? " · ⚠ sem conexão, tento de novo" : "");
  }

  // ---- contagem: só o que avançou tocando (pausado, mudo ou arrastando a barra não conta) ----
  const posicao = new WeakMap();
  let ultimoTique = Date.now(), ultimoEnvio = Date.now();
  const hoje = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const valido = (avancou, passou) => avancou > 0 && avancou <= passou + 2;

  function tique() {
    const agora = Date.now(), passou = (agora - ultimoTique) / 1000;
    ultimoTique = agora;
    procurarPlayers();
    document.querySelectorAll("audio, video").forEach((m) => midias.add(m));
    let audio = 0, aula = 0;
    for (const m of midias) {
      const t = m.currentTime, antes = posicao.get(m);
      posicao.set(m, t);
      if (antes == null || m.paused || m.ended || m.muted || m.volume === 0) continue;
      const avancou = (t - antes) / (m.playbackRate || 1);
      if (!valido(avancou, passou)) continue;
      if (m.tagName === "VIDEO") aula = Math.max(aula, avancou); else audio = Math.max(audio, avancou);
    }
    for (const v of vimeos) {
      const antes = v.antes; v.antes = v.pos;
      if (!v.tocando || antes == null || v.pos == null) continue;
      const avancou = (v.pos - antes) / (v.rate || 1);
      if (valido(avancou, passou)) aula = Math.max(aula, avancou);
    }
    for (const y of youtubes) {
      try {
        const tocando = y.p.getPlayerState && y.p.getPlayerState() === 1;
        const t = y.p.getCurrentTime ? y.p.getCurrentTime() : null, antes = y.antes;
        y.antes = t;
        if (!tocando || antes == null || t == null) continue;
        const avancou = (t - antes) / ((y.p.getPlaybackRate && y.p.getPlaybackRate()) || 1);
        if (valido(avancou, passou)) aula = Math.max(aula, avancou);
      } catch (e) {}
    }
    conta.listening.pendente += audio; conta.listening.ativo = audio > 0;
    conta.aula.pendente += aula; conta.aula.ativo = aula > 0;
    desenharSelo();
    const total = conta.listening.pendente + conta.aula.pendente;
    if (total >= 60 || (total >= 5 && agora - ultimoEnvio > 60000)) { enviar("listening", false); enviar("aula", false); }
  }

  function enviar(tipo, saindo) {
    const c = conta[tipo], s = Math.floor(c.pendente);
    if (s < 1) return;
    c.pendente -= s;
    ultimoEnvio = Date.now();
    fetch(URL, {
      method: "POST", keepalive: saindo,
      headers: { "content-type": "application/json", apikey: APIKEY },
      body: JSON.stringify({ p_chave: CHAVE, p_segundos: s, p_dia: hoje(), p_tipo: tipo }),
    }).then((r) => {
      if (r.ok) { c.enviados += s; if (estado === "rede") estado = "ok"; }
      else if (r.status === 400) estado = "chave";
      else { c.pendente += s; estado = "rede"; }
      desenharSelo();
    }).catch(() => { c.pendente += s; estado = "rede"; desenharSelo(); });
  }
  const enviarTudo = () => { tique(); enviar("listening", true); enviar("aula", true); };

  procurarPlayers();
  setInterval(tique, 1000);
  // o selo aparece assim que a página abre (sinal de que o script está rodando)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", desenharSelo); else desenharSelo();
  addEventListener("pagehide", enviarTudo);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") enviarTudo(); });
})();
`;
}
