"use client";
/**
 * Contagens regressivas do Dashboard: dias, horas, minutos e segundos até a data (0h do dia, horário de Brasília),
 * com a meta ("10 kg a menos") e uma barrinha do tempo já percorrido desde o início.
 * Clique numa contagem para editar ou apagar; "+ nova" cria outra.
 */
import { useEffect, useState } from "react";
import { Hourglass, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { dayKey } from "@/lib/dates";

interface Contagem { id: string; titulo: string; meta: string; data: string; inicio: string; ordem: number }

/** 0h do dia no horário de Brasília (−03:00), em milissegundos */
const zeroHora = (k: string) => Date.parse(`${k}T00:00:00-03:00`);
const dataCurta = (k: string) => {
  const [a, m, d] = k.split("-");
  return a === dayKey().slice(0, 4) ? `${+d}/${+m}` : `${+d}/${+m}/${a}`;
};
const dois = (n: number) => String(n).padStart(2, "0");

export function Contagens() {
  const [itens, setItens] = useState<Contagem[] | null>(null);
  const [editando, setEditando] = useState<Contagem | "nova" | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const carregar = () => {
    void supabase().from("contagens").select("id,titulo,meta,data,inicio,ordem").order("ordem").order("data")
      .then(({ data }) => setItens((data as Contagem[] | null) ?? []));
  };
  useEffect(carregar, []);
  // o relógio anda de segundo em segundo (no virar do segundo, para todas as contagens mudarem juntas)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tique = () => { setAgora(Date.now()); t = setTimeout(tique, 1000 - (Date.now() % 1000) + 5); };
    t = setTimeout(tique, 1000 - (Date.now() % 1000) + 5);
    return () => clearTimeout(t);
  }, []);
  if (!itens) return null;
  if (!itens.length) {
    return (
      <>
        <button className="btn btn-ghost self-start" onClick={() => setEditando("nova")}><Hourglass size={15} /> Contagem regressiva</button>
        {editando && <Editar contagem={null} ordem={0} onFechar={(mudou) => { setEditando(null); if (mudou) carregar(); }} />}
      </>
    );
  }

  return (
    <section className={`grid grid-cols-1 gap-3 md:gap-4 ${itens.length > 1 ? "md:grid-cols-2" : ""} ${itens.length > 2 ? "2xl:grid-cols-3" : ""}`} aria-label="Contagens regressivas">
      {itens.map((c, i) => {
        const fim = zeroHora(c.data), ini = zeroHora(c.inicio);
        const resta = Math.max(0, fim - agora);
        const s = Math.floor(resta / 1000);
        const partes: [string, string][] = [
          [String(Math.floor(s / 86400)), "Dias"], [dois(Math.floor((s % 86400) / 3600)), "Horas"],
          [dois(Math.floor((s % 3600) / 60)), "Minutos"], [dois(s % 60), "Segundos"],
        ];
        const feito = Math.min(1, Math.max(0, (agora - ini) / Math.max(1, fim - ini)));
        const acabou = resta === 0;
        return (
          <div key={c.id} role="button" tabIndex={0} onClick={() => setEditando(c)} onKeyDown={(e) => { if (e.key === "Enter") setEditando(c); }}
            className="card relative px-4 pt-3 pb-3.5 min-w-0 cursor-pointer hover:border-ink/30 flex flex-col items-center text-center" title="Clique para editar">
            {i === itens.length - 1 && (
              <button className="absolute top-2 right-3 text-xs text-faint hover:text-ink inline-flex items-center gap-0.5 py-1"
                onClick={(e) => { e.stopPropagation(); setEditando("nova"); }} title="Nova contagem regressiva"><Plus size={13} /> nova</button>
            )}
            <h3 className="text-sm font-medium truncate max-w-full px-12">{c.titulo}</h3>
            <p className="text-xs text-muted truncate max-w-full px-12 mt-0.5">{c.meta ? `${c.meta} · ` : ""}até {dataCurta(c.data)}</p>
            <div className="w-full max-w-[34rem] mt-2.5">
              {acabou ? (
                <div className="py-3 text-2xl font-light text-muted">chegou o dia ✓</div>
              ) : (
                <div className="grid grid-cols-4" aria-label={`Faltam ${partes.map(([v, r]) => `${v} ${r.toLowerCase()}`).join(", ")}`}>
                  {partes.map(([v, r]) => (
                    <div key={r} className="flex flex-col items-center min-w-0">
                      <span className="font-mono font-light tabular-nums leading-none tracking-[-0.04em] text-[clamp(2.1rem,4.2vw,3.6rem)]" style={{ color: "color-mix(in srgb, var(--text) 82%, transparent)" }}>{v}</span>
                      <span className="text-[12px] sm:text-[13px] text-muted mt-1.5">{r}</span>
                    </div>
                  ))}
                </div>
              )}
              <span className="block h-[3px] mt-3 mx-auto w-[88%] rounded-full bg-sel overflow-hidden" aria-hidden title={`${Math.round(feito * 100)}% do tempo já passou`}>
                <span className="block h-full rounded-full" style={{ width: `${feito * 100}%`, background: fim - agora < 7 * 86400000 ? "var(--warn)" : "var(--chart)" }} />
              </span>
            </div>
          </div>
        );
      })}
      {editando && <Editar contagem={editando === "nova" ? null : editando} ordem={itens.length} onFechar={(mudou) => { setEditando(null); if (mudou) carregar(); }} />}
    </section>
  );
}

