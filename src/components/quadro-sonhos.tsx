"use client";
/**
 * Quadro dos sonhos, no fim do Dashboard: um mosaico de imagens coladas umas nas outras, sem palavras,
 * num tom escuro só — para olhar e imaginar. A tela é dividida em retângulos que se encaixam (sem buraco);
 * algumas peças ficam por cima das vizinhas, com sombra, e uma fica em destaque no centro.
 * O sonho realizado ganha cor. Montar é rápido: várias imagens de uma vez, arrastar, colar (Ctrl+V) ou o link.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Crosshair, ImagePlus, Link2, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { RowMenu } from "@/components/row-menu";
import { supabase } from "@/lib/supabase/client";
import { dayKey } from "@/lib/dates";
import { apagarImagem, carregarSonhos, guardarImagem, imagemDoLink, imagensDosSonhos, type Sonho } from "@/lib/sonhos";

/** textura de grão (une as imagens como uma foto só) */
const GRAO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

interface Ret { x: number; y: number; w: number; h: number }

/** números "aleatórios" sempre iguais para as mesmas imagens (o mosaico não muda a cada visita) */
function sorteio(semente: string) {
  let a = 2166136261;
  for (const ch of semente) a = Math.imul(a ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Divide o retângulo em n pedaços que se encaixam exatamente (cortes retos, tamanhos variados, sem peças finas demais). */
function dividir(r: Ret, n: number, rnd: () => number): Ret[] {
  if (n <= 1) return [r];
  let n1 = Math.floor(n / 2);
  if (n > 3 && rnd() < 0.35) n1 += rnd() < 0.5 ? -1 : 1;
  n1 = Math.min(n - 1, Math.max(1, n1));
  const p = Math.min(0.72, Math.max(0.28, (n1 / n) * (0.82 + rnd() * 0.36)));
  const deitado = r.w / r.h;
  const vertical = deitado > 1.15 || (deitado > 0.85 && rnd() < 0.5);
  const [a, b]: [Ret, Ret] = vertical
    ? [{ ...r, w: r.w * p }, { ...r, x: r.x + r.w * p, w: r.w * (1 - p) }]
    : [{ ...r, h: r.h * p }, { ...r, y: r.y + r.h * p, h: r.h * (1 - p) }];
  return [...dividir(a, n1, rnd), ...dividir(b, n - n1, rnd)];
}

export function QuadroSonhos() {
  const [sonhos, setSonhos] = useState<Sonho[] | null>(null);
  const [imagens, setImagens] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<Sonho | null>(null);
  const [porLink, setPorLink] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const tela = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const l = await carregarSonhos();
      setSonhos(l);
      setImagens(await imagensDosSonhos(l));
    } catch { setSonhos([]); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  useLayoutEffect(() => {
    const el = tela.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sonhos]);

  /** cada imagem vira um sonho (o nome é opcional: dá para pôr depois, só para você) */
  const adicionar = useCallback(async (fontes: (Blob | string)[]) => {
    const base = sonhos?.length ?? 0;
    for (const [k, f] of fontes.entries()) {
      setEnviando(fontes.length > 1 ? `Guardando ${k + 1} de ${fontes.length}…` : "Guardando a imagem…");
      try {
        const imagem = typeof f === "string" ? await imagemDoLink(f) : await guardarImagem(f);
        await supabase().from("sonhos").insert({ titulo: "", imagem, posicao: base + k, area: "outro" });
      } catch (e) { alert((e as Error).message); }
    }
    setEnviando(null);
    void carregar();
  }, [sonhos, carregar]);

  // colar uma imagem (ou o link de uma) em qualquer lugar do Dashboard, fora dos campos de texto
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,[contenteditable=true],.modal")) return;
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      const texto = e.clipboardData?.getData("text").trim() ?? "";
      if (img) { e.preventDefault(); void adicionar([img]); }
      else if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif|avif)(\?\S*)?$/i.test(texto)) { e.preventDefault(); void adicionar([texto]); }
    };
    document.addEventListener("paste", colar);
    return () => document.removeEventListener("paste", colar);
  }, [adicionar]);

  const comImagem = useMemo(() => (sonhos ?? []).filter((s) => imagens[s.id]).sort((a, b) => a.posicao - b.posicao), [sonhos, imagens]);
  const celular = largura > 0 && largura < 640;
  const altura = celular ? 560 : 620;

  // o mosaico: com poucas imagens, elas se repetem até a tela ficar cheia (como na colagem de referência)
  const pecas = useMemo(() => {
    if (!comImagem.length || !largura) return [];
    const n = Math.min(28, Math.max(comImagem.length, celular ? 8 : 12));
    const rnd = sorteio(comImagem.map((s) => s.id).join("|") + (celular ? "c" : ""));
    return dividir({ x: 0, y: 0, w: largura, h: altura }, n, rnd).map((r, i) => ({
      r, s: comImagem[i % comImagem.length], i,
      // umas peças "coladas por cima": um pouco maiores que o seu lugar, com sombra
      levantada: r.w * r.h < largura * altura * 0.14 && rnd() < 0.4,
    }));
  }, [comImagem, largura, altura, celular]);
  const destaque = comImagem.length >= 3 ? comImagem[0] : null;

  if (!sonhos) return null;

  async function mudar(s: Sonho, campos: Partial<Sonho>) {
    setSonhos((l) => l?.map((x) => (x.id === s.id ? { ...x, ...campos } : x)) ?? null);
    await supabase().from("sonhos").update(campos).eq("id", s.id);
  }
  /** o destaque do centro é o primeiro da lista */
  async function destacar(s: Sonho) {
    const l = [s, ...comImagem.filter((x) => x.id !== s.id)];
    const pos = new Map(l.map((x, k) => [x.id, k]));
    setSonhos((all) => all?.map((x) => (pos.has(x.id) ? { ...x, posicao: pos.get(x.id)! } : x)) ?? null);
    const sb = supabase();
    await Promise.all(l.map((x, k) => sb.from("sonhos").update({ posicao: k }).eq("id", x.id)));
  }
  async function apagar(s: Sonho) {
    if (!confirm("Tirar esta imagem do quadro?")) return;
    setSonhos((l) => l?.filter((x) => x.id !== s.id) ?? null);
    await supabase().from("sonhos").delete().eq("id", s.id);
    await apagarImagem(s.imagem);
  }
  const menu = (s: Sonho) => (
    <RowMenu botaoClass="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80" items={[
      { label: "Destacar no centro", icon: Crosshair, disabled: destaque?.id === s.id, onClick: () => void destacar(s) },
      s.realizado_em
        ? { label: "Ainda não realizado", icon: RotateCcw, onClick: () => void mudar(s, { realizado_em: null }) }
        : { label: "Realizei este sonho", icon: Check, onClick: () => void mudar(s, { realizado_em: dayKey() }) },
      { label: "Nome (só para você)", icon: Pencil, onClick: () => setEditando(s) },
      { label: "Tirar do quadro", icon: Trash2, danger: true, separar: true, onClick: () => void apagar(s) },
    ]} />
  );
  // um tom só (quase sem cor, escuro); o sonho realizado ganha cor; ao passar o mouse, a imagem acende
  const tom = (s: Sonho, forte = false) => (s.realizado_em ? "saturate(1.05) contrast(1.05) brightness(0.9)"
    : forte ? "grayscale(0.55) contrast(1.12) brightness(0.92)" : "grayscale(0.9) contrast(1.15) brightness(0.62)");

  return (
    <section className="pt-2">
      <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
        <h2 className="eyebrow">Quadro dos sonhos</h2>
        <div className="flex items-center gap-1">
          {enviando && <span className="text-xs text-muted mr-2" aria-live="polite">{enviando}</span>}
          <button className="btn btn-ghost px-2 py-1" title="O link de uma imagem" aria-label="Adicionar pelo link" onClick={() => setPorLink(true)}><Link2 size={16} /></button>
          <button className="btn btn-ghost px-2 py-1" title="Adicionar imagens (ou arraste, ou cole com Ctrl+V)" aria-label="Adicionar imagens" onClick={() => arquivo.current?.click()}><ImagePlus size={16} /></button>
        </div>
        <input ref={arquivo} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void adicionar([...e.target.files]); e.target.value = ""; }} />
      </div>

      <div ref={tela}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const fs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")); if (fs.length) void adicionar(fs); }}
        className={`relative isolate overflow-hidden rounded-2xl bg-[#070708] ${arrastando ? "ring-2 ring-[var(--focus)]" : ""}`}
        style={{ height: comImagem.length ? altura : undefined }}>
        {comImagem.length === 0 ? (
          <button onClick={() => arquivo.current?.click()} className="relative w-full h-[360px] grid place-items-center group" aria-label="Adicionar imagens">
            {/* o vazio já mostra o mosaico */}
            {dividir({ x: 0, y: 0, w: 100, h: 100 }, 9, sorteio("vazio")).map((r, i) => (
              <span key={i} className="absolute border border-white/[0.06] bg-white/[0.02]" style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }} />
            ))}
            <span className="relative flex flex-col items-center gap-2 text-white/55 group-hover:text-white/85 transition-colors">
              <ImagePlus size={28} strokeWidth={1.4} />
              <span className="text-sm">Arraste imagens para cá, cole (Ctrl+V) ou clique</span>
            </span>
          </button>
        ) : (
          <>
            {pecas.map(({ r, s, i, levantada }) => {
              const sai = levantada ? 10 : 0; // a peça levantada passa um pouco do seu lugar, por cima das vizinhas
              return (
                <figure key={`${s.id}:${i}`} title={s.titulo || undefined}
                  className="group absolute m-0 transition-[transform,filter] duration-300 hover:!z-30 hover:scale-[1.03]"
                  style={{ left: r.x - sai + 1, top: r.y - sai + 1, width: r.w + sai * 2 - 2, height: r.h + sai * 2 - 2, zIndex: levantada ? 5 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagens[s.id]} alt={s.titulo || "Sonho"} loading="lazy"
                    className="w-full h-full object-cover block transition-[filter] duration-500 group-hover:[filter:none]"
                    style={{ filter: tom(s), boxShadow: levantada ? "0 18px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)" : "inset 0 0 0 1px rgba(0,0,0,0.6)" }} />
                  {s.realizado_em && <span className="absolute bottom-2 left-2 w-5 h-5 rounded-full grid place-items-center text-black" style={{ background: "#d6b25e" }} title="Realizado"><Check size={12} strokeWidth={3} /></span>}
                  <span className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">{menu(s)}</span>
                </figure>
              );
            })}
            {/* o destaque: por cima de tudo, no centro, com sombra forte (como a estátua da referência) */}
            {destaque && (
              <figure title={destaque.titulo || undefined}
                className="group absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[25] m-0 w-[58%] sm:w-[34%] xl:w-[28%] aspect-[4/5] transition-transform duration-300 hover:scale-[1.02]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagens[destaque.id]} alt={destaque.titulo || "Sonho em destaque"}
                  className="w-full h-full object-cover block transition-[filter] duration-500 group-hover:[filter:none]"
                  style={{ filter: tom(destaque, true), boxShadow: "0 40px 90px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.1)" }} />
                {destaque.realizado_em && <span className="absolute bottom-2.5 left-2.5 w-6 h-6 rounded-full grid place-items-center text-black" style={{ background: "#d6b25e" }} title="Realizado"><Check size={14} strokeWidth={3} /></span>}
                <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">{menu(destaque)}</span>
              </figure>
            )}
          </>
        )}
        {/* o que une tudo: vinheta nas bordas e grão por cima (não pegam o clique) */}
        <div className="pointer-events-none absolute inset-0 z-20" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.72) 100%)" }} />
        <div className="pointer-events-none absolute inset-0 z-[40] opacity-[0.1] mix-blend-overlay" style={{ backgroundImage: GRAO }} />
      </div>

      {editando && <NomeDoSonho sonho={editando} onClose={() => setEditando(null)} onSalvo={(t) => { void mudar(editando, { titulo: t }); setEditando(null); }} />}
      {porLink && <PeloLink onClose={() => setPorLink(false)} onUsar={(l) => { setPorLink(false); void adicionar([l]); }} />}
    </section>
  );
}

