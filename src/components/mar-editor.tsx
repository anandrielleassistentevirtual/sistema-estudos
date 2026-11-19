"use client";
/**
 * MAR: "Temporadas e minutagem" de uma série — quantos episódios tem cada temporada, quanto dura cada um
 * (o padrão da série, o de uma temporada inteira ou o de um episódio) e onde você parou.
 * Salvar a minutagem é um update simples (não muda o passado, só as próximas marcações e o "faltam").
 * Mudar a posição vira um ajuste (sem tempo), que se desfaz como as outras ações.
 */
import { useMemo, useRef, useState } from "react";
import { Grid3x3, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  COR_MAR, deslocarMinutagem, duracao, durSeg, lerListaMinutos, lerMinutos, lerTemporadas, normalizarTitulo, ondeEsta, registrar,
  type RespostaMar, type Titulo,
} from "@/lib/mar";

export function MarEditor({ t, onFechar, onSalvo }: {
  t: Titulo; onFechar: () => void;
  /** o título salvo e, se a posição mudou, a resposta do ajuste */
  onSalvo: (novo: Titulo, ajuste: RespostaMar | null) => void;
}) {
  const [ts, setTs] = useState<number[]>(t.temporadas?.length ? [...t.temporadas] : [10]);
  const [minEp, setMinEp] = useState(String(t.min_ep ?? 25));
  const [mm, setMm] = useState<Record<string, number>>({ ...(t.minutagem ?? {}) });
  const inicio = ondeEsta(t);
  const [temp, setTemp] = useState(inicio.temp);
  const [ep, setEp] = useState(inicio.ep);
  const [parei, setParei] = useState(t.parcial_seg ? String(Math.round(t.parcial_seg / 60)) : "");
  const [rapido, setRapido] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const padrao = Math.max(1, Math.min(999, Number(minEp) || 25));
  const tempOk = Math.min(temp, ts.length);
  const epOk = Math.min(ep, ts[tempOk - 1] ?? 0);
  const vistos = ts.slice(0, tempOk - 1).reduce((a, b) => a + b, 0) + epOk;
  const total = ts.reduce((a, b) => a + b, 0);
  const rascunho = useMemo(() => ({ temporadas: ts, minutagem: mm, min_ep: padrao }), [ts, mm, padrao]);
  const durProx = vistos < total ? durSeg(rascunho, vistos + 1) : 0;
  const pareiN = parei.trim() ? Number(parei) : 0;
  const pareiOk = !parei.trim() || (Number.isInteger(pareiN) && pareiN >= 0 && pareiN * 60 < durProx);
  const somas = useMemo(() => {
    let tot = 0, vis = 0;
    for (let k = 1; k <= total; k++) { const d = durSeg(rascunho, k); tot += d; if (k <= vistos) vis += d; }
    vis += pareiOk && vistos < total ? pareiN * 60 : 0;
    return { tot, vis, falta: Math.max(0, tot - vis) };
  }, [rascunho, total, vistos, pareiN, pareiOk]);

  const padraoDaTemp = (i: number) => (mm[String(i + 1)] && mm[String(i + 1)] >= 1 && mm[String(i + 1)] <= 999 ? mm[String(i + 1)] : padrao);
  const excecoes = (i: number) => Object.keys(mm).filter((k) => k.startsWith(`${i + 1}.`)).length;
  function mudarMin(chave: string, valor: number | null, padraoAqui: number) {
    setMm((m) => {
      const n = { ...m };
      if (!valor || valor === padraoAqui) delete n[chave]; else n[chave] = valor;
      return n;
    });
  }
  function tirarTemporada(i: number) {
    setTs((l) => l.filter((_, j) => j !== i));
    setMm((m) => deslocarMinutagem(m, i + 1));
    if (grade === i) setGrade(null);
    else if (grade !== null && grade > i) setGrade(grade - 1);
    if (temp > i + 1) setTemp(temp - 1);
  }

  async function salvar() {
    if (!pareiOk) return setErro(`“Parei em” tem de ser menor que ${Math.round(durProx / 60)} min.`);
    setSalvando(true); setErro(null);
    // só as exceções válidas (1 a 999) e dentro das temporadas
    const limpo: Record<string, number> = {};
    for (const [k, v] of Object.entries(mm)) {
      const m = /^(\d+)(?:\.(\d+))?$/.exec(k);
      if (!m || !Number.isInteger(v) || v < 1 || v > 999) continue;
      const tp = Number(m[1]);
      if (tp < 1 || tp > ts.length || (m[2] && Number(m[2]) > ts[tp - 1])) continue;
      limpo[k] = v;
    }
    const campos = { temporadas: ts, min_ep: padrao, minutagem: limpo };
    const { data, error } = await supabase().from("mar_titulos").update(campos).eq("id", t.id).select().single();
    if (error) { setSalvando(false); return setErro(`Não salvou (${error.message}). Nada mudou.`); }
    const novo = normalizarTitulo({ ...t, ...campos, ...((data as Partial<Titulo> | null) ?? {}), id: t.id });
    let ajuste: RespostaMar | null = null;
    if (vistos !== (t.ep_vistos ?? 0) || pareiN * 60 !== (t.parcial_seg ?? 0)) {
      ajuste = await registrar(novo, "ajuste", { valor: vistos, parcialMin: pareiN });
      if (!ajuste.ok) { setSalvando(false); onSalvo(novo, null); return setErro(`A minutagem foi salva, mas a posição não: ${ajuste.msg}`); }
    }
    onSalvo(ajuste?.ok ? ajuste.titulo : novo, ajuste);
  }

  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/45" onClick={onFechar}>
      <div className="card w-full max-w-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium truncate">{t.titulo} <span className="text-muted font-normal">· temporadas e minutagem</span></h2>
          <button type="button" onClick={onFechar} className="btn btn-ghost p-1.5" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <input className="input flex-1" value={rapido} onChange={(e) => setRapido(e.target.value)} placeholder="rápido: 3x10 ou 10, 12, 8"
            onKeyDown={(e) => { if (e.key === "Enter" && lerTemporadas(rapido).length) { e.preventDefault(); setTs(lerTemporadas(rapido)); setRapido(""); } }} />
          <button type="button" className="btn" disabled={!lerTemporadas(rapido).length} onClick={() => { setTs(lerTemporadas(rapido)); setRapido(""); }}>Preencher</button>
        </div>

        <label className="flex items-center gap-2 text-sm" title="O padrão da série: cada episódio marcado soma esse tempo, a não ser que a temporada ou o episódio tenha outro">
          <span className="text-muted">Cada episódio dura</span>
          <input className="input py-1 px-2 w-16 text-right tabular-nums" inputMode="numeric" value={minEp} onChange={(e) => setMinEp(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          <span className="text-muted">min</span>
        </label>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
          {ts.map((n, i) => {
            const ex = excecoes(i);
            return (
              <li key={i} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 ${grade === i ? "bg-surface-2 ring-1 ring-line" : "bg-surface-2/60"}`}>
                <button type="button" className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-muted hover:text-ink hover:bg-sel w-14 shrink-0" title={`Minutagem de cada episódio da T${i + 1} (toque para abrir)`}
                  onClick={() => setGrade(grade === i ? null : i)}>T{i + 1}<Grid3x3 size={12} /></button>
                <input className="input py-0.5 px-1.5 w-12 text-right tabular-nums" inputMode="numeric" aria-label={`Episódios da T${i + 1}`} value={n}
                  onChange={(e) => setTs((l) => l.map((x, j) => (j === i ? Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 1)) : x)))} />
                <span className="text-xs text-muted">ep.</span>
                <input className="input py-0.5 px-1.5 w-12 text-right tabular-nums" inputMode="numeric" aria-label={`Minutos dos episódios da T${i + 1}`}
                  placeholder={String(padrao)} value={mm[String(i + 1)] ?? ""}
                  onChange={(e) => mudarMin(String(i + 1), Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || null, padrao)} />
                <span className="text-xs text-muted mr-1">min</span>
                {ex > 0 && <span className="text-[10.5px] tabular-nums" style={{ color: COR_MAR }} title={`${ex} episódios com minutagem própria`}>+{ex}</span>}
                {ts.length > 1 && <button type="button" className="ml-auto text-faint hover:text-critical p-1" title="Tirar a temporada (as seguintes sobem)" onClick={() => tirarTemporada(i)}><X size={13} /></button>}
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn text-xs" onClick={() => setTs((l) => [...l, l[l.length - 1] ?? 10])}><Plus size={13} /> Temporada</button>

        {grade !== null && grade < ts.length && (
          <Grade key={grade} temp={grade + 1} eps={ts[grade]} padrao={padraoDaTemp(grade)} mm={mm}
            onMudar={(e, v) => mudarMin(`${grade + 1}.${e}`, v, padraoDaTemp(grade))}
            onAplicar={(v) => setMm((m) => {
              const n: Record<string, number> = {};
              for (const [k, x] of Object.entries(m)) if (!k.startsWith(`${grade + 1}.`)) n[k] = x;
              if (v !== padrao) n[String(grade + 1)] = v; else delete n[String(grade + 1)];
              return n;
            })}
            onColar={(lista) => setMm((m) => {
              const n = { ...m };
              const pd = padraoDaTemp(grade);
              lista.forEach((v, j) => { const k = `${grade + 1}.${j + 1}`; if (v === pd) delete n[k]; else n[k] = v; });
              return n;
            })}
            onFechar={() => setGrade(null)} />
        )}

        <div className="rounded-lg border border-line p-3 text-sm space-y-2">
          <div className="text-xs text-muted">Onde você parou (o último episódio que viu)</div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto py-1" value={tempOk} onChange={(e) => { setTemp(Number(e.target.value)); setEp(0); }}>
              {ts.map((_, i) => <option key={i} value={i + 1}>Temporada {i + 1}</option>)}
            </select>
            <select className="input w-auto py-1" value={epOk} onChange={(e) => setEp(Number(e.target.value))}>
              <option value={0}>{tempOk === 1 ? "não comecei" : "nenhum desta"}</option>
              {Array.from({ length: ts[tempOk - 1] ?? 0 }, (_, i) => <option key={i} value={i + 1}>Episódio {i + 1}</option>)}
            </select>
            {vistos < total && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                parei em
                <input className={`input py-1 px-2 w-14 text-right tabular-nums ${pareiOk ? "" : "border-[var(--critical)]"}`} inputMode="numeric" value={parei}
                  onChange={(e) => setParei(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="0" />
                min do próximo
              </label>
            )}
          </div>
          <div className="text-xs text-muted tabular-nums">
            {total} ep. · {duracao(somas.tot)} · visto {duracao(somas.vis)} · faltam {duracao(somas.falta)}
          </div>
        </div>

        <p className="text-xs text-faint">Mudar a posição não soma tempo. Episódios já marcados mantêm o tempo com que entraram.</p>
        {erro && <p className="text-sm text-critical">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={salvando || !ts.length} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

/** A grade de uma temporada: um chip por episódio ("E1 22"); Enter salva e abre o próximo. */
function Grade({ temp, eps, padrao, mm, onMudar, onAplicar, onColar, onFechar }: {
  temp: number; eps: number; padrao: number; mm: Record<string, number>;
  onMudar: (ep: number, v: number | null) => void; onAplicar: (v: number) => void; onColar: (lista: number[]) => void; onFechar: () => void;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [valor, setValor] = useState("");
  const [aplicar, setAplicar] = useState("");
  const [colar, setColar] = useState("");
  const [aviso, setAviso] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const abrir = (e: number) => { setEditando(e); setValor(String(mm[`${temp}.${e}`] ?? padrao)); setTimeout(() => campo.current?.select(), 0); };
  const gravar = () => { if (editando === null) return; onMudar(editando, lerMinutos(valor)); };
  const vAplicar = lerMinutos(aplicar);
  return (
    <div className="rounded-lg border border-line p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Minutagem da T{temp}</span>
        <button type="button" className="btn btn-ghost p-1" aria-label="Fechar a grade" onClick={onFechar}><X size={15} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-0.5">
        {Array.from({ length: eps }, (_, i) => {
          const e = i + 1;
          const ex = mm[`${temp}.${e}`];
          if (editando === e) {
            return (
              <input key={e} ref={campo} autoFocus className="input w-[4.5rem] py-0.5 px-1.5 text-xs text-right tabular-nums" inputMode="numeric" value={valor}
                aria-label={`Minutos do E${e}`} onChange={(x) => setValor(x.target.value)} onBlur={() => { gravar(); setEditando(null); }}
                onKeyDown={(x) => {
                  if (x.key === "Enter") { x.preventDefault(); gravar(); if (e < eps) abrir(e + 1); else setEditando(null); }
                  if (x.key === "Escape") { x.preventDefault(); setEditando(null); }
                }} />
            );
          }
          return (
            <button key={e} type="button" onClick={() => abrir(e)} title={ex ? "Minutagem própria (apague ou ponha o padrão para voltar)" : "O padrão"}
              className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums border ${ex ? "font-medium" : "border-transparent bg-surface-2 text-muted"}`}
              style={ex ? { borderColor: COR_MAR } : undefined}>
              E{e} <span className={ex ? "" : "text-faint"}>{ex ?? padrao}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted">Aplicar</span>
        <input className="input py-1 px-2 w-14 text-right tabular-nums" inputMode="numeric" value={aplicar} onChange={(e) => setAplicar(e.target.value)} placeholder={String(padrao)}
          onKeyDown={(e) => { if (e.key === "Enter" && vAplicar) { e.preventDefault(); onAplicar(vAplicar); setAplicar(""); } }} />
        <span className="text-muted mr-auto">min a toda a T{temp}</span>
        <button type="button" className="btn py-1 text-xs" disabled={!vAplicar} onClick={() => { if (vAplicar) { onAplicar(vAplicar); setAplicar(""); } }}>Aplicar</button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <input className="input py-1 px-2 flex-1 text-xs" value={colar} onChange={(e) => setColar(e.target.value)} placeholder={`Colar a lista da T${temp}: 22 22 23 44 …`} />
          <button type="button" className="btn py-1 text-xs" disabled={!colar.trim()} onClick={() => {
            const r = lerListaMinutos(colar, eps, padrao);
            onColar(r.minutos); setAviso(r.aviso); setColar("");
          }}>Colar</button>
        </div>
        <p className="text-[11px] text-faint">{aviso || "Aceita 22, 22m, 22 min ou 22:30 (vira 23)."}</p>
      </div>
    </div>
  );
}
