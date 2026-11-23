"use client";
/**
 * Quadro dos sonhos, no fim do Dashboard: as fotos coladas umas nas outras, sem palavras, para olhar e imaginar.
 * Cada foto no seu formato (quase nada é cortado): o destaque, grande, à esquerda, e as outras em fileiras ao lado
 * que enchem a largura exata — sem buraco e sem nada por cima. Cada imagem aparece uma vez só.
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

const VAO = 3; // a fresta entre as fotos (coladas, mas cada uma inteira)
interface Peca { s: Sonho; x: number; y: number; w: number; h: number }

/** Divide os itens em `k` fileiras seguidas, com a soma das proporções o mais parecida possível. */
function fileiras<T extends { r: number }>(itens: T[], k: number): T[][] {
  const total = itens.reduce((a, x) => a + x.r, 0);
  const out: T[][] = [];
  let atual: T[] = [], soma = 0;
  for (const [i, x] of itens.entries()) {
    atual.push(x); soma += x.r;
    const faltamFileiras = k - out.length - 1, faltamItens = itens.length - i - 1;
    if (faltamFileiras > 0 && (soma >= (total / k) * (out.length + 1) - x.r / 2 || faltamItens === faltamFileiras)) { out.push(atual); atual = []; }
  }
  if (atual.length) out.push(atual);
  return out;
}

/**
 * O arranjo do quadro, respeitando o formato de cada foto (quase nada é cortado):
 * computador — o destaque, grande, à esquerda, na altura toda; as outras em fileiras ao lado, que enchem a largura exata
 *   (a largura do destaque é escolhida para os dois lados terem a mesma altura);
 * celular — o destaque em cima, na largura toda; as outras em fileiras embaixo.
 */
