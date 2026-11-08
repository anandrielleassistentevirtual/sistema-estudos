"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookHeart, ChevronLeft, ChevronRight, ExternalLink, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey, fmtClock, fmtDuration, parseDay } from "@/lib/dates";
import { FONTS } from "@/components/reader/types";
import { useReaderPrefs } from "@/components/reader/prefs";
import { useTimer } from "@/components/timer-context";

interface Versiculo { n: number; texto: string }
interface Comentario { autor: string; fonte: string; sobre: string; texto: string; destaque: boolean }
interface Dia {
  dia: string; liturgia: string; cor: string; referencia: string; titulo: string; introducao: string;
  versiculos: Versiculo[]; chave: string; chave_ref: string; comentarios: Comentario[]; catena_url: string;
}
interface Registro { id: string; dia: string; referencia: string; palavra: string; oracao: string; proposito: string; segundos: number; created_at: string }

const ETAPAS = [
  { id: "leitura", nome: "Leitura", pergunta: "O que o texto diz?", guia: "Leia devagar, de preferência em voz baixa, duas vezes. Deixe que uma palavra ou frase se destaque." },
  { id: "meditacao", nome: "Meditação", pergunta: "O que o texto me diz?", guia: "Rumine a palavra que te tocou, à luz dos Santos Padres." },
  { id: "oracao", nome: "Oração", pergunta: "O que eu digo a Deus?", guia: "Responda a Deus com as suas palavras: louvor, pedido, perdão, gratidão." },
  { id: "contemplacao", nome: "Contemplação", pergunta: "Repousar em Deus", guia: "Silêncio. Permaneça na presença de Deus, repetindo no coração a palavra, sem pressa." },
] as const;
type Etapa = (typeof ETAPAS)[number]["id"];

const COR: Record<string, string> = { verde: "#1f8a3b", branco: "#d8d2c2", vermelho: "#c0392b", roxo: "#6b3fa0", rosa: "#e58fb0", preto: "#222" };

function sino() {
  try {
    const ac = new AudioContext();
    [0, 0.9].forEach((t, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = i ? 660 : 880;
      g.gain.setValueAtTime(0.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 2.2);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + t);
      o.stop(ac.currentTime + t + 2.3);
    });
  } catch {}
}

/** Liturgia direto da API pública (quando o dia ainda não tem curadoria). */
async function liturgiaDoDia(d: string): Promise<Dia | null> {
  try {
    const [y, m, dd] = d.split("-");
    const r = await fetch(`https://liturgia.up.railway.app/v2/?dia=${dd}&mes=${m}&ano=${y}`);
    const j = await r.json();
    const ev = j.leituras?.evangelho?.[0];
    if (!ev) return null;
    const texto = String(ev.texto).replace(/\s*-?\s*Palavra da [Ss]alva[çc][ãa]o\.?\s*$/, "");
    const partes = texto.split(/(?<![\d,])(\d{1,3})(?=[^\d,])/);
    const versiculos: Versiculo[] = [];
    for (let k = 1; k < partes.length - 1; k += 2) versiculos.push({ n: Number(partes[k]), texto: partes[k + 1].trim() });
    const livro = ({ Mt: "mateus", Mc: "marcos", Lc: "lucas", Jo: "joao" } as Record<string, string>)[String(ev.referencia).slice(0, 2)];
    const cap = String(ev.referencia).match(/\s(\d+),/)?.[1];
    return {
      dia: d, liturgia: j.liturgia, cor: j.cor, referencia: ev.referencia, titulo: ev.titulo, introducao: partes[0].trim(),
      versiculos, chave: "", chave_ref: "", comentarios: [],
      catena_url: livro && cap ? `https://catenaaurea.com.br/?evangelho=${livro}&capitulo=${cap}` : "",
    };
  } catch {
    return null;
  }
}

