"use client";
/**
 * Contagens regressivas do Dashboard: quantos dias faltam até uma data, com a meta ("10 kg a menos") e uma
 * barrinha do tempo já percorrido desde o início. Ficam no cabeçalho, ao lado do período: não ocupam altura.
 * Clique numa contagem para editar ou apagar; "+" cria outra.
 */
import { useEffect, useState } from "react";
import { Hourglass, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { dayKey, parseDay } from "@/lib/dates";

interface Contagem { id: string; titulo: string; meta: string; data: string; inicio: string; ordem: number }

const DIA = 86400000;
const diasEntre = (de: string, ate: string) => Math.round((parseDay(ate).getTime() - parseDay(de).getTime()) / DIA);
const dataCurta = (k: string) => {
  const [a, m, d] = k.split("-");
  return a === dayKey().slice(0, 4) ? `${+d}/${+m}` : `${+d}/${+m}/${a}`;
};

/** "30 dias"; acima de um ano, também "≈ 4 anos e 1 mês" */
function emAnos(dias: number) {
  if (dias < 365) return "";
  const anos = Math.floor(dias / 365.25), meses = Math.floor((dias - anos * 365.25) / 30.44);
  return `≈ ${anos} ${anos === 1 ? "ano" : "anos"}${meses ? ` e ${meses} ${meses === 1 ? "mês" : "meses"}` : ""}`;
}

export function Contagens() {
  const [itens, setItens] = useState<Contagem[] | null>(null);
  const [editando, setEditando] = useState<Contagem | "nova" | null>(null);
  const carregar = () => {
    void supabase().from("contagens").select("id,titulo,meta,data,inicio,ordem").order("ordem").order("data")
      .then(({ data }) => setItens((data as Contagem[] | null) ?? []));
  };
  useEffect(carregar, []);
  if (!itens) return null;
  const hoje = dayKey();

  return (
    <>
      {itens.map((c) => {
        const faltam = diasEntre(hoje, c.data);
        const total = Math.max(1, diasEntre(c.inicio, c.data));
        const feito = Math.min(1, Math.max(0, diasEntre(c.inicio, hoje) / total));
        const anos = emAnos(faltam);
        return (
          <button key={c.id} onClick={() => setEditando(c)}
            className="card flex items-center gap-2.5 px-3 py-1.5 text-left hover:border-ink/30 min-w-0 max-w-[17rem]"
            title={`${c.titulo}${c.meta ? ` — ${c.meta}` : ""} · até ${parseDay(c.data).toLocaleDateString("pt-BR")}${anos ? ` (${anos})` : ""} · ${Math.round(feito * 100)}% do tempo já passou · clique para editar`}>
            <span className="flex items-baseline gap-1 shrink-0 tabular-nums">
              <span className="text-[1.3rem] font-semibold leading-none tracking-[-0.02em]">{faltam > 0 ? faltam.toLocaleString("pt-BR") : faltam === 0 ? "hoje" : "✓"}</span>
              {faltam > 0 && <span className="text-[11px] text-muted">{faltam === 1 ? "dia" : "dias"}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium truncate leading-tight">{c.titulo}</span>
              <span className="block text-[11px] text-muted truncate leading-tight">
                {c.meta ? `${c.meta} · ` : ""}{faltam >= 0 ? `até ${dataCurta(c.data)}` : `encerrada em ${dataCurta(c.data)}`}
              </span>
              <span className="block h-[3px] mt-1 rounded-full bg-sel overflow-hidden" aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${feito * 100}%`, background: faltam <= 7 && faltam >= 0 ? "var(--warn)" : "var(--chart)" }} />
              </span>
            </span>
          </button>
        );
      })}
      <button className="btn btn-ghost px-2" title="Nova contagem regressiva" aria-label="Nova contagem regressiva" onClick={() => setEditando("nova")}>
        {itens.length ? <Plus size={15} /> : <><Hourglass size={15} /> Contagem regressiva</>}
      </button>
      {editando && <Editar contagem={editando === "nova" ? null : editando} ordem={itens.length} onFechar={(mudou) => { setEditando(null); if (mudou) carregar(); }} />}
    </>
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