function Editar({ contagem, ordem, onFechar }: { contagem: Contagem | null; ordem: number; onFechar: (mudou: boolean) => void }) {
  const [titulo, setTitulo] = useState(contagem?.titulo ?? "");
  const [meta, setMeta] = useState(contagem?.meta ?? "");
  const [data, setData] = useState(contagem?.data ?? "");
  const [inicio, setInicio] = useState(contagem?.inicio ?? dayKey());
  const [erro, setErro] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(false); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onFechar]);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !data) return setErro("Dê um nome e escolha a data.");
    if (inicio > data) return setErro("O início precisa ser antes da data final.");
    const campos = { titulo: titulo.trim(), meta: meta.trim(), data, inicio };
    const { error } = contagem
      ? await supabase().from("contagens").update(campos).eq("id", contagem.id)
      : await supabase().from("contagens").insert({ ...campos, ordem });
    if (error) return setErro(error.message);
    onFechar(true);
  };
  const apagar = async () => {
    if (!contagem || !confirm(`Apagar a contagem “${contagem.titulo}”?`)) return;
    await supabase().from("contagens").delete().eq("id", contagem.id);
    onFechar(true);
  };
  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4" onClick={() => onFechar(false)}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={salvar} className="card w-full max-w-md p-5 space-y-3 text-left">
        <div className="flex justify-between items-center gap-3">
          <h2 className="modal-title">{contagem ? "Contagem regressiva" : "Nova contagem regressiva"}</h2>
          <button type="button" className="p-1 -m-1 rounded-md text-muted hover:text-ink hover:bg-sel" onClick={() => onFechar(false)} aria-label="Fechar"><X size={18} /></button>
        </div>
        <label className="block text-sm">Nome
          <input className="input mt-1 w-full" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Projeto fitness" autoFocus />
        </label>
        <label className="block text-sm">Meta <span className="text-faint">(opcional)</span>
          <input className="input mt-1 w-full" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="10 kg a menos" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Até
            <input type="date" className="input mt-1 w-full" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="block text-sm">Desde
            <input type="date" className="input mt-1 w-full" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-faint">“Desde” marca o começo do caminho: a barrinha mostra quanto do tempo já passou.</p>
        {erro && <p className="text-sm" style={{ color: "var(--critical)" }}>{erro}</p>}
        <div className="flex items-center gap-2 pt-1">
          {contagem && <button type="button" className="btn btn-ghost text-muted" onClick={apagar}><Trash2 size={15} /> Apagar</button>}
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  );
}
