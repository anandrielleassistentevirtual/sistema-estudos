"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, Check, ChevronDown, CornerDownRight, ExternalLink, Eye, Feather, GraduationCap, Highlighter, Info, ListChecks, Pencil, Play, Plus, RefreshCw, Repeat, Search, Trash2, X,
} from "lucide-react";
import { Page } from "@/components/page";
import { EstudosTabs } from "@/components/estudos-tabs";
import { RowMenu } from "@/components/row-menu";
import { useTimerEstado } from "@/components/timer-context";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { arvoreDePastas, caminhoDaPasta, porOrdem, subarvore, type PastaEstudo } from "@/lib/estudos";
import { ppmDosLivros } from "@/lib/books";
import { fmtDuration, nf } from "@/lib/dates";
import { progressoDoLivro, type Book } from "@/lib/types";
import {
  POR_PAGINA, TIPOS, carregarAulasLite, carregarTarefas, concluirTarefa, criarTarefa, iniciarTarefa, mudarTarefa, proximaAula, proximaPosicao,
  tempoPorTarefa, textoDoPrazo, type AulaLite, type Tarefa, type TipoTarefa,
} from "@/lib/tarefas";

type Livro = Pick<Book, "id" | "title" | "author" | "status" | "progress" | "word_count" | "format">;
const ICONE: Record<TipoTarefa, typeof BookOpen> = { ler: BookOpen, assistir: Eye, escrever: Feather, revisar: RefreshCw, praticar: Repeat, outro: ListChecks };
const TODOS = "todos";
/** "Aula 05 — O problema do conhecimento" → curto o bastante para caber numa etiqueta. */
const curto = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function Tarefas() {
  const router = useRouter();
  const timer = useTimerEstado();
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [pastas, setPastas] = useState<PastaEstudo[]>([]);
  const [livros, setLivros] = useState<Livro[]>([]);
  const [aulas, setAulas] = useState<AulaLite[]>([]);
  const [tempo, setTempo] = useState<Map<string, number>>(new Map());
  const [ppm, setPpm] = useState(220);
  const [curso, setCurso] = useState<string>(TODOS);
  const [vista, setVista] = useState<"lista" | "prazo">("lista");
  const [pagina, setPagina] = useState(0);
  const [concluindo, setConcluindo] = useState<Tarefa | null>(null);
  const [editando, setEditando] = useState<Tarefa | null>(null);
  const [guia, setGuia] = useState(false);
  const [abertas, setAbertas] = useState<Set<string>>(new Set()); // descrições mostradas por inteiro

  async function load() {
    const sb = supabase();
    const [t, p, b, tm, r, au] = await Promise.all([
      carregarTarefas(),
      sb.from("estudo_pastas").select("id,parent_id,nome,posicao"),
      todas<Livro>((de, ate) => sb.from("books").select("id,title,author,status,progress,word_count,format").order("title").order("id").range(de, ate)),
      tempoPorTarefa(),
      ppmDosLivros(),
      carregarAulasLite().catch(() => [] as AulaLite[]),
    ]);
    setTarefas(t);
    setPastas((p.data as PastaEstudo[]) ?? []);
    setLivros(b);
    setTempo(tm);
    if (r) setPpm(r);
    setAulas(au);
  }
  useEffect(() => {
    void load();
    try {
      setPagina(Number(localStorage.getItem("tarefas-pagina")) || 0);
      const v = localStorage.getItem("tarefas-vista"); if (v === "lista" || v === "prazo") setVista(v);
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("tarefas-pagina", String(pagina)); localStorage.setItem("tarefas-vista", vista); } catch {} }, [pagina, vista]);

  const porId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);
  const { ordem, filhos } = useMemo(() => arvoreDePastas(pastas), [pastas]);
  const aulaDe = useMemo(() => new Map(aulas.map((a) => [a.id, a])), [aulas]);
  const livroDe = useMemo(() => new Map(livros.map((b) => [b.id, b])), [livros]);
  const nomeCurto = (id: string | null) => (id ? porId.get(id)?.nome ?? "" : "");

  // a lista na ordem de entrada (o que foi "reescrito" está no fim)
  const ativas = (tarefas ?? []).filter((t) => !t.feita_em && !t.aparece_em).sort((a, b) => a.posicao - b.posicao);
  const cursosComTarefa = [...new Set(ativas.map((t) => t.pasta_id).filter(Boolean) as string[])];
  const visiveis = ativas.filter((t) => curso === TODOS || t.pasta_id === curso);
  const paginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const daPagina = visiveis.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);
  const comPrazo = [...visiveis].filter((t) => t.prazo).sort((a, b) => (a.prazo ?? "").localeCompare(b.prazo ?? ""));
  const voltamDepois = (tarefas ?? []).filter((t) => !t.feita_em && t.aparece_em).sort((a, b) => (a.aparece_em ?? "").localeCompare(b.aparece_em ?? ""));
  const feitas = (tarefas ?? []).filter((t) => t.feita_em).sort((a, b) => (b.feita_em ?? "").localeCompare(a.feita_em ?? ""));
  const urgentes = ativas.filter((t) => textoDoPrazo(t.prazo)?.urgente).length;

  const trocar = (t: Tarefa, campos: Partial<Tarefa>) => {
    setTarefas((l) => l?.map((x) => (x.id === t.id ? { ...x, ...campos } : x)) ?? null);
    void mudarTarefa(t.id, campos);
  };
  /** Não terminou: reescreve no fim da lista (como no caderno). */
  const fizUmaParte = (t: Tarefa) => trocar(t, { posicao: proximaPosicao(tarefas ?? []), destacada: false });

  function fazerAgora(t: Tarefa) {
    const ir = iniciarTarefa(t, timer, t.book_id ? livroDe.get(t.book_id) : null);
    if (ir.rota) router.push(ir.rota);
    else if (ir.link) window.open(ir.link, "_blank", "noopener");
  }

  function linha(t: Tarefa) {
    const Icone = ICONE[t.tipo] ?? ListChecks;
    const b = t.book_id ? livroDe.get(t.book_id) : undefined;
    const prazo = textoDoPrazo(t.prazo);
    const secs = tempo.get(t.id) ?? 0;
    const faltam = b?.word_count && b.status === "lendo" ? b.word_count * (1 - progressoDoLivro(b)) : 0;
    return (
      <li key={t.id} className="flex items-start gap-3 px-4 py-3">
        <Icone size={16} className="text-icon mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="leading-snug">
            <span className={t.destacada ? "rounded px-1 -mx-1" : ""} style={t.destacada ? { background: "color-mix(in srgb, #e9c46a 35%, transparent)" } : undefined}>{t.texto}</span>
          </div>
          {t.descricao?.trim() && (
            <button type="button" className={`w-full text-left text-sm text-muted whitespace-pre-wrap mt-1 hover:text-ink ${abertas.has(t.id) ? "block" : "line-clamp-2"}`}
              title={abertas.has(t.id) ? "Recolher a descrição" : "Ver a descrição inteira"}
              onClick={() => setAbertas((a) => { const n = new Set(a); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}>
              {t.descricao.trim()}
            </button>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {t.pasta_id && <span className="rounded-md bg-surface-2 px-1.5 py-0.5">{nomeCurto(t.pasta_id)}</span>}
            {t.aula_id && aulaDe.get(t.aula_id) && (
              <Link href={`/estudos/${t.aula_id}`} className="inline-flex items-center gap-1 hover:text-ink hover:underline underline-offset-2" title="De qual aula veio — abrir a aula">
                <GraduationCap size={12} /> {curto(aulaDe.get(t.aula_id)!.title)}
              </Link>
            )}
            {t.antes_de && aulaDe.get(t.antes_de) && (
              <Link href={`/estudos/${t.antes_de}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:underline underline-offset-2"
                style={{ background: "color-mix(in srgb, #c98a1a 14%, transparent)", color: "#a8741a" }} title="Fazer antes de abrir esta aula">
                <CornerDownRight size={12} /> antes de {curto(aulaDe.get(t.antes_de)!.title, 40)}
              </Link>
            )}
            {b && (
              <span>
                {b.title}
                {b.status === "lendo" ? ` · ${Math.round(progressoDoLivro(b) * 100)}%${faltam ? ` · faltam ≈ ${fmtDuration((faltam / ppm) * 60)}` : ""}`
                  : b.status === "lido" ? " · ✓ lido" : b.status === "consulta" ? " · consulta" : b.word_count ? ` · ${nf.format(b.word_count)} palavras · ≈ ${fmtDuration((b.word_count / ppm) * 60)}` : ""}
              </span>
            )}
            {t.link && <a href={t.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-ink underline-offset-2 hover:underline"><ExternalLink size={11} /> link</a>}
            {prazo && (
              <span className="rounded-md px-1.5 py-0.5 font-medium"
                style={{ color: prazo.atrasada ? "var(--bad, #d33)" : prazo.urgente ? "#c98a1a" : undefined, background: prazo.urgente ? "color-mix(in srgb, currentColor 12%, transparent)" : "var(--surface-2)" }}>
                {prazo.texto}
              </span>
            )}
            {secs >= 60 && <span title="Tempo de foco dedicado no Timer">⏱ {fmtDuration(secs)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button className="btn btn-ghost px-2 py-1" title="Fazer agora: liga o Timer nesta tarefa" onClick={() => fazerAgora(t)}><Play size={15} /></button>
          <button className="btn btn-ghost px-2 py-1" title="Feita: riscar" onClick={() => setConcluindo(t)}><Check size={16} /></button>
          <button className="btn btn-ghost px-2 py-1 hidden sm:inline-flex" title="Fiz uma parte: reescreve no fim da lista" onClick={() => fizUmaParte(t)}><RefreshCw size={14} /></button>
          <RowMenu items={[
            { label: "Fiz uma parte (vai para o fim)", icon: RefreshCw, onClick: () => fizUmaParte(t) },
            { label: t.destacada ? "Tirar o marca-texto" : "Marca-texto (para não esquecer)", icon: Highlighter, onClick: () => trocar(t, { destacada: !t.destacada }) },
            { label: "Editar", icon: Pencil, onClick: () => setEditando(t) },
            { label: "Apagar", icon: Trash2, danger: true, separar: true, onClick: async () => {
              if (!confirm(`Apagar a tarefa “${t.texto}”?`)) return;
              setTarefas((l) => l?.filter((x) => x.id !== t.id) ?? null);
              await supabase().from("estudo_tarefas").delete().eq("id", t.id);
            } },
          ]} />
        </div>
      </li>
    );
  }

  return (
    <Page wide tabs={<EstudosTabs />} title="Tarefas"
      titleExtra={<button className="text-faint hover:text-ink" title="Como usar as Tarefas" aria-label="Como usar as Tarefas" onClick={() => setGuia(true)}><Info size={18} /></button>}
      subtitle={tarefas ? `${ativas.length} ${ativas.length === 1 ? "tarefa na lista" : "tarefas na lista"}${urgentes ? ` · ${urgentes} com prazo perto` : ""}` : "…"}>
      <div className="max-w-3xl space-y-5">
        <NovaTarefa ordem={ordem} filhos={filhos} porId={porId} livros={livros} aulas={aulas} cursoInicial={curso === TODOS ? null : curso}
          onCriar={async (dados) => { const t = await criarTarefa(dados, tarefas ?? []); setTarefas((l) => [...(l ?? []), t]); }} />

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
            {([["lista", "Lista"], ["prazo", "Por prazo"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setVista(k)} className={`px-3 py-1 rounded-md ${vista === k ? "bg-seg shadow-sm" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          {cursosComTarefa.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[TODOS, ...cursosComTarefa].map((id) => (
                <button key={id} onClick={() => { setCurso(id); setPagina(0); }}
                  className={`text-xs rounded-full px-2.5 py-1 border ${curso === id ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}>
                  {id === TODOS ? "Todos os cursos" : nomeCurto(id)}
                </button>
              ))}
            </div>
          )}
        </div>

        {tarefas && !visiveis.length && <p className="text-sm text-muted">Nenhuma tarefa {curso === TODOS ? "na lista" : "neste curso"}. Escreva acima o que precisa fazer.</p>}

        {vista === "lista" && daPagina.length > 0 && (
          <section>
            {paginas > 1 && (
              <div className="flex items-center justify-between mb-2 px-1 text-xs text-muted">
                <span>Página {pag + 1} de {paginas}</span>
                <span className="flex gap-1">
                  {Array.from({ length: paginas }, (_, i) => (
                    <button key={i} onClick={() => setPagina(i)} className={`w-6 h-6 rounded-md tabular-nums ${i === pag ? "bg-sel text-ink" : "hover:text-ink"}`}>{i + 1}</button>
                  ))}
                </span>
              </div>
            )}
            <ul className="card divide-y divide-line">{daPagina.map(linha)}</ul>
            {paginas > 1 && (
              <div className="mt-2 flex justify-end">
                <button className="btn btn-ghost text-sm" onClick={() => setPagina((pag + 1) % paginas)}>
                  Nada mais me chama nesta página → {pag + 1 < paginas ? "próxima" : "voltar à primeira"}
                </button>
              </div>
            )}
          </section>
        )}

        {vista === "prazo" && visiveis.length > 0 && (
          <section>
            {comPrazo.length ? <ul className="card divide-y divide-line">{comPrazo.map(linha)}</ul>
              : <p className="text-sm text-muted">Nenhuma tarefa com prazo.</p>}
            {visiveis.length > comPrazo.length && <p className="text-xs text-faint mt-2 px-1">{visiveis.length - comPrazo.length} sem prazo continuam na Lista.</p>}
          </section>
        )}

        {voltamDepois.length > 0 && (
          <details className="card group">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm">
              <span><b className="font-medium">Voltam depois</b> <span className="text-muted">· {voltamDepois.length}</span></span>
              <ChevronDown size={15} className="text-muted group-open:rotate-180 transition-transform" />
            </summary>
            <ul className="divide-y divide-line border-t border-line text-sm">
              {voltamDepois.map((t) => (
                <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{t.texto}</span>
                  <span className="flex items-center gap-2 shrink-0 text-xs text-muted">
                    volta em {t.aparece_em?.split("-").reverse().slice(0, 2).join("/")}
                    <button className="btn text-xs py-0.5" onClick={() => trocar(t, { aparece_em: null, posicao: proximaPosicao(tarefas ?? []) })}>Trazer agora</button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {feitas.length > 0 && (
          <details className="card group">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm">
              <span><b className="font-medium">Feitas</b> <span className="text-muted">· {feitas.length} nos últimos 14 dias</span></span>
              <ChevronDown size={15} className="text-muted group-open:rotate-180 transition-transform" />
            </summary>
            <ul className="divide-y divide-line border-t border-line text-sm">
              {feitas.map((t) => (
                <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-muted line-through decoration-faint">{t.texto}</span>
                  <button className="btn btn-ghost text-xs py-0.5 shrink-0" onClick={() => trocar(t, { feita_em: null, posicao: proximaPosicao(tarefas ?? []) })}>Desfazer</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {guia && (
        <Janela titulo="Como usar: o Sistema de Autofoco" onClose={() => setGuia(false)}>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted">
            <li>Tudo numa lista só: o que surgir entra <b className="text-ink">no fim</b>, sem filtrar nem julgar.</li>
            <li>Passe o olho pela página e escolha a tarefa que você <b className="text-ink">tem vontade</b> de fazer — não a mais urgente. Toque em ▶ para ligar o Timer nela.</li>
            <li>Terminou: ✓. Não terminou: <b className="text-ink">“fiz uma parte”</b>, e ela é reescrita no fim.</li>
            <li>Só passe para a próxima página quando nada mais chamar a sua atenção. O que sobrar depois de algumas passagens, marque com <b className="text-ink">marca-texto</b>.</li>
          </ol>
          <p className="text-sm text-muted"><b className="text-ink">Dica de ouro:</b> escreva tarefas mensuráveis — “ler 20 páginas de Madame Bovary”, “escrever por 1 hora”, não “ler Madame Bovary”.
            Prazo só para o que tem data de verdade (ex.: antes da próxima aula).</p>
          <p className="text-sm text-muted">Precisa de detalhes (passos, o que o professor pediu)? Use a <b className="text-ink">descrição</b>: o título fica curto e a lista continua fácil de passar o olho.</p>
          <button className="btn btn-primary w-full justify-center" onClick={() => setGuia(false)}>Entendi</button>
        </Janela>
      )}
      {concluindo && (
        <Janela titulo="Feita!" onClose={() => setConcluindo(null)}>
          <p className="text-sm">{concluindo.texto}</p>
          <p className="text-sm text-muted">Ela precisa voltar a aparecer (para revisar ou praticar de novo)?</p>
          <div className="grid grid-cols-2 gap-2">
            {([[null, "Não, concluída"], [1, "Amanhã"], [7, "Em 1 semana"], [30, "Em 1 mês"]] as const).map(([dias, rotulo]) => (
              <button key={rotulo} className={`btn justify-center ${dias === null ? "btn-primary" : ""}`} onClick={async () => {
                const t = concluindo;
                setConcluindo(null);
                await concluirTarefa(t, dias);
                await load();
              }}>{rotulo}</button>
            ))}
          </div>
        </Janela>
      )}
      {editando && (
        <Janela titulo="Editar tarefa" onClose={() => setEditando(null)}>
          <FormTarefa ordem={ordem} filhos={filhos} porId={porId} livros={livros} aulas={aulas} inicial={editando} rotulo="Salvar"
            onSalvar={async (dados) => { trocar(editando, dados); setEditando(null); }} />
        </Janela>
      )}
    </Page>
  );
}

function Janela({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{titulo}</h2>
          <button className="text-muted hover:text-ink" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Dados = Partial<Tarefa> & { texto: string };

type Arvore = { ordem: { pasta: PastaEstudo; nivel: number }[]; filhos: Map<string | null, PastaEstudo[]>; porId: Map<string, PastaEstudo>; livros: Livro[]; aulas: AulaLite[] };

function NovaTarefa({ cursoInicial, onCriar, ...arv }: Arvore & { cursoInicial: string | null; onCriar: (d: Dados) => Promise<void> }) {
  const [chave, setChave] = useState(0); // limpa o formulário depois de acrescentar
  return (
    <section className="card p-4">
      <FormTarefa key={chave} {...arv} inicial={{ pasta_id: cursoInicial }} rotulo="Acrescentar"
        onSalvar={async (d) => { await onCriar(d); setChave((k) => k + 1); }} />
    </section>
  );
}

function FormTarefa({ ordem, filhos, porId, livros, aulas, inicial, rotulo, onSalvar }: Arvore & {
  inicial: Partial<Tarefa>; rotulo: string; onSalvar: (d: Dados) => Promise<void>;
}) {
  const [texto, setTexto] = useState(inicial.texto ?? "");
  const [descricao, setDescricao] = useState(inicial.descricao ?? "");
  const [tipo, setTipo] = useState<TipoTarefa>(inicial.tipo ?? "ler");
  const [pasta, setPasta] = useState<string | null>(inicial.pasta_id ?? null);
  const [bookId, setBookId] = useState<string | null>(inicial.book_id ?? null);
  const [busca, setBusca] = useState("");
  const [link, setLink] = useState(inicial.link ?? "");
  const [prazo, setPrazo] = useState(inicial.prazo ?? "");
  const [aulaId, setAulaId] = useState<string | null>(inicial.aula_id ?? null);
  const [antes, setAntes] = useState(!!inicial.antes_de);
  const [mais, setMais] = useState(!!(inicial.prazo || inicial.link || inicial.book_id || inicial.pasta_id || inicial.aula_id || inicial.descricao));
  const [indo, setIndo] = useState(false);
  const livro = bookId ? livros.find((b) => b.id === bookId) : undefined;
  const dobra = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const achados = busca.trim().length >= 2
    ? livros.filter((b) => dobra(busca).split(/\s+/).every((w) => dobra(`${b.title} ${b.author ?? ""}`).includes(w))).slice(0, 8) : [];
  const exemplo = TIPOS.find((t) => t.id === tipo)?.exemplo ?? "";

  // aulas do curso escolhido (com as das subpastas), na ordem das pastas e, dentro delas, na ordem das aulas
  const posPasta = useMemo(() => new Map(ordem.map(({ pasta: p }, i) => [p.id, i])), [ordem]);
  const aulasDoCurso = useMemo(() => {
    if (!pasta) return [];
    const dentro = subarvore(pasta, filhos);
    return aulas.filter((a) => a.pasta_id && dentro.has(a.pasta_id))
      .sort((a, b) => (posPasta.get(a.pasta_id!) ?? 0) - (posPasta.get(b.pasta_id!) ?? 0) || porOrdem(a, b));
  }, [pasta, filhos, aulas, posPasta]);
  const proxima = aulaId ? proximaAula(aulaId, aulas) : null;
  // ao editar, mantém a aula "antes de" que já estava escolhida (se a aula de origem não mudou)
  const antesDe = !antes ? null : aulaId === inicial.aula_id && inicial.antes_de ? inicial.antes_de : proxima?.id ?? null;
  const nomeAntes = antesDe ? aulas.find((a) => a.id === antesDe)?.title : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || indo) return;
    setIndo(true);
    try {
      await onSalvar({
        texto: texto.trim(), descricao: descricao.trim(), tipo, pasta_id: pasta, book_id: tipo === "ler" ? bookId : null, link: link.trim(), prazo: prazo || null,
        aula_id: aulaId, antes_de: aulaId ? antesDe : null,
      });
    } finally { setIndo(false); }
  }

  return (
    <form onSubmit={salvar} className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => {
          const Icone = ICONE[t.id];
          return (
            <button key={t.id} type="button" onClick={() => setTipo(t.id)}
              className={`text-xs rounded-full px-2.5 py-1 border inline-flex items-center gap-1 ${tipo === t.id ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}>
              <Icone size={12} /> {t.nome}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`ex.: ${exemplo}`} autoFocus={rotulo === "Salvar"} />
        <button className="btn btn-primary shrink-0" disabled={!texto.trim() || indo}><Plus size={15} /> {rotulo}</button>
      </div>
      {!mais ? (
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setMais(true)}>+ descrição, curso, aula, livro, link ou prazo</button>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <label className="block sm:col-span-2"><span className="label">Descrição (opcional)</span>
            <textarea className="input mt-1 min-h-[72px] resize-y leading-relaxed" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes, passos, o que o professor pediu…" /></label>
          <label className="block"><span className="label">Curso (opcional)</span>
            <select className="input mt-1" value={pasta ?? ""} onChange={(e) => { setPasta(e.target.value || null); setAulaId(null); setAntes(false); }}>
              <option value="">Sem curso</option>
              {ordem.map(({ pasta: p }) => <option key={p.id} value={p.id}>{caminhoDaPasta(p.id, porId)}</option>)}
            </select></label>
          <label className="block"><span className="label">Prazo (opcional)</span>
            <input type="date" className="input mt-1" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
          {pasta && aulasDoCurso.length > 0 && (
            <div className="sm:col-span-2 space-y-2">
              <label className="block"><span className="label">De qual aula (opcional)</span>
                <select className="input mt-1" value={aulaId ?? ""} onChange={(e) => { setAulaId(e.target.value || null); if (!e.target.value) setAntes(false); }}>
                  <option value="">Nenhuma aula específica</option>
                  {aulasDoCurso.map((a) => (
                    <option key={a.id} value={a.id}>{a.pasta_id !== pasta ? `${porId.get(a.pasta_id!)?.nome} › ` : ""}{a.title}</option>
                  ))}
                </select></label>
              {aulaId && (
                <label className={`flex items-start gap-2 ${proxima || inicial.antes_de ? "cursor-pointer" : "opacity-60"}`}>
                  <input type="checkbox" className="mt-1" checked={antes} disabled={!proxima && !(aulaId === inicial.aula_id && inicial.antes_de)}
                    onChange={(e) => setAntes(e.target.checked)} />
                  <span>
                    Fazer antes da próxima aula
                    <span className="block text-xs text-muted">
                      {nomeAntes ? `Ao abrir “${nomeAntes}”, aparece um lembrete desta tarefa (a leitura não fica bloqueada).`
                        : proxima ? `Ao abrir “${proxima.title}”, aparece um lembrete desta tarefa (a leitura não fica bloqueada).`
                        : "Esta é a última aula da pasta."}
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
          {tipo === "ler" && (
            <div className="sm:col-span-2">
              <span className="label">Livro da Biblioteca (opcional)</span>
              {livro ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="truncate">{livro.title}{livro.author ? <span className="text-muted"> · {livro.author}</span> : null}</span>
                  <button type="button" className="text-faint hover:text-ink" onClick={() => setBookId(null)} title="Tirar o livro"><X size={14} /></button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <label className="input flex items-center gap-2 py-1.5">
                    <Search size={14} className="text-faint" />
                    <input className="bg-transparent outline-none flex-1 min-w-0" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou autor" />
                  </label>
                  {achados.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 card shadow-xl py-1 max-h-64 overflow-y-auto">
                      {achados.map((b) => (
                        <button key={b.id} type="button" className="w-full text-left px-3 py-1.5 hover:bg-sel" onClick={() => { setBookId(b.id); setBusca(""); }}>
                          <span className="block truncate">{b.title}</span>
                          <span className="block truncate text-xs text-muted">{b.author}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {(tipo === "assistir" || link) && (
            <label className="block sm:col-span-2"><span className="label">Link (opcional)</span>
              <input className="input mt-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></label>
          )}
        </div>
      )}
    </form>
  );
}
