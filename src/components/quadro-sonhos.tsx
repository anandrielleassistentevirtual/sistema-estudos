"use client";
/**
 * Quadro dos sonhos, no fim do Dashboard: um mosaico de imagens coladas umas nas outras, sem palavras,
 * num tom escuro só — para olhar e imaginar. A tela é dividida em retângulos que se encaixam (sem buraco);
 * algumas peças ficam por cima das vizinhas, com sombra, e uma fica em destaque no centro. Cada imagem aparece uma vez só.
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
  /** modo Editar: as imagens em grade, com a lixeira e o menu sempre à vista (no celular não há "passar o mouse") */
  const [editar, setEditar] = useState(false);
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
  // com poucas imagens o quadro fica mais baixo (as fotos são menos cortadas)
  const n = comImagem.length;
  const altura = Math.round((n <= 3 ? 380 : n <= 6 ? 460 : n <= 10 ? 560 : 640) * (celular ? 0.95 : 1));

  // o destaque no centro só com imagens bastante em volta (com poucas, ele cobriria as outras)
  const destaque = comImagem.length >= 7 ? comImagem[0] : null;
  // o mosaico: uma peça para cada imagem, sem repetir (a do destaque fica só no centro)
  const pecas = useMemo(() => {
    const lista = destaque ? comImagem.slice(1) : comImagem;
    if (!lista.length || !largura) return [];
    const rnd = sorteio(lista.map((s) => s.id).join("|") + (celular ? "c" : ""));
    return dividir({ x: 0, y: 0, w: largura, h: altura }, lista.length, rnd).map((r, i) => ({
      r, s: lista[i], i,
      // umas peças "coladas por cima": um pouco maiores que o seu lugar, com sombra
      levantada: lista.length >= 8 && r.w * r.h < largura * altura * 0.12 && rnd() < 0.35,
    }));
  }, [comImagem, destaque, largura, altura, celular]);

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
    if (!confirm("Excluir esta imagem do quadro? Não dá para desfazer.")) return;
    setSonhos((l) => l?.filter((x) => x.id !== s.id) ?? null);
    await supabase().from("sonhos").delete().eq("id", s.id);
    await apagarImagem(s.imagem);
  }
  const menu = (s: Sonho) => (
    <RowMenu botaoClass="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80" items={[
      { label: comImagem.length >= 7 ? "Destacar no centro" : "Destacar no centro (a partir de 7 imagens)", icon: Crosshair, disabled: comImagem.length < 7 || destaque?.id === s.id, onClick: () => void destacar(s) },
      s.realizado_em
        ? { label: "Ainda não realizado", icon: RotateCcw, onClick: () => void mudar(s, { realizado_em: null }) }
        : { label: "Realizei este sonho", icon: Check, onClick: () => void mudar(s, { realizado_em: dayKey() }) },
      { label: "Nome (só para você)", icon: Pencil, onClick: () => setEditando(s) },
      { label: "Excluir a imagem", icon: Trash2, danger: true, separar: true, onClick: () => void apagar(s) },
    ]} />
  );
  /** no canto da imagem: no modo Editar, a lixeira (e o menu) sempre à vista; fora dele, o menu ao passar o mouse */
  const controles = (s: Sonho) => (
    <span className={`absolute top-1.5 right-1.5 z-[45] flex items-center gap-1 transition-opacity ${editar ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
      {editar && (
        <button className="p-1.5 rounded-full bg-black/70 text-white hover:bg-[var(--critical)] transition-colors" title="Excluir esta imagem" aria-label="Excluir esta imagem"
          onClick={() => void apagar(s)}><Trash2 size={15} /></button>
      )}
      {menu(s)}
    </span>
  );
  // um tom só (levemente sem cor, para unir as fotos, mas visíveis); o sonho realizado tem cor plena; ao passar o mouse, a imagem acende
  const tom = (s: Sonho, forte = false) => (s.realizado_em ? "saturate(1.05) contrast(1.05)"
    : forte ? "grayscale(0.25) contrast(1.08)" : "grayscale(0.4) contrast(1.06) brightness(0.9)");

  return (
    <section className="pt-2">
      <div className="flex items-center justify-between gap-3 mb-2.5 px-0.5">
        <h2 className="eyebrow">Quadro dos sonhos</h2>
        <div className="flex items-center gap-1">
          {enviando && <span className="text-xs text-muted mr-2" aria-live="polite">{enviando}</span>}
          {comImagem.length > 0 && (
            <button className={`btn px-2.5 py-1 text-xs ${editar ? "btn-primary" : "btn-ghost"}`} onClick={() => setEditar((v) => !v)}
              title="Mostrar a lixeira em cada imagem">{editar ? <><Check size={14} /> Pronto</> : <><Pencil size={14} /> Editar</>}</button>
          )}
          <button className="btn btn-ghost px-2 py-1" title="O link de uma imagem" aria-label="Adicionar pelo link" onClick={() => setPorLink(true)}><Link2 size={16} /></button>
          <button className="btn btn-ghost px-2 py-1" title="Adicionar imagens (ou arraste, ou cole com Ctrl+V)" aria-label="Adicionar imagens" onClick={() => arquivo.current?.click()}><ImagePlus size={16} /></button>
        </div>
        <input ref={arquivo} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void adicionar([...e.target.files]); e.target.value = ""; }} />
      </div>

      <div ref={tela}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const fs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")); if (fs.length) void adicionar(fs); }}
        className={`relative isolate overflow-hidden rounded-2xl bg-[#070708] ${arrastando ? "ring-2 ring-[var(--focus)]" : ""}`}
        style={{ height: comImagem.length && !editar ? altura : undefined }}>
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
        ) : editar ? (
          // modo Editar: as imagens em miniatura, em cor, com a lixeira e as ações sempre à vista
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-3">
            {comImagem.map((s) => (
              <figure key={s.id} className="relative m-0 aspect-square rounded-lg overflow-hidden bg-white/5" title={s.titulo || undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagens[s.id]} alt={s.titulo || "Sonho"} className="w-full h-full object-cover block" />
                {destaque?.id === s.id && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 text-white text-[10px] px-1.5 py-0.5 inline-flex items-center gap-1"><Crosshair size={10} /> centro</span>}
                {s.realizado_em && <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full grid place-items-center text-black" style={{ background: "#d6b25e" }} title="Realizado"><Check size={12} strokeWidth={3} /></span>}
                {controles(s)}
              </figure>
            ))}
          </div>
        ) : (
          <>
            {pecas.map(({ r, s, i, levantada }) => {
              const sai = levantada ? 6 : 0; // a peça levantada passa um pouco do seu lugar, por cima das vizinhas
              return (
                <figure key={`${s.id}:${i}`} title={s.titulo || undefined}
                  className="group absolute m-0 transition-[transform,filter] duration-300 hover:!z-30 hover:scale-[1.03]"
                  style={{ left: r.x - sai + 1, top: r.y - sai + 1, width: r.w + sai * 2 - 2, height: r.h + sai * 2 - 2, zIndex: levantada ? 5 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagens[s.id]} alt={s.titulo || "Sonho"} loading="lazy"
                    className="w-full h-full object-cover block transition-[filter] duration-500 group-hover:[filter:none]"
                    style={{ filter: tom(s), boxShadow: levantada ? "0 18px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)" : "inset 0 0 0 1px rgba(0,0,0,0.6)" }} />
                  {s.realizado_em && <span className="absolute bottom-2 left-2 w-5 h-5 rounded-full grid place-items-center text-black" style={{ background: "#d6b25e" }} title="Realizado"><Check size={12} strokeWidth={3} /></span>}
                  {controles(s)}
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
                {controles(destaque)}
              </figure>
            )}
          </>
        )}
        {/* o que une tudo: vinheta nas bordas e grão por cima (não pegam o clique) */}
        {!editar && <>
          <div className="pointer-events-none absolute inset-0 z-20" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)" }} />
          <div className="pointer-events-none absolute inset-0 z-[40] opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: GRAO }} />
        </>}
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
