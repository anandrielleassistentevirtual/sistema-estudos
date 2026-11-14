"use client";
/**
 * As tarefas ligadas a uma aula, dentro do leitor da aula:
 * - um aviso ao abrir a aula, se há tarefas por fazer "antes desta aula" (não bloqueia: dá para continuar mesmo assim);
 * - um painel com as tarefas que vieram desta aula e as que ela pede antes, com um campo para acrescentar.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, CornerDownRight, ListChecks, Play, Plus, X } from "lucide-react";
import { useTimerEstado } from "@/components/timer-context";
import { supabase } from "@/lib/supabase/client";
import {
  TIPOS, aulasDaPasta, concluirTarefa, criarTarefaNoFim, iniciarTarefa, mudarTarefa, proximaAula, tarefasDaAula, textoDoPrazo,
  type AulaLite, type Tarefa, type TipoTarefa,
} from "@/lib/tarefas";

type Livro = { id: string; title: string; format: string };

export function TarefasDaAula({ aula, aberto, onFechar, onPendentes, avisar }: {
  aula: { id: string; title: string; pasta_id: string | null; situacao?: string };
  aberto: boolean;
  onFechar: () => void;
  /** quantas tarefas por fazer estão ligadas a esta aula (para o selo no botão) */
  onPendentes: (n: number) => void;
  avisar: (texto: string) => void;
}) {
  const router = useRouter();
  const timer = useTimerEstado();
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [aulas, setAulas] = useState<AulaLite[]>([]);
  const [livros, setLivros] = useState<Map<string, Livro>>(new Map());
  const [dispensado, setDispensado] = useState(true);

  async function load() {
    const [t, a] = await Promise.all([tarefasDaAula(aula.id), aulasDaPasta(aula.pasta_id)]);
    // as que "voltam depois" (revisões agendadas) não entram aqui
    const lista = t.filter((x) => !x.aparece_em);
    setTarefas(lista);
    setAulas(a);
    const ids = [...new Set(lista.map((x) => x.book_id).filter(Boolean) as string[])];
    if (ids.length) {
      const { data } = await supabase().from("books").select("id,title,format").in("id", ids);
      setLivros(new Map(((data as Livro[] | null) ?? []).map((b) => [b.id, b])));
    }
  }
  useEffect(() => {
    void load();
    try { setDispensado(sessionStorage.getItem(`tarefas-antes:${aula.id}`) === "1"); } catch { setDispensado(false); }
  }, [aula.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const antes = useMemo(() => (tarefas ?? []).filter((t) => t.antes_de === aula.id), [tarefas, aula.id]);
  const daqui = useMemo(() => (tarefas ?? []).filter((t) => t.aula_id === aula.id && t.antes_de !== aula.id), [tarefas, aula.id]);
  const antesPendentes = antes.filter((t) => !t.feita_em);
  const proxima = useMemo(() => proximaAula(aula.id, aulas), [aula.id, aulas]);
  const nomeDe = useMemo(() => new Map(aulas.map((a) => [a.id, a.title])), [aulas]);
  const pendentes = (tarefas ?? []).filter((t) => !t.feita_em).length;
  useEffect(() => { onPendentes(pendentes); }, [pendentes]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostrarAviso = !dispensado && antesPendentes.length > 0 && aula.situacao !== "concluida";
  function dispensar() {
    setDispensado(true);
    try { sessionStorage.setItem(`tarefas-antes:${aula.id}`, "1"); } catch {}
  }

  function fazerAgora(t: Tarefa) {
    const ir = iniciarTarefa(t, timer, t.book_id ? livros.get(t.book_id) : null);
    if (ir.rota) return router.push(ir.rota);
    if (ir.link) window.open(ir.link, "_blank", "noopener");
    dispensar();
    avisar("Timer ligado nesta tarefa.");
  }
  async function feita(t: Tarefa) {
    const agora = new Date().toISOString();
    setTarefas((l) => l?.map((x) => (x.id === t.id ? { ...x, feita_em: agora } : x)) ?? null);
    await concluirTarefa(t, null);
  }
  async function desfazer(t: Tarefa) {
    setTarefas((l) => l?.map((x) => (x.id === t.id ? { ...x, feita_em: null } : x)) ?? null);
    await mudarTarefa(t.id, { feita_em: null });
  }

  const item = (t: Tarefa, compacto = false) => {
    const prazo = textoDoPrazo(t.prazo);
    const origem = t.aula_id && t.aula_id !== aula.id ? nomeDe.get(t.aula_id) : null;
    return (
      <li key={t.id} className="flex items-start gap-2 py-2.5">
        <button className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border grid place-items-center ${t.feita_em ? "bg-good/15 border-good/40 text-good" : "border-line hover:border-ink"}`}
          title={t.feita_em ? "Desfazer" : "Feita"} onClick={() => void (t.feita_em ? desfazer(t) : feita(t))}>
          {t.feita_em && <Check size={13} />}
        </button>
        <div className="min-w-0 flex-1 text-sm">
          <div className={t.feita_em ? "line-through text-muted decoration-faint" : ""}>{t.texto}</div>
          {!compacto && t.descricao?.trim() && !t.feita_em && <p className="text-xs text-muted whitespace-pre-wrap mt-0.5">{t.descricao.trim()}</p>}
          {!compacto && (
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
              {origem && <span>da {origem}</span>}
              {t.antes_de && t.antes_de !== aula.id && <span className="inline-flex items-center gap-1"><CornerDownRight size={11} /> antes de {nomeDe.get(t.antes_de) ?? "outra aula"}</span>}
              {t.book_id && livros.get(t.book_id) && <span>{livros.get(t.book_id)!.title}</span>}
              {prazo && <span style={{ color: prazo.urgente ? "#c98a1a" : undefined }}>{prazo.texto}</span>}
            </div>
          )}
        </div>
        {!t.feita_em && (
          <button className="btn btn-ghost px-2 py-1 shrink-0" title="Fazer agora: liga o Timer nesta tarefa" onClick={() => fazerAgora(t)}><Play size={14} /></button>
        )}
      </li>
    );
  };

  return (
    <>
      {mostrarAviso && (
        <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/45">
          <div className="card w-full max-w-md p-5 space-y-3 shadow-2xl text-ink max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3">
              <ListChecks size={20} className="text-icon mt-0.5 shrink-0" />
              <div>
                <h2 className="font-medium">Antes desta aula</h2>
                <p className="text-sm text-muted mt-0.5">
                  {antesPendentes.length === 1 ? "Ficou uma tarefa para fazer antes de estudar esta aula." : `Ficaram ${antesPendentes.length} tarefas para fazer antes de estudar esta aula.`}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-line">{antesPendentes.map((t) => item(t))}</ul>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Link href="/estudos/tarefas" className="btn btn-ghost text-sm">Ver todas as tarefas</Link>
              <button className="btn btn-primary text-sm" onClick={dispensar}>Continuar mesmo assim</button>
            </div>
          </div>
        </div>
      )}

      {aberto && (
        <aside className="fixed inset-y-0 right-0 z-40 w-[min(420px,92vw)] bg-surface text-ink border-l border-line flex flex-col shadow-2xl pt-safe">
          <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
            <span className="font-medium text-sm flex items-center gap-2"><ListChecks size={15} className="text-icon" /> Tarefas desta aula</span>
            <button onClick={onFechar} className="text-muted hover:text-ink"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
            <NovaTarefaDaAula aula={aula} proxima={proxima} onCriada={(t) => { setTarefas((l) => [...(l ?? []), t]); avisar("Tarefa acrescentada à lista."); }} />
            {antes.length > 0 && (
              <section>
                <h3 className="label">Para fazer antes desta aula</h3>
                <ul className="divide-y divide-line">{antes.map((t) => item(t))}</ul>
              </section>
            )}
            <section>
              <h3 className="label">Que vieram desta aula</h3>
              {daqui.length ? <ul className="divide-y divide-line">{daqui.map((t) => item(t))}</ul>
                : <p className="text-sm text-muted mt-1">{tarefas ? "Nenhuma ainda. Escreva acima o que o professor pediu." : "…"}</p>}
            </section>
            <Link href="/estudos/tarefas" className="inline-block text-xs text-muted hover:text-ink">Abrir a lista completa de tarefas →</Link>
          </div>
        </aside>
      )}
    </>
  );
}

function NovaTarefaDaAula({ aula, proxima, onCriada }: {
  aula: { id: string; pasta_id: string | null }; proxima: AulaLite | null; onCriada: (t: Tarefa) => void;
}) {
  const [texto, setTexto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [comDescricao, setComDescricao] = useState(false);
  const [tipo, setTipo] = useState<TipoTarefa>("ler");
  const [antes, setAntes] = useState(true);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || indo) return;
    setIndo(true); setErro(null);
    try {
      const t = await criarTarefaNoFim({
        texto: texto.trim(), descricao: descricao.trim(), tipo, pasta_id: aula.pasta_id, aula_id: aula.id, antes_de: antes && proxima ? proxima.id : null,
      });
      onCriada(t);
      setTexto("");
      setDescricao("");
      setComDescricao(false);
    } catch (x) {
      setErro(`Não consegui salvar: ${(x as Error).message}`);
    } finally { setIndo(false); }
  }

  return (
    <form onSubmit={salvar} className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTipo(t.id)}
            className={`text-xs rounded-full px-2 py-0.5 border ${tipo === t.id ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}>{t.nome}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1 min-w-0" value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={`ex.: ${TIPOS.find((t) => t.id === tipo)?.exemplo ?? ""}`} />
        <button className="btn btn-primary shrink-0" disabled={!texto.trim() || indo} title="Acrescentar"><Plus size={15} /></button>
      </div>
      {proxima ? (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="mt-1" checked={antes} onChange={(e) => setAntes(e.target.checked)} />
          <span>Fazer antes da próxima aula
            <span className="block text-xs text-muted">Ao abrir “{proxima.title}”, aparece um lembrete (sem bloquear a leitura).</span></span>
        </label>
      ) : (
        <p className="text-xs text-muted">Esta é a última aula da pasta.</p>
      )}
      {comDescricao ? (
        <textarea className="input min-h-[64px] resize-y text-sm leading-relaxed" value={descricao} onChange={(e) => setDescricao(e.target.value)}
          placeholder="Detalhes, passos, o que o professor pediu…" autoFocus />
      ) : (
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setComDescricao(true)}>+ descrição</button>
      )}
      {erro && <p className="text-xs text-critical">{erro}</p>}
    </form>
  );
}
