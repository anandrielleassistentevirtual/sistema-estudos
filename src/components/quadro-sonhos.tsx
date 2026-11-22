"use client";
/**
 * Quadro dos sonhos, no fim do Dashboard: um mural com os sonhos de vida (imagem, frase e área).
 * Em cima, os números do dia a dia; aqui embaixo, para onde eles levam.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImagePlus, Link2, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { RowMenu } from "@/components/row-menu";
import { supabase } from "@/lib/supabase/client";
import { dayKey } from "@/lib/dates";
import {
  AREAS_SONHO, apagarImagem, areaDoSonho, carregarSonhos, guardarImagem, imagemDoLink, imagensDosSonhos, type AreaSonho, type Sonho,
} from "@/lib/sonhos";

export function QuadroSonhos() {
  const [sonhos, setSonhos] = useState<Sonho[] | null>(null);
  const [imagens, setImagens] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<Sonho | "novo" | null>(null);
  const [filtro, setFiltro] = useState<AreaSonho | "todos">("todos");

  const carregar = useCallback(async () => {
    try {
      const l = await carregarSonhos();
      setSonhos(l);
      setImagens(await imagensDosSonhos(l));
    } catch { setSonhos([]); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!sonhos) return null;
  // os realizados vão para o fim do mural (continuam lá: são conquistas)
  const ordem = [...sonhos].sort((a, b) => Number(!!a.realizado_em) - Number(!!b.realizado_em) || a.posicao - b.posicao);
  const visiveis = filtro === "todos" ? ordem : ordem.filter((s) => s.area === filtro);
  const areasUsadas = AREAS_SONHO.filter((a) => sonhos.some((s) => s.area === a.id));
  const realizados = sonhos.filter((s) => s.realizado_em).length;

  async function mudar(s: Sonho, campos: Partial<Sonho>) {
    setSonhos((l) => l?.map((x) => (x.id === s.id ? { ...x, ...campos } : x)) ?? null);
    await supabase().from("sonhos").update(campos).eq("id", s.id);
  }
  async function mover(s: Sonho, dir: -1 | 1) {
    const l = ordem.filter((x) => !!x.realizado_em === !!s.realizado_em);
    const i = l.findIndex((x) => x.id === s.id), j = i + dir;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    const pos = new Map(l.map((x, k) => [x.id, k]));
    setSonhos((all) => all?.map((x) => (pos.has(x.id) ? { ...x, posicao: pos.get(x.id)! } : x)) ?? null);
    const sb = supabase();
    await Promise.all(l.map((x, k) => sb.from("sonhos").update({ posicao: k }).eq("id", x.id)));
  }
  async function apagar(s: Sonho) {
    if (!confirm(`Apagar o sonho “${s.titulo}”?`)) return;
    setSonhos((l) => l?.filter((x) => x.id !== s.id) ?? null);
    await supabase().from("sonhos").delete().eq("id", s.id);
    await apagarImagem(s.imagem);
  }

  return (
    <section className="pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[1.0625rem] font-semibold tracking-tight flex items-center gap-2"><Sparkles size={17} className="text-[var(--warn)]" /> Quadro dos sonhos</h2>
          <p className="text-xs text-muted mt-0.5">
            {sonhos.length ? `${sonhos.length} ${sonhos.length === 1 ? "sonho" : "sonhos"}${realizados ? ` · ${realizados} ${realizados === 1 ? "realizado" : "realizados"}` : ""} · ` : ""}
            Os números lá em cima são o caminho; aqui está para onde ele leva.
          </p>
        </div>
        <button className="btn" onClick={() => setEditando("novo")}><Plus size={15} /> Novo sonho</button>
      </div>

      {areasUsadas.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {([{ id: "todos" as const, nome: "Todos", cor: "var(--muted)" }, ...areasUsadas]).map((a) => {
            const ativo = filtro === a.id;
            return (
              <button key={a.id} onClick={() => setFiltro(a.id)} aria-pressed={ativo}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${ativo ? "font-medium text-ink" : "text-muted border-line hover:text-ink"}`}
                style={ativo ? { borderColor: a.cor, background: `color-mix(in srgb, ${a.cor} 10%, transparent)` } : undefined}>
                {a.id !== "todos" && <span className="dot !w-1.5 !h-1.5" style={{ background: a.cor }} />}{a.nome}
              </button>
            );
          })}
        </div>
      )}

      {sonhos.length === 0 ? (
        <button onClick={() => setEditando("novo")}
          className="w-full rounded-xl border border-dashed border-line px-6 py-12 text-center hover:bg-surface/60 transition-colors">
          <Sparkles size={22} strokeWidth={1.6} className="mx-auto mb-3 text-faint" />
          <span className="block font-serif text-lg">Que vida você quer construir?</span>
          <span className="block text-sm text-muted mt-1 max-w-md mx-auto">Ler os grandes livros, publicar um romance, falar inglês com fluência, uma viagem, uma vida de oração… Cada sonho com uma imagem que lembre você dele.</span>
          <span className="btn btn-primary mt-4"><Plus size={15} /> Primeiro sonho</span>
        </button>
      ) : (
        // mural em colunas: cada imagem com a sua altura natural, como num quadro de cortiça
        <div className="columns-1 min-[480px]:columns-2 lg:columns-3 2xl:columns-4 gap-3">
          {visiveis.map((s) => {
            const area = areaDoSonho(s.area);
            const img = imagens[s.id];
            const feito = !!s.realizado_em;
            const k = ordem.filter((x) => !!x.realizado_em === feito).findIndex((x) => x.id === s.id);
            const n = ordem.filter((x) => !!x.realizado_em === feito).length;
            const menu = (
              <RowMenu botaoClass={`p-1.5 rounded-full ${img ? "bg-black/35 text-white hover:bg-black/55" : ""}`} items={[
                { label: "Editar", icon: Pencil, onClick: () => setEditando(s) },
                feito
                  ? { label: "Ainda não realizado", icon: RotateCcw, onClick: () => void mudar(s, { realizado_em: null }) }
                  : { label: "Realizei este sonho", icon: Check, onClick: () => void mudar(s, { realizado_em: dayKey() }) },
                { label: "Mover para antes", icon: ArrowLeft, separar: true, disabled: k === 0, onClick: () => void mover(s, -1) },
                { label: "Mover para depois", icon: ArrowRight, disabled: k === n - 1, onClick: () => void mover(s, 1) },
                { label: "Apagar", icon: Trash2, danger: true, separar: true, onClick: () => void apagar(s) },
              ]} />
            );
            return (
              <article key={s.id} className={`group relative break-inside-avoid mb-3 rounded-xl overflow-hidden border shadow-sm ${feito ? "" : "border-line"}`}
                style={feito ? { borderColor: "color-mix(in srgb, var(--good) 55%, var(--border))" } : undefined}>
                {img ? (
                  <button className="block w-full text-left" onClick={() => setEditando(s)} title="Editar">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="w-full block object-cover max-h-[440px]" loading="lazy" />
                    <span className="absolute inset-x-0 bottom-0 pt-16 px-4 pb-3.5 bg-gradient-to-t from-black/85 via-black/50 to-transparent text-white">
                      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider opacity-90"><span className="dot !w-1.5 !h-1.5" style={{ background: area.cor }} />{area.nome}</span>
                      <span className="block font-serif text-xl leading-snug mt-0.5">{s.titulo}</span>
                      {s.frase && <span className="block text-[13px] italic opacity-85 mt-1 line-clamp-3 leading-snug">{s.frase}</span>}
                    </span>
                  </button>
                ) : (
                  <button className="block w-full text-left px-4 pt-5 pb-4 min-h-[150px]" onClick={() => setEditando(s)} title="Editar"
                    style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${area.cor} 22%, var(--surface)), var(--surface) 75%)` }}>
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted"><span className="dot !w-1.5 !h-1.5" style={{ background: area.cor }} />{area.nome}</span>
                    <span className="block font-serif text-xl leading-snug mt-1">{s.titulo}</span>
                    {s.frase && <span className="block text-[13px] italic text-muted mt-1.5 leading-snug">{s.frase}</span>}
                  </button>
                )}
                {feito && (
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: "var(--good)" }}>
                    <Check size={12} strokeWidth={3} /> realizado em {new Date(`${s.realizado_em}T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                  </span>
                )}
                <span className="absolute top-2 right-2 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">{menu}</span>
              </article>
            );
          })}
        </div>
      )}

      {editando && (
        <EditarSonho sonho={editando === "novo" ? null : editando} url={editando !== "novo" ? imagens[editando.id] : undefined} posicao={sonhos.length}
          onClose={() => setEditando(null)} onSalvo={() => { setEditando(null); void carregar(); }} />
      )}
    </section>
  );
}

function EditarSonho({ sonho, url, posicao, onClose, onSalvo }: { sonho: Sonho | null; url?: string; posicao: number; onClose: () => void; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState(sonho?.titulo ?? "");
  const [frase, setFrase] = useState(sonho?.frase ?? "");
  const [area, setArea] = useState<AreaSonho>(sonho?.area ?? "intelectual");
  const [imagem, setImagem] = useState<string | null>(sonho?.imagem ?? null);
  const [previa, setPrevia] = useState<string | undefined>(url);
  const [realizado, setRealizado] = useState(sonho?.realizado_em ?? "");
  const [link, setLink] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  async function porImagem(img: Blob | null) {
    if (!img) return;
    setOcupado("Guardando a imagem…"); setErro(null);
    try { setImagem(await guardarImagem(img)); setPrevia(URL.createObjectURL(img)); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }
  async function porLink(v: string) {
    setOcupado("Buscando a imagem…"); setErro(null);
    try { const r = await imagemDoLink(v); setImagem(r); setPrevia(/^https?:/.test(r) ? r : v); setLink(""); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  }
  function colar(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); void porImagem(item.getAsFile()); return; }
    const texto = e.clipboardData.getData("text").trim();
    if (!(e.target as HTMLElement).closest("input[name=titulo],textarea") && /^https?:\/\/\S+$/.test(texto)) { e.preventDefault(); void porLink(texto); }
  }
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    const campos = { titulo: titulo.trim(), frase: frase.trim(), area, imagem, realizado_em: realizado || null };
    const sb = supabase();
    const { error } = sonho ? await sb.from("sonhos").update(campos).eq("id", sonho.id) : await sb.from("sonhos").insert({ ...campos, posicao });
    if (error) return setErro(error.message);
    // a imagem antiga, se foi trocada, sai do armazenamento
    if (sonho?.imagem && sonho.imagem !== imagem) await apagarImagem(sonho.imagem);
    onSalvo();
  }

  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/45" onClick={onClose}>
      <form onSubmit={salvar} onPaste={colar} onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="modal-title">{sonho ? "Editar sonho" : "Novo sonho"}</h2>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Fechar"><X size={18} /></button>
        </div>

        {/* a imagem: enviar, colar (Ctrl+V) ou o link */}
        <div>
          {previa ? (
            <div className="relative rounded-xl overflow-hidden border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previa} alt="" className="w-full max-h-64 object-cover block" />
              <button type="button" className="absolute top-2 right-2 btn py-1 px-2 text-xs" onClick={() => { setImagem(null); setPrevia(undefined); }}><X size={13} /> Tirar</button>
            </div>
          ) : (
            <button type="button" onClick={() => arquivo.current?.click()}
              className="w-full rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted hover:text-ink hover:bg-surface-2/50 transition-colors">
              <ImagePlus size={22} strokeWidth={1.6} className="mx-auto mb-2" />
              {ocupado ?? "Enviar uma imagem — ou cole uma (Ctrl+V)"}
            </button>
          )}
          <div className="flex gap-1.5 mt-2">
            <label className="input flex items-center gap-2 py-1.5 flex-1">
              <Link2 size={14} className="text-faint shrink-0" />
              <input className="bg-transparent outline-none flex-1 min-w-0 text-sm" placeholder="ou o link de uma imagem (Pinterest, Unsplash…)" value={link} onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (link.trim()) void porLink(link); } }} />
            </label>
            <button type="button" className="btn text-sm" disabled={!link.trim() || !!ocupado} onClick={() => void porLink(link)}>Usar</button>
          </div>
          <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void porImagem(f); e.target.value = ""; }} />
        </div>

        <label className="block space-y-1"><span className="label">O sonho</span>
          <input name="titulo" className="input" autoFocus={!sonho} required value={titulo} placeholder="ex.: Publicar o meu primeiro romance" onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="block space-y-1"><span className="label">Uma frase (opcional)</span>
          <textarea className="input min-h-[64px] leading-snug" value={frase} placeholder="Por que ele importa? Ou uma citação que lembre você dele." onChange={(e) => setFrase(e.target.value)} />
        </label>
        <div>
          <span className="label">Área da vida</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {AREAS_SONHO.map((a) => {
              const ativo = area === a.id;
              return (
                <button key={a.id} type="button" onClick={() => setArea(a.id)} aria-pressed={ativo}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${ativo ? "font-medium text-ink" : "text-muted border-line hover:text-ink"}`}
                  style={ativo ? { borderColor: a.cor, background: `color-mix(in srgb, ${a.cor} 12%, transparent)` } : undefined}>
                  <span className="dot !w-1.5 !h-1.5" style={{ background: a.cor }} />{a.nome}
                </button>
              );
            })}
          </div>
        </div>
        {sonho && (
          <label className="flex items-center gap-2 text-sm">
            <span className="label">Realizado em</span>
            <input type="date" className="input w-auto py-1 text-sm" value={realizado} max={dayKey()} onChange={(e) => setRealizado(e.target.value)} />
            {realizado && <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setRealizado("")}>ainda não</button>}
          </label>
        )}
        {erro && <p className="text-sm text-critical">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!titulo.trim() || !!ocupado}>Salvar</button>
        </div>
      </form>
    </div>
  );
}