export default function Lectio() {
  const [dia, setDia] = useState(dayKey());
  const [dado, setDado] = useState<Dia | null>(null);
  const [curado, setCurado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [minutos, setMinutos] = useState(5);
  const [etapa, setEtapa] = useState(0);
  const [rodando, setRodando] = useState(false);
  const [restante, setRestante] = useState(5 * 60);
  const [total, setTotal] = useState(0);
  const [fim, setFim] = useState(false);
  const [palavra, setPalavra] = useState("");
  const [oracao, setOracao] = useState("");
  const [proposito, setProposito] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [salvo, setSalvo] = useState(false);
  const [prefs] = useReaderPrefs();
  const timer = useTimer();
  const tick = useRef<number | null>(null);

  useEffect(() => {
    try { const m = Number(localStorage.getItem("lectio-minutos")); if (m >= 1 && m <= 30) { setMinutos(m); setRestante(m * 60); } } catch {}
  }, []);

  const carregar = useCallback(async (d: string) => {
    setCarregando(true);
    const { data } = await supabase().from("lectio_dias").select("*").eq("dia", d).maybeSingle();
    if (data) { setDado(data as Dia); setCurado(true); }
    else { setDado(await liturgiaDoDia(d)); setCurado(false); }
    setCarregando(false);
  }, []);
  useEffect(() => { void carregar(dia); }, [dia, carregar]);

  const carregarRegistros = useCallback(async () => {
    const { data } = await supabase().from("lectio_registros").select("*").order("created_at", { ascending: false }).limit(30);
    setRegistros((data as Registro[]) ?? []);
  }, []);
  useEffect(() => { void carregarRegistros(); }, [carregarRegistros]);

  // relógio das etapas
  useEffect(() => {
    if (!rodando) { tick.current = null; return; }
    tick.current = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = (now - (tick.current ?? now)) / 1000;
      tick.current = now;
      setTotal((x) => x + dt);
      setRestante((r) => r - dt);
    }, 250);
    return () => clearInterval(t);
  }, [rodando]);

  const avancar = useCallback(() => {
    sino();
    setEtapa((e) => {
      if (e >= ETAPAS.length - 1) { setRodando(false); setFim(true); return e; }
      return e + 1;
    });
    setRestante(minutos * 60);
  }, [minutos]);

  useEffect(() => { if (rodando && restante <= 0) avancar(); }, [restante, rodando, avancar]);

  function iniciar() {
    if (etapa === 0 && total === 0) {
      sino();
      try { localStorage.setItem("menu-oculto", "1"); } catch {}
      window.dispatchEvent(new CustomEvent("modo-foco", { detail: { oculto: true } }));
    }
    setRodando(true);
  }

  function recomecar() {
    setRodando(false); setEtapa(0); setRestante(minutos * 60); setTotal(0); setFim(false); setSalvo(false);
  }

  async function salvar() {
    if (!dado) return;
    const segundos = Math.round(total);
    const sb = supabase();
    await sb.from("lectio_registros").insert({ dia: dado.dia, referencia: dado.referencia, palavra, oracao, proposito, segundos });
    // se o timer geral estiver ligado, ele já conta este tempo (evita contar em dobro)
    if (segundos >= 60 && !timer.running) {
      await sb.from("study_sessions").insert({
        day: dayKey(), started_at: new Date(Date.now() - segundos * 1000).toISOString(),
        seconds: segundos, category: "Oração", label: `Lectio Divina · ${dado.referencia}`,
      });
    }
    setSalvo(true);
    void carregarRegistros();
  }

  const atual = ETAPAS[etapa];
  const pct = 1 - Math.max(0, restante) / (minutos * 60);
  const comentarios = useMemo(() => [...(dado?.comentarios ?? [])].sort((a, b) => Number(b.destaque) - Number(a.destaque)), [dado]);
  const dataLonga = parseDay(dia).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const serif = { fontFamily: FONTS[prefs.font].css };

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {/* cabeçalho */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <button className="btn btn-ghost px-2" onClick={() => setDia(dayKey(addDays(parseDay(dia), -1)))} disabled={rodando}><ChevronLeft size={16} /></button>
          <div className="text-center min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted first-letter:uppercase">{dataLonga}</div>
            <h1 className="text-xl font-semibold flex items-center justify-center gap-2">
              <BookHeart size={18} className="text-accent" /> Lectio Divina
            </h1>
          </div>
          <button className="btn btn-ghost px-2" onClick={() => setDia(dayKey(addDays(parseDay(dia), 1)))} disabled={rodando}><ChevronRight size={16} /></button>
        </div>
        {dado && (
          <p className="text-center text-sm text-muted flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-block w-2.5 h-2.5 rounded-full border border-line" style={{ background: COR[dado.cor?.toLowerCase()] ?? "#999" }} title={`Cor litúrgica: ${dado.cor}`} />
            {dado.liturgia} · <span className="font-medium text-ink">{dado.referencia}</span>
          </p>
        )}

        {/* etapas */}
        <div className="grid grid-cols-4 gap-1.5 mt-6">
          {ETAPAS.map((e, i) => (
            <button key={e.id} disabled={rodando} onClick={() => { setEtapa(i); setRestante(minutos * 60); setFim(false); }}
              className={`rounded-lg py-2 text-xs sm:text-sm transition-colors ${i === etapa && !fim ? "bg-accent text-white font-medium" : i < etapa || fim ? "bg-accent-soft text-ink" : "bg-surface-2 text-muted"}`}>
              {e.nome}
            </button>
          ))}
        </div>

        {/* relógio */}
        <div className="card p-4 mt-3 flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--surface-2)" strokeWidth="5" />
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - (fim ? 1 : pct))} style={{ transition: "stroke-dashoffset .25s linear" }} />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-xs font-mono tabular-nums">{fim ? "✓" : fmtClock(Math.max(0, restante))}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{fim ? "Lectio concluída" : `${atual.nome} — ${atual.pergunta}`}</div>
            <div className="text-xs text-muted">{fim ? `Tempo total: ${fmtDuration(total)}` : atual.guia}</div>
          </div>
          <div className="flex gap-1 shrink-0">
            {!fim && (rodando
              ? <button className="btn" onClick={() => setRodando(false)} title="Pausar"><Pause size={15} /></button>
              : <button className="btn btn-primary" onClick={iniciar} title="Iniciar"><Play size={15} /> <span className="hidden sm:inline">{total ? "Continuar" : "Iniciar"}</span></button>)}
            {!fim && <button className="btn btn-ghost px-2" onClick={avancar} title="Próxima etapa"><SkipForward size={15} /></button>}
            <button className="btn btn-ghost px-2" onClick={recomecar} title="Recomeçar"><RotateCcw size={15} /></button>
          </div>
        </div>
        {!rodando && total === 0 && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted mt-2">
            Minutos por etapa:
            {[3, 5, 7, 10].map((m) => (
              <button key={m} onClick={() => { setMinutos(m); setRestante(m * 60); try { localStorage.setItem("lectio-minutos", String(m)); } catch {} }}
                className={`px-2 py-0.5 rounded-md ${minutos === m ? "bg-accent-soft text-ink font-medium" : "hover:bg-surface-2"}`}>{m}</button>
            ))}
          </div>
        )}

        {carregando && <p className="text-center text-sm text-muted mt-10">Carregando o Evangelho do dia…</p>}
        {!carregando && !dado && <p className="text-center text-sm text-muted mt-10">Não consegui carregar a liturgia deste dia.</p>}

        {!carregando && dado && !fim && (
          <div className="mt-6">
            {/* LEITURA */}
            {atual.id === "leitura" && (
              <article className="leading-[1.8] text-[1.12rem] text-justify" style={serif}>
                <p className="text-sm text-muted mb-3 text-left">{dado.titulo}</p>
                {dado.introducao && <span>{dado.introducao} </span>}
                {dado.versiculos.map((v) => (
                  <span key={v.n}><sup className="text-[0.65em] text-accent font-sans mr-0.5">{v.n}</sup>{v.texto} </span>
                ))}
              </article>
            )}

            {/* MEDITAÇÃO */}
            {atual.id === "meditacao" && (
              <div className="space-y-4">
                {comentarios.length === 0 ? (
                  <div className="card p-5 text-sm text-muted">
                    A curadoria dos comentários deste dia ainda não foi feita. Medite no texto
                    {dado.catena_url && <> — ou veja todos os comentários na <a className="text-accent underline" href={dado.catena_url} target="_blank" rel="noreferrer">Catena Aurea</a></>}.
                  </div>
                ) : comentarios.map((c, i) => (
                  <figure key={i} className={`card p-5 ${c.destaque ? "border-accent/50" : ""}`}>
                    <blockquote className="leading-[1.75] text-[1.08rem] text-justify" style={serif}>“{c.texto}”</blockquote>
                    <figcaption className="mt-3 text-sm flex flex-wrap items-baseline justify-between gap-2">
                      <span><span className="font-semibold">{c.autor}</span>{c.fonte && !/^ubi sup/i.test(c.fonte) && <span className="text-muted"> · {c.fonte}</span>}</span>
                      {c.sobre && <span className="text-xs text-faint">sobre {c.sobre}</span>}
                    </figcaption>
                  </figure>
                ))}
                <label className="block">
                  <span className="label">Palavra que tocou o meu coração</span>
                  <input className="input mt-1" style={serif} value={palavra} onChange={(e) => setPalavra(e.target.value)} placeholder="Uma palavra ou frase do Evangelho" />
                </label>
                {dado.catena_url && curado && (
                  <a className="text-xs text-muted hover:text-accent inline-flex items-center gap-1" href={dado.catena_url} target="_blank" rel="noreferrer">
                    Ver todos os comentários na Catena Aurea <ExternalLink size={11} />
                  </a>
                )}
              </div>
            )}

            {/* ORAÇÃO */}
            {atual.id === "oracao" && (
              <div className="space-y-3">
                {palavra && <p className="text-center italic text-muted" style={serif}>“{palavra}”</p>}
                <textarea className="input min-h-[220px] leading-relaxed text-[1.05rem]" style={serif} value={oracao} onChange={(e) => setOracao(e.target.value)}
                  placeholder="Senhor, …" />
                <p className="text-xs text-faint text-center">Escrever é opcional — pode também rezar em silêncio.</p>
              </div>
            )}

            {/* CONTEMPLAÇÃO */}
            {atual.id === "contemplacao" && (
              <div className="py-12 md:py-20 text-center">
                <p className="text-2xl md:text-3xl leading-relaxed px-2" style={serif}>
                  {palavra || dado.chave || dado.versiculos[dado.versiculos.length - 1]?.texto}
                </p>
                {!palavra && dado.chave_ref && <p className="text-sm text-muted mt-4">{dado.chave_ref}</p>}
                <p className="text-xs text-faint mt-10">Permaneça em silêncio na presença de Deus.</p>
              </div>
            )}
          </div>
        )}

        {/* FIM */}
        {fim && dado && (
          <div className="mt-6 space-y-3">
            <p className="text-center text-xl" style={serif}>{palavra || dado.chave}</p>
            <label className="block">
              <span className="label">Propósito para hoje (opcional)</span>
              <input className="input mt-1" value={proposito} onChange={(e) => setProposito(e.target.value)} placeholder="Um gesto concreto que nasce desta oração" />
            </label>
            <div className="flex justify-center gap-2 pt-2">
              {salvo ? <span className="text-sm text-good">Guardado no seu diário. Deus te abençoe!</span>
                : <button className="btn btn-primary" onClick={salvar}>Guardar no diário</button>}
            </div>
          </div>
        )}

        {/* diário */}
        {!rodando && registros.length > 0 && (
          <section className="mt-12">
            <h2 className="label mb-2">Diário de oração</h2>
            <ul className="space-y-2">
              {registros.slice(0, 10).map((r) => (
                <li key={r.id} className="card p-3 text-sm">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{parseDay(r.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · {r.referencia}</span>
                    <span>{fmtDuration(r.segundos)}</span>
                  </div>
                  {r.palavra && <p className="mt-1 italic" style={serif}>“{r.palavra}”</p>}
                  {r.oracao && <p className="mt-1 text-muted whitespace-pre-wrap line-clamp-3">{r.oracao}</p>}
                  {r.proposito && <p className="mt-1 text-xs"><span className="text-muted">Propósito:</span> {r.proposito}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-[11px] text-faint text-center mt-10">
          Comentários: Catena Aurea, de Santo Tomás de Aquino (texto de catenaaurea.com.br), com curadoria. Liturgia: liturgia.up.railway.app.
        </p>
      </div>
    </div>
  );
}