function Janela({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/55" onClick={onClose}>
      <div className="card w-full max-w-sm p-5 space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="modal-title">{titulo}</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NomeDoSonho({ sonho, onClose, onSalvo }: { sonho: Sonho; onClose: () => void; onSalvo: (t: string) => void }) {
  const [t, setT] = useState(sonho.titulo);
  return (
    <Janela titulo="Nome do sonho" onClose={onClose}>
      <p className="text-xs text-muted">Não aparece no quadro: só quando você passa o mouse sobre a imagem.</p>
      <input autoFocus className="input" value={t} placeholder="opcional" onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSalvo(t.trim())} />
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onSalvo(t.trim())}>Salvar</button>
      </div>
    </Janela>
  );
}

function PeloLink({ onClose, onUsar }: { onClose: () => void; onUsar: (link: string) => void }) {
  const [l, setL] = useState("");
  const ok = /^https?:\/\/\S+$/.test(l.trim());
  return (
    <Janela titulo="Imagem pelo link" onClose={onClose}>
      <input autoFocus className="input" value={l} placeholder="https://… (Pinterest, Unsplash…)" onChange={(e) => setL(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && ok) onUsar(l.trim()); }} />
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!ok} onClick={() => onUsar(l.trim())}>Usar</button>
      </div>
    </Janela>
  );
}
