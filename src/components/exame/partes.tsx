"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ANTES_DO_EXAME, ATO_DE_CONTRICAO, CONTRICAO_PERFEITA, QUANTIDADES, diasDesde, quantidadeValida, tempoDesde } from "@/lib/exame";
import { dataBr, hojeIso } from "@/lib/confissao";

const vermelho = { color: "var(--bad, #d33)" };

/** Quantas vezes (obrigatório) e, quando o pecado pede, a circunstância. */
export function Quantidade({ valor, dica, nota, cobrar, onMudar, onNota }: {
  valor: string; dica?: string; nota?: string; cobrar?: boolean; onMudar: (v: string) => void; onNota?: (v: string) => void;
}) {
  const falta = !quantidadeValida(valor);
  return (
    <div className="mt-2 ml-8 space-y-1.5">
      <div className="text-xs text-muted">Quantas vezes?</div>
      <div className={`flex flex-wrap gap-1.5 rounded-lg ${falta && cobrar ? "ring-2 ring-offset-2 ring-offset-surface p-0.5" : ""}`}
        style={falta && cobrar ? { ["--tw-ring-color" as string]: "var(--bad, #d33)" } : undefined}>
        {QUANTIDADES.map((q) => (
          <button key={q} type="button" onClick={() => onMudar(q)}
            className={`text-sm rounded-full px-3 py-1 border transition-colors ${valor === q ? "bg-chart border-chart text-bg font-medium" : "border-line text-muted hover:text-ink"}`}>{q}</button>
        ))}
      </div>
      {falta && cobrar && <p className="text-xs" style={vermelho}>Escolha quantas vezes.</p>}
      {dica && onNota && (
        <input className="input py-1.5 text-sm" value={nota ?? ""} placeholder={dica} onChange={(e) => onNota(e.target.value)} />
      )}
    </div>
  );
}

export function AntesDoExame({ aberto }: { aberto: boolean }) {
  return (
    <details className="card p-5 group" open={aberto}>
      <summary className="cursor-pointer list-none flex items-center justify-between font-medium">
        Antes do exame de consciência <ChevronDown size={16} className="text-muted group-open:rotate-180 transition-transform" />
      </summary>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
        {ANTES_DO_EXAME.introducao.map((p, i) => <p key={i} className="text-muted">{p}</p>)}
        <blockquote className="border-l-2 border-line pl-4 italic">“{ANTES_DO_EXAME.citacao.texto}” <span className="not-italic text-muted text-sm">({ANTES_DO_EXAME.citacao.ref})</span></blockquote>
        <p>{ANTES_DO_EXAME.convite}</p>
        <div className="rounded-xl bg-surface-2 p-4">
          <div className="label mb-2">Oração antes do exame</div>
          <p className="font-serif text-[17px] leading-relaxed">{ANTES_DO_EXAME.oracao}</p>
        </div>
        <div>
          <div className="label mb-2">Para fazer uma boa confissão é preciso</div>
          <ol className="space-y-1.5">
            {ANTES_DO_EXAME.passos.map(([t, d], i) => (
              <li key={t} className="flex gap-3"><span className="text-faint tabular-nums w-4 shrink-0">{i + 1}.</span><span><b className="font-medium">{t}:</b> {d}</span></li>
            ))}
          </ol>
        </div>
      </div>
    </details>
  );
}

export function UltimaConfissao({ ultima, onMudar }: { ultima: string | null; onMudar: (d: string) => void }) {
  const [editando, setEditando] = useState(!ultima);
  const [d, setD] = useState(ultima ?? "");
  if (!editando && ultima) {
    return (
      <p className="mt-1 text-sm text-muted">
        Quando foi a minha última confissão? <span className="text-ink">{dataBr(ultima)}</span> ({tempoDesde(diasDesde(ultima))}).{" "}
        <button className="underline hover:text-ink" onClick={() => setEditando(true)}>corrigir</button>
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Quando foi a minha última confissão?</span>
      <input type="date" className="input py-1 w-auto" max={hojeIso()} value={d} onChange={(e) => setD(e.target.value)} />
      <button className="btn" disabled={!d} onClick={() => { onMudar(d); setEditando(false); }}>Salvar</button>
    </div>
  );
}

export function Contricao() {
  return (
    <section className="card p-5 space-y-4">
      <div>
        <h2 className="font-medium mb-2">Ato de Contrição</h2>
        <p className="font-serif text-[17px] leading-relaxed">{ATO_DE_CONTRICAO}</p>
      </div>
      <details className="group">
        <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink flex items-center gap-1">
          Quando não for possível se confessar: a contrição perfeita <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
          {CONTRICAO_PERFEITA.map((b, i) => (
            <div key={i} className="space-y-2">
              {b.titulo && <h3 className="font-medium">{b.titulo}</h3>}
              {b.paragrafos.map((p, j) => <p key={j}>{p}</p>)}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
