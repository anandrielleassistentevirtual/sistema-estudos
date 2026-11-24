"use client";
/**
 * Contagens regressivas do Dashboard, numa linha fina: o nome, a meta ("10 kg a menos") e o relógio — dias e hh:mm:ss
 * até a data (0h do dia, horário de Brasília) —, com uma barrinha embaixo do caminho já percorrido desde o início.
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
  const editar = editando && <Editar contagem={editando === "nova" ? null : editando} ordem={itens.length} onFechar={(mudou) => { setEditando(null); if (mudou) carregar(); }} />;

  // uma linha fina de "pílulas": nome, meta e o relógio (dias e hh:mm:ss); a barrinha embaixo é o caminho já percorrido
  return (
    <section className="flex flex-wrap items-center gap-2" aria-label="Contagens regressivas">
      {itens.map((c) => {
        const fim = zeroHora(c.data), ini = zeroHora(c.inicio);
        const resta = Math.max(0, fim - agora);
        const s = Math.floor(resta / 1000);
        const dias = Math.floor(s / 86400);
        const relogio = `${dois(Math.floor((s % 86400) / 3600))}:${dois(Math.floor((s % 3600) / 60))}:${dois(s % 60)}`;
        const feito = Math.min(1, Math.max(0, (agora - ini) / Math.max(1, fim - ini)));
        const perto = resta > 0 && resta < 7 * 86400000;
        return (
          <button key={c.id} onClick={() => setEditando(c)} title={`${c.titulo}${c.meta ? ` — ${c.meta}` : ""} · até ${dataCurta(c.data)} · ${Math.round(feito * 100)}% do caminho (clique para editar)`}
            className="relative overflow-hidden inline-flex items-center gap-3 rounded-xl border border-line bg-surface pl-3 pr-3.5 py-1.5 min-w-0 max-w-full text-left hover:border-[color-mix(in_srgb,var(--text)_25%,var(--border))] transition-colors">
            <Hourglass size={14} className="shrink-0 text-faint" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium leading-tight truncate">{c.titulo}</span>
              <span className="block text-[11px] text-muted leading-tight truncate">{c.meta ? `${c.meta} · ` : ""}até {dataCurta(c.data)}</span>
            </span>
            {resta === 0 ? (
              <span className="text-xs text-muted shrink-0">chegou o dia ✓</span>
            ) : (
              <span className="shrink-0 font-mono tabular-nums text-[15px] leading-none tracking-tight" style={{ color: perto ? "var(--warn)" : undefined }}
                aria-label={`Faltam ${dias} dias e ${relogio}`}>
                {dias}<span className="text-[11px] text-muted font-sans ml-px mr-1.5">d</span>{relogio}
              </span>
            )}
            <span className="absolute left-0 bottom-0 h-[2px]" style={{ width: `${feito * 100}%`, background: perto ? "var(--warn)" : "var(--chart)", opacity: 0.55 }} aria-hidden />
          </button>
        );
      })}
      <button className="btn btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setEditando("nova")} title="Nova contagem regressiva">
        <Plus size={13} /> {itens.length ? "" : "Contagem regressiva"}
      </button>
      {editar}
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
