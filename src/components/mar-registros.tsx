"use client";
/**
 * MAR: a folha "Registros" — os últimos 30 dias com MAR, dia a dia.
 * O total de cada dia vem das sessões (a fonte única do tempo); as linhas dizem o que foi cada pedaço:
 * episódios e minutos marcados (do mar_log), o Timer ligado e os ajustes (em cinza, sem tempo).
 * Desfazer só na última ação de cada título (o banco desfaz da mais nova para a mais antiga).
 */
import { useMemo } from "react";
import { Timer as Relogio, X } from "lucide-react";
import { addDays, dayKey, parseDay } from "@/lib/dates";
import { COR_MAR, duracao, segundosDaAcao, ultimaAcao, type Registro, type SessaoIdioma, type Titulo } from "@/lib/mar";

interface Linha { chave: string; quando: string; texto: string; seg: number; cinza?: boolean; timer?: boolean; doTimer?: boolean; registro?: Registro; titulo?: Titulo }

const hora = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
};

export function MarRegistros({ lista, log, sessoesMar, metaMin, ocupados, onDesfazer, onConfigurar, onFechar }: {
  lista: Titulo[]; log: Registro[]; sessoesMar: SessaoIdioma[]; metaMin: number; ocupados: Set<string>;
  onDesfazer: (t: Titulo) => void; onConfigurar?: () => void; onFechar: () => void;
}) {
  const hoje = dayKey();
  const ontem = dayKey(addDays(new Date(), -1));
  const desde = dayKey(addDays(new Date(), -29));
  const meta = Math.max(0, metaMin) * 60;

  const dias = useMemo(() => {
    const porId = new Map(lista.map((t) => [t.id, t]));
    const ids = new Set(lista.map((t) => t.id));
    const meuLog = log.filter((l) => ids.has(l.titulo_id) && l.dia >= desde);
    const porSessao = new Map(meuLog.filter((l) => l.sessao_id).map((l) => [l.sessao_id!, l]));
    const ultimas = new Map(lista.map((t) => [t.id, ultimaAcao(log, t.id)?.id ?? null]));
    const m = new Map<string, { total: number; linhas: Linha[] }>();
    const dia = (d: string) => { let x = m.get(d); if (!x) { x = { total: 0, linhas: [] }; m.set(d, x); } return x; };
    const nomeDe = (id: string | null | undefined, label: string | null) =>
      (id && porId.get(id)?.titulo) || (label ?? "").replace(/^MAR\s*·\s*/, "").replace(/\s+T\d+E\d+.*$/, "") || "MAR";

    for (const s of sessoesMar) {
      if (s.day < desde || !s.seconds) continue;
      const d = dia(s.day);
      d.total += s.seconds;
      const l = porSessao.get(s.id);
      if (l?.tipo === "timer") {
        d.linhas.push({ chave: s.id, quando: s.started_at ?? l.created_at, texto: `Timer · ${nomeDe(l.titulo_id, s.label)}`, seg: s.seconds, timer: true });
      } else if (l) {
        const t = porId.get(l.titulo_id);
        const doTimer = (l.credito ?? []).length > 0;
        d.linhas.push({
          chave: l.id, quando: l.created_at, texto: `${t?.titulo ?? nomeDe(l.titulo_id, s.label)}${l.ref && !l.ref.startsWith("+") ? ` ${l.ref}` : ""}`,
          seg: segundosDaAcao(l), doTimer, registro: l, titulo: t,
        });
      } else {
        // sessão sem linha no livro-caixa (antiga, ou de antes da migração)
        d.linhas.push({ chave: s.id, quando: s.started_at ?? "", texto: (s.label ?? "MAR").replace(/^MAR\s*·\s*/, ""), seg: s.seconds });
      }
    }
    // ações sem sessão: coberta inteira pelo Timer, ou ajustes (sem tempo)
    for (const l of meuLog) {
      if (l.tipo === "timer" || (l.sessao_id && sessoesMar.some((s) => s.id === l.sessao_id))) continue;
      const t = porId.get(l.titulo_id);
      const nome = t?.titulo ?? "MAR";
      const d = dia(l.dia);
      if (l.tipo === "ajuste") {
        const sit = (l as Registro & { depois?: { situacao?: string } }).depois?.situacao;
        const texto = l.ref === "terminei" || sit === "visto" ? `${nome} → Vistos` : sit === "quero" ? `${nome} → Quero ver` : `${nome} · ${l.ref || "posição corrigida"}`;
        d.linhas.push({ chave: l.id, quando: l.created_at, texto, seg: 0, cinza: true, registro: l, titulo: t });
      } else {
        d.linhas.push({ chave: l.id, quando: l.created_at, texto: `${nome}${l.ref && !l.ref.startsWith("+") ? ` ${l.ref}` : ""}`, seg: segundosDaAcao(l), doTimer: segundosDaAcao(l) > 0, registro: l, titulo: t });
      }
    }
    for (const x of m.values()) x.linhas.sort((a, b) => b.quando.localeCompare(a.quando));
    return { lista: [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])), ultimas };
  }, [lista, log, sessoesMar, desde]);

  const nomeDia = (d: string) => d === hoje ? "Hoje" : d === ontem ? "Ontem"
    : parseDay(d).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");

  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/45" onClick={onFechar}>
      <div className="card w-full max-w-lg p-5 shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Registros do MAR">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-medium">Registros do MAR <span className="text-muted font-normal text-sm">· últimos 30 dias</span></h2>
          <button type="button" onClick={onFechar} className="btn btn-ghost p-1.5" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-4">
          {dias.lista.length === 0 && <p className="text-sm text-muted">Nada nos últimos 30 dias. Marque um episódio ou use o Timer.</p>}
          {dias.lista.map(([d, x]) => (
            <section key={d}>
              <div className="flex items-baseline justify-between gap-2 border-b border-line pb-1 mb-1">
                <span className="text-sm font-medium first-letter:uppercase">{nomeDia(d)}</span>
                <span className="text-sm tabular-nums">
                  {duracao(x.total)}
                  {meta > 0 && <span className="text-muted"> de {duracao(meta)}</span>}
                  {meta > 0 && x.total >= meta && <span style={{ color: "var(--good)" }}> ✓</span>}
                </span>
              </div>
              <ul className="text-[13px]">
                {x.linhas.map((l) => {
                  const ultima = !!l.registro && !!l.titulo && dias.ultimas.get(l.titulo.id) === l.registro.id;
                  return (
                    <li key={l.chave} className={`flex items-center gap-2 py-1.5 ${l.cinza ? "text-faint" : ""}`}>
                      <span className="tabular-nums text-muted w-10 shrink-0">{hora(l.quando)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {l.timer && <Relogio size={12} className="inline -mt-0.5 mr-1" style={{ color: COR_MAR }} />}
                        {l.texto}
                      </span>
                      {l.seg > 0 && <span className="tabular-nums shrink-0">{duracao(l.seg)}{l.doTimer && <span className="text-muted"> (do Timer)</span>}</span>}
                      {l.registro && l.titulo && (ultima ? (
                        <button type="button" className="btn py-1 px-2 text-xs shrink-0" disabled={ocupados.has(l.titulo.id)} onClick={() => onDesfazer(l.titulo!)}>Desfazer</button>
                      ) : (
                        <span className="w-[4.6rem] shrink-0 text-right text-[10.5px] text-faint leading-tight cursor-help" title="Desfaça antes os mais recentes deste título">—</span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <div className="border-t border-line pt-3 mt-3 text-xs text-muted flex items-center justify-between gap-2">
          <span>Meta: {metaMin > 0 ? `${duracao(meta)} por dia` : "sem meta"}{onConfigurar && <> · <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={onConfigurar}>mudar</button></>}</span>
          <span className="text-faint">Desfazer: só a última ação de cada título.</span>
        </div>
      </div>
    </div>
  );
}