function arranjar(lista: Sonho[], prop: (s: Sonho) => number, W: number, celular: boolean): { pecas: Peca[]; altura: number } {
  if (!lista.length || !W) return { pecas: [], altura: 0 };
  const itens = lista.map((s) => ({ s, r: Math.min(2.4, Math.max(0.45, prop(s))) }));
  if (itens.length === 1) {
    const h = Math.min(W / itens[0].r, 520), w = Math.min(W, h * itens[0].r);
    return { pecas: [{ s: itens[0].s, x: (W - w) / 2, y: 0, w, h }], altura: h };
  }
  const [hero, ...resto] = itens;
  // fileiras justificadas numa largura: cada fileira fica com a altura que faz as fotos encherem a largura exata
  const montar = (rows: typeof itens[], largura: number, x0: number, y0: number) => {
    let y = y0;
    const out: Peca[] = [];
    for (const row of rows) {
      const soma = row.reduce((a, x) => a + x.r, 0);
      const h = (largura - VAO * (row.length - 1)) / soma;
      let x = x0;
      for (const it of row) { const w = it.r * h; out.push({ s: it.s, x, y, w, h }); x += w + VAO; }
      y += h + VAO;
    }
    return { out, fim: y - VAO };
  };
  if (celular) {
    const hh = Math.min(W / hero.r, W * 1.5);
    const rows: typeof itens[] = [];
    let atual: typeof itens = [], soma = 0;
    for (const it of resto) { atual.push(it); soma += it.r; if (soma * 150 >= W) { rows.push(atual); atual = []; soma = 0; } }
    if (atual.length) rows.push(atual);
    const { out, fim } = montar(rows, W, 0, hh + VAO);
    return { pecas: [{ s: hero.s, x: 0, y: 0, w: W, h: hh }, ...out], altura: Math.min(fim, hh + VAO + 900) };
  }
  // altura natural das fileiras ao lado, numa largura (cada fileira enche a largura exata no formato das fotos)
  const alturaDe = (rows: typeof itens[], largura: number) =>
    rows.reduce((a, row) => a + (largura - VAO * (row.length - 1)) / row.reduce((b, x) => b + x.r, 0), 0) + VAO * (rows.length - 1);
  // para cada número de fileiras, a largura do destaque em que ele e as fileiras ficam da mesma altura (nada cortado);
  // fica a opção com a altura mais perto de ~520 px
  let melhor = { rows: [resto], hw: W * 0.35, H: 480, nota: Infinity };
  for (let k = 1; k <= Math.min(4, resto.length); k++) {
    const rows = fileiras(resto, k);
    let a = W * 0.18, b = W * 0.6;
    for (let it = 0; it < 40; it++) {
      const m = (a + b) / 2;
      if (m / hero.r < alturaDe(rows, W - m - VAO)) a = m; else b = m;
    }
    const hw = (a + b) / 2, H = hw / hero.r;
    const nota = Math.abs(Math.log(H / 520)) + (H > 760 ? 2 : 0);
    if (nota < melhor.nota) melhor = { rows, hw, H, nota };
  }
  const { rows, hw, H } = melhor;
  const { out } = montar(rows, W - hw - VAO, hw + VAO, 0);
  return { pecas: [{ s: hero.s, x: 0, y: 0, w: hw, h: H }, ...out], altura: H };
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
  /** a proporção (largura ÷ altura) de cada foto, lida da própria imagem */
  const [proporcao, setProporcao] = useState<Record<string, number>>({});
  useEffect(() => {
    for (const s of comImagem) {
      if (proporcao[s.id]) continue;
      const im = new Image();
      im.onload = () => im.naturalHeight && setProporcao((p) => ({ ...p, [s.id]: im.naturalWidth / im.naturalHeight }));
      im.src = imagens[s.id];
    }
  }, [comImagem, imagens]); // eslint-disable-line react-hooks/exhaustive-deps
  const celular = largura > 0 && largura < 640;
  // o destaque é o primeiro da lista (grande, à esquerda; no celular, em cima)
  const destaque = comImagem.length >= 2 ? comImagem[0] : null;
  const { pecas, altura } = useMemo(() => arranjar(comImagem, (s) => proporcao[s.id] ?? 0.8, largura, celular), [comImagem, proporcao, largura, celular]);

  if (!sonhos) return null;

  async function mudar(s: Sonho, campos: Partial<Sonho>) {
    setSonhos((l) => l?.map((x) => (x.id === s.id ? { ...x, ...campos } : x)) ?? null);
    await supabase().from("sonhos").update(campos).eq("id", s.id);
  }
  /** o destaque é o primeiro da lista */
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
      { label: "Pôr em destaque", icon: Crosshair, disabled: comImagem.length < 2 || destaque?.id === s.id, onClick: () => void destacar(s) },
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
        style={{ height: comImagem.length && !editar ? altura || 420 : undefined }}>
        {comImagem.length === 0 ? (
          <button onClick={() => arquivo.current?.click()} className="relative w-full h-[360px] grid place-items-center group" aria-label="Adicionar imagens">
            {/* o vazio já mostra o mosaico */}
            {[[0, 0, 34, 100], [34, 0, 33, 48], [67, 0, 33, 48], [34, 48, 22, 52], [56, 48, 44, 52]].map(([x, y, w, h], i) => (
              <span key={i} className="absolute border border-white/[0.06] bg-white/[0.02]" style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }} />
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
                {destaque?.id === s.id && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 text-white text-[10px] px-1.5 py-0.5 inline-flex items-center gap-1"><Crosshair size={10} /> destaque</span>}
                {s.realizado_em && <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full grid place-items-center text-black" style={{ background: "#d6b25e" }} title="Realizado"><Check size={12} strokeWidth={3} /></span>}
                {controles(s)}
              </figure>
            ))}
          </div>
        ) : (
          <>
            {pecas.map((p) => {
              const s = p.s, ehDestaque = destaque?.id === s.id;
              return (
                <figure key={s.id} title={s.titulo || undefined}
                  className="group absolute m-0 overflow-hidden transition-[filter] duration-300 hover:z-30"
                  style={{ left: p.x, top: p.y, width: p.w, height: p.h }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagens[s.id]} alt={s.titulo || "Sonho"} loading="lazy"
                    // object-position um pouco acima do meio: se algo precisar ser cortado, o rosto fica
                    className="w-full h-full object-cover [object-position:50%_30%] block transition-[filter,transform] duration-500 group-hover:[filter:none] group-hover:scale-[1.02]"
                    style={{ filter: tom(s, ehDestaque) }} />
                  {s.realizado_em && <span className="absolute bottom-2 left-2 w-5 h-5 rounded-full grid place-items-center text-black" style={{ background: "#d6b25e" }} title="Realizado"><Check size={12} strokeWidth={3} /></span>}
                  {controles(s)}
                </figure>
              );
            })}
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
