"use client";
/**
 * Quadro dos sonhos, no fim do Dashboard: uma colagem só de imagens — sobrepostas, num tom só, numa tela escura —
 * para olhar e imaginar, sem palavras. O sonho realizado ganha cor.
 * Montar é rápido: várias imagens de uma vez, arrastar e soltar, colar (Ctrl+V) ou o link de uma imagem.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Link2, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { RowMenu } from "@/components/row-menu";
import { supabase } from "@/lib/supabase/client";
import { dayKey } from "@/lib/dates";
import { apagarImagem, carregarSonhos, guardarImagem, imagemDoLink, imagensDosSonhos, type Sonho } from "@/lib/sonhos";

/** o lugar de cada imagem (giro, deslocamento, largura) vem do id: cada uma fica sempre no mesmo lugar */
function semente(id: string) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
/** textura de grão (une as imagens como uma foto só) */
const GRAO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

export function QuadroSonhos() {
  const [sonhos, setSonhos] = useState<Sonho[] | null>(null);
  const [imagens, setImagens] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<Sonho | null>(null);
  const [porLink, setPorLink] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const l = await carregarSonhos();
      setSonhos(l);
      setImagens(await imagensDosSonhos(l));
    } catch { setSonhos([]); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

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

  if (!sonhos) return null;
  const comImagem = sonhos.filter((s) => imagens[s.id]).sort((a, b) => a.posicao - b.posicao);

  async function mudar(s: Sonho, campos: Partial<Sonho>) {
    setSonhos((l) => l?.map((x) => (x.id === s.id ? { ...x, ...campos } : x)) ?? null);
    await supabase().from("sonhos").update(campos).eq("id", s.id);
  }
  async function mover(s: Sonho, dir: -1 | 1) {
    const l = [...comImagem];
    const i = l.findIndex((x) => x.id === s.id), j = i + dir;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
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

      {/* a tela: sempre escura, como uma moldura; as imagens se sobrepõem numa grade densa */}
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); const fs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")); if (fs.length) void adicionar(fs); }}
        className={`relative isolate overflow-hidden rounded-2xl bg-[#09090a] ${comImagem.length ? "h-[520px] md:h-[640px]" : "p-5 sm:p-8"} ${arrastando ? "ring-2 ring-[var(--focus)]" : ""}`}
        style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)" }}>
        {comImagem.length === 0 ? (
          <button onClick={() => arquivo.current?.click()} className="relative w-full h-[340px] grid place-items-center group" aria-label="Adicionar imagens">
            {/* o vazio já sugere a colagem */}
            {[[8, 12, 28, 46, -3], [30, 30, 26, 40, 2], [52, 8, 30, 52, -1], [70, 34, 22, 44, 3], [18, 50, 24, 36, 1]].map(([l, t, w, h, r], i) => (
              <span key={i} className="absolute rounded-[3px] border border-white/[0.07] bg-white/[0.025]"
                style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, transform: `rotate(${r}deg)` }} />
            ))}
            <span className="relative flex flex-col items-center gap-2 text-white/55 group-hover:text-white/85 transition-colors">
              <ImagePlus size={28} strokeWidth={1.4} />
              <span className="text-sm">Arraste imagens para cá, cole (Ctrl+V) ou clique</span>
            </span>
          </button>
        ) : (
          // colunas que se empilham sem buraco; cada imagem no seu formato, avançando sobre a de cima e sobre a coluna ao lado
          // a colagem sai pelas bordas (como uma parede) e, com poucas imagens, elas se repetem até cobrir a tela
          <div className="columns-2 md:columns-3 xl:columns-4 2xl:columns-5 [column-gap:0] -mx-6 -mt-8 w-[calc(100%+3rem)]">
            {Array.from({ length: Math.max(1, Math.ceil(18 / comImagem.length)) }, (_, volta) => comImagem.map((s, k) => ({ s, k, volta }))).flat().slice(0, Math.max(18, comImagem.length)).map(({ s, k, volta }) => {
              const h = semente(volta ? `${s.id}:${volta}` : s.id);
              const giro = (((h >> 4) % 9) - 4) * 0.45; // −1,8° a 1,8°
              const dx = ((h >> 8) % 25) - 12; // invade a coluna vizinha
              const largura = [100, 92, 104, 88, 98][h % 5];
              const z = 1 + ((h >> 16) % 6);
              const feito = !!s.realizado_em;
              return (
                <figure key={`${s.id}:${volta}`}
                  className="group relative break-inside-avoid mb-[-26px] md:mb-[-34px] transition-transform duration-300 [transform:translateX(var(--dx))_rotate(var(--g))] hover:!z-30 hover:[transform:translateX(var(--dx))_rotate(0deg)_scale(1.05)]"
                  style={{ ["--dx" as string]: `${dx}px`, ["--g" as string]: `${giro}deg`, zIndex: z, width: `${largura}%`, marginLeft: h % 2 ? "auto" : undefined } as React.CSSProperties}
                  title={s.titulo || undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagens[s.id]} alt={s.titulo || `Sonho ${k + 1}`} loading="lazy"
                    className="w-full h-auto max-h-[460px] object-cover block rounded-[3px] transition-[filter] duration-500 group-hover:[filter:none]"
                    style={{
                      // um tom só para todas (como uma foto única); o sonho realizado ganha cor
                      filter: feito ? "contrast(1.05) brightness(0.92)" : "grayscale(1) contrast(1.15) brightness(0.72)",
                      boxShadow: "0 14px 34px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)",
                    }} />
                  {feito && <span className="absolute bottom-2 left-2 w-5 h-5 rounded-full grid place-items-center text-black" style={{ background: "#d6b25e" }} title="Realizado"><Check size={12} strokeWidth={3} /></span>}
                  <span className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <RowMenu botaoClass="p-1.5 rounded-full bg-black/55 text-white hover:bg-black/75" items={[
                      { label: "Nome (só para você)", icon: Pencil, onClick: () => setEditando(s) },
                      feito
                        ? { label: "Ainda não realizado", icon: RotateCcw, onClick: () => void mudar(s, { realizado_em: null }) }
                        : { label: "Realizei este sonho", icon: Check, onClick: () => void mudar(s, { realizado_em: dayKey() }) },
                      { label: "Mover para antes", icon: ArrowLeft, separar: true, disabled: k === 0, onClick: () => void mover(s, -1) },
                      { label: "Mover para depois", icon: ArrowRight, disabled: k === comImagem.length - 1, onClick: () => void mover(s, 1) },
                      { label: "Tirar do quadro", icon: Trash2, danger: true, separar: true, onClick: () => void apagar(s) },
                    ]} />
                  </span>
                </figure>
              );
            })}
          </div>
        )}
        {/* o que une tudo: vinheta nas bordas e grão por cima (não pegam o clique) */}
        <div className="pointer-events-none absolute inset-0 z-20" style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.78) 100%)" }} />
        <div className="pointer-events-none absolute inset-0 z-20 opacity-[0.09] mix-blend-overlay" style={{ backgroundImage: GRAO }} />
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
