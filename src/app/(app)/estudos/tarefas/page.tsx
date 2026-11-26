"use client";
import Link from "next/link";
import { semAcento } from "@/lib/text";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CalendarClock, CheckCheck, ChevronDown, CornerDownRight, ExternalLink, Feather, FolderOpen, GraduationCap, Highlighter, ListChecks, ListEnd, Pencil, Play, Plus, Search, Trash2, X,
} from "lucide-react";
import { Empty, Page } from "@/components/page";
import { EstudosTabs } from "@/components/estudos-tabs";
import { RowMenu } from "@/components/row-menu";
import { useTimerEstado } from "@/components/timer-context";
import { FolhaDaTarefa } from "@/components/folha-da-tarefa";
import { EscolhaDoTipo, ICONE_DO_TIPO } from "@/components/tarefas-da-aula";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { arvoreDePastas, caminhoDaPasta, porOrdem, subarvore, type PastaEstudo } from "@/lib/estudos";
import { ppmDosLivros } from "@/lib/books";
import { fmtDuration, nf } from "@/lib/dates";
import { progressoDoLivro, type Book } from "@/lib/types";
import {
  POR_PAGINA, TIPOS, carregarAulasLite, carregarTarefas, concluirTarefa, criarTarefa, iniciarTarefa, mudarTarefa, carregarEscritos, proximaAula, proximaPosicao,
  tempoPorTarefa, textoDoPrazo, type AulaLite, type Tarefa, type TipoTarefa,
} from "@/lib/tarefas";

type Livro = Pick<Book, "id" | "title" | "author" | "status" | "progress" | "word_count" | "format">;
const TODOS = "todos";
/** os itens do índice que não são cursos (os cursos usam o id da pasta) */
const DEPOIS = "voltam-depois", FEITAS = "feitas", ESCRITOS = "escritos";
const HISTORICO = [
  { id: DEPOIS, nome: "Voltam depois", icone: CalendarClock },
  { id: FEITAS, nome: "Feitas · 14 dias", icone: CheckCheck },
  { id: ESCRITOS, nome: "Escritos", icone: Feather },
] as const;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "Aula 05 — O problema do conhecimento" → curto o bastante para caber numa etiqueta. */
const curto = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function Tarefas() {
  const router = useRouter();
  const timer = useTimerEstado();
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  /** tarefa de escrever aberta na folha */
  const [escrevendo, setEscrevendo] = useState<Tarefa | null>(null);
  const [pastas, setPastas] = useState<PastaEstudo[]>([]);
  const [livros, setLivros] = useState<Livro[]>([]);
  const [aulas, setAulas] = useState<AulaLite[]>([]);
  const [tempo, setTempo] = useState<Map<string, number>>(new Map());
  const [ppm, setPpm] = useState(220);
  /** o item escolhido no índice: todas, um curso (id da pasta) ou uma parte do histórico */
  const [sel, setSel] = useState<string>(TODOS);
  const [indiceNoCelular, setIndiceNoCelular] = useState(false);
  const [vista, setVista] = useState<"lista" | "prazo">("lista");
  const [pagina, setPagina] = useState(0);
  const [concluindo, setConcluindo] = useState<Tarefa | null>(null);
  const [editando, setEditando] = useState<Tarefa | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set()); // descrições mostradas por inteiro
  /** o que já foi escrito nas tarefas de escrever (inclusive as feitas há mais tempo) */
  const [escritos, setEscritos] = useState<Tarefa[]>([]);

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
    void carregarEscritos().then(setEscritos).catch(() => {});
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
  const historico = HISTORICO.some((h) => h.id === sel);
  const curso = historico ? TODOS : sel;
  // o curso escolhido continua no índice mesmo depois de a última tarefa dele sair da lista
  const cursosNoIndice = curso !== TODOS && !cursosComTarefa.includes(curso) ? [...cursosComTarefa, curso] : cursosComTarefa;
  const visiveis = ativas.filter((t) => curso === TODOS || t.pasta_id === curso);
  const paginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const daPagina = visiveis.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);
  const comPrazo = [...visiveis].filter((t) => t.prazo).sort((a, b) => (a.prazo ?? "").localeCompare(b.prazo ?? ""));
  const voltamDepois = (tarefas ?? []).filter((t) => !t.feita_em && t.aparece_em).sort((a, b) => (a.aparece_em ?? "").localeCompare(b.aparece_em ?? ""));
  const feitas = (tarefas ?? []).filter((t) => t.feita_em).sort((a, b) => (b.feita_em ?? "").localeCompare(a.feita_em ?? ""));
  const prazos = ativas.map((t) => textoDoPrazo(t.prazo));
  const atrasadas = prazos.filter((p) => p?.atrasada).length;
  const perto = prazos.filter((p) => p?.urgente && !p.atrasada).length;
  const contagem: Record<string, number> = {
    [TODOS]: ativas.length, [DEPOIS]: voltamDepois.length, [FEITAS]: feitas.length, [ESCRITOS]: escritos.length,
    ...Object.fromEntries(cursosNoIndice.map((id) => [id, ativas.filter((t) => t.pasta_id === id).length])),
  };
  const nomeDoItem = (id: string) => (id === TODOS ? "Todas as tarefas" : HISTORICO.find((h) => h.id === id)?.nome ?? nomeCurto(id));
  const iconeDoItem = (id: string) => (id === TODOS ? ListChecks : HISTORICO.find((h) => h.id === id)?.icone ?? FolderOpen);
  // a manchete conta o fluxo: o que está na lista, o que atrasou, o que aperta e o que saiu (o que é zero não aparece)
  const manchete = [
    ativas.length ? `${ativas.length} na lista` : "Nada na lista",
    atrasadas ? plural(atrasadas, "atrasada", "atrasadas") : "",
    perto ? `${perto} com prazo perto` : "",
    feitas.length ? `${plural(feitas.length, "feita", "feitas")} em 14 dias` : "",
  ].filter(Boolean).map((m, i, l) => (
    // cada item inteiro numa linha: no celular a manchete quebra entre os itens, e não no meio de "1 feita em 14 dias"
    <Fragment key={m}><span className="whitespace-nowrap">{m}{i < l.length - 1 && " ·"}</span>{" "}</Fragment>
  ));
  function escolher(id: string) {
    setSel(id);
    setPagina(0);
    setIndiceNoCelular(false);
  }

  const trocar = (t: Tarefa, campos: Partial<Tarefa>) => {
    setTarefas((l) => l?.map((x) => (x.id === t.id ? { ...x, ...campos } : x)) ?? null);
    void mudarTarefa(t.id, campos);
  };
  /** Não terminou: reescreve no fim da lista (como no caderno). */
  const fizUmaParte = (t: Tarefa) => trocar(t, { posicao: proximaPosicao(tarefas ?? []), destacada: false });

  async function fazerAgora(t: Tarefa) {
    const ir = await iniciarTarefa(t, timer, t.book_id ? livroDe.get(t.book_id) : null);
    if (!ir) return;
    // tarefa de escrever: abre a folha dela aqui mesmo
    if (t.tipo === "escrever") { setEscrevendo(t); return; }
    if (ir.rota) router.push(ir.rota);
    else if (ir.link) window.open(ir.link, "_blank", "noopener");
  }

  function linha(t: Tarefa) {
    const Icone = ICONE_DO_TIPO[t.tipo] ?? ListChecks;
    const b = t.book_id ? livroDe.get(t.book_id) : undefined;
    const prazo = textoDoPrazo(t.prazo);
    const secs = tempo.get(t.id) ?? 0;
    const faltam = b?.word_count && b.status === "lendo" ? b.word_count * (1 - progressoDoLivro(b)) : 0;
    const acao = t.tipo === "escrever" ? (t.escrito_palavras ? "Continuar" : "Escrever") : "Fazer agora";
    const aula = t.aula_id ? aulaDe.get(t.aula_id) : undefined;
    const antesDe = t.antes_de ? aulaDe.get(t.antes_de) : undefined;
    const palavras = t.tipo === "escrever" && !!t.escrito_palavras;
    const nomeDoTipo = TIPOS.find((x) => x.id === t.tipo)?.nome;
    // sem curso, aula, livro, link, prazo nem tempo, o ícone ganha o nome do tipo (para a linha não ficar com um ícone solto)
    const soOTipo = !t.pasta_id && !aula && !antesDe && !b && !t.link && !prazo && secs < 60 && !palavras;
    return (
      <li key={t.id} className="flex items-start gap-3 pl-3.5 pr-1.5 sm:pl-4 sm:pr-2 py-3">
        {/* riscar: abre a janela "Feita!" (a área de toque é maior que a caixinha; border-faint para aparecer no tema claro) */}
        <button type="button" className="relative mt-px w-5 h-5 shrink-0 rounded-md border border-faint hover:border-ink transition-colors before:absolute before:-inset-2"
          title="Feita: riscar" aria-label={`Feita: ${t.texto}`} onClick={() => setConcluindo(t)} />
        <div className="min-w-0 flex-1">
          <div className="leading-snug">
            <span className={t.destacada ? "rounded px-1 -mx-1" : ""} style={t.destacada ? { background: "var(--hl)" } : undefined}>{t.texto}</span>
          </div>
          {t.descricao?.trim() && (
            <button type="button" className={`w-full text-left text-sm text-muted whitespace-pre-wrap mt-1 hover:text-ink ${abertas.has(t.id) ? "block" : "line-clamp-2"}`}
              title={abertas.has(t.id) ? "Recolher a descrição" : "Ver a descrição inteira"}
              onClick={() => setAbertas((a) => { const n = new Set(a); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}>
              {t.descricao.trim()}
            </button>
          )}
          {/* min-h-5: a altura da etiqueta, para as linhas com e sem etiqueta terem a mesma altura */}
          <div className="mt-1 min-h-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1" title={nomeDoTipo}>
              <Icone size={12} className="text-icon shrink-0" aria-hidden />{soOTipo ? nomeDoTipo : <span className="sr-only">{nomeDoTipo}</span>}
            </span>
            {t.pasta_id && <span className="chip">{nomeCurto(t.pasta_id)}</span>}
            {aula && (
              <Link href={`/estudos/${aula.id}`} className="inline-flex items-center gap-1 hover:text-ink hover:underline underline-offset-2" title="De qual aula veio — abrir a aula">
                <GraduationCap size={12} /> {curto(aula.title)}
              </Link>
            )}
            {antesDe && (
              <Link href={`/estudos/${antesDe.id}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:underline underline-offset-2"
                style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }} title="Fazer antes de abrir esta aula">
                <CornerDownRight size={12} /> antes de {curto(antesDe.title, 40)}
              </Link>
            )}
            {b && (
              <span>
                {b.title}
                {b.status === "lendo" ? ` · ${Math.round(progressoDoLivro(b) * 100)}%${faltam ? ` · faltam ≈ ${fmtDuration((faltam / ppm) * 60)}` : ""}`
                  : b.status === "lido" ? " · ✓ lido" : b.word_count ? ` · ${nf.format(b.word_count)} palavras · ≈ ${fmtDuration((b.word_count / ppm) * 60)}` : ""}
              </span>
            )}
            {t.link && <a href={t.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-ink underline-offset-2 hover:underline"><ExternalLink size={11} /> link</a>}
            {prazo && (
              <span className="rounded-md px-1.5 py-0.5 font-medium"
                style={{ color: prazo.atrasada ? "var(--critical)" : prazo.urgente ? "var(--warn)" : undefined, background: prazo.urgente ? "color-mix(in srgb, currentColor 12%, transparent)" : "var(--surface-2)" }}>
                {prazo.texto}
              </span>
            )}
            {secs >= 60 && <span title="Tempo de foco dedicado no Timer">⏱ {fmtDuration(secs)}</span>}
            {palavras && (
              <button className="inline-flex items-center gap-1 hover:text-ink" title="Abrir o que já escreveu" onClick={() => setEscrevendo(t)}><Feather size={11} /> {nf.format(t.escrito_palavras ?? 0)} palavras</button>
            )}
          </div>
        </div>
        {/* coluna de ação: um só ▶ (ou a pena, nas de escrever) e o ⋯, alinhados em todas as linhas e também no celular */}
        <div className="flex items-center shrink-0 -mt-1">
          <button className="btn btn-ghost px-2 py-1" title={t.tipo === "escrever" ? `${acao}: abre a folha desta tarefa e liga o Timer` : "Fazer agora: liga o Timer nesta tarefa"}
            aria-label={`${acao}: ${t.texto}`} onClick={() => void fazerAgora(t)}>
            {t.tipo === "escrever" ? <Feather size={15} /> : <Play size={15} />}
          </button>
          <RowMenu items={[
            { label: "Fiz uma parte (vai para o fim)", icon: ListEnd, onClick: () => fizUmaParte(t) },
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

  // um item do índice no desenho da árvore de pastas das Aulas: marcador · rótulo · número à direita
  const item = (id: string, recuo = false) => {
    const Icone = iconeDoItem(id);
    return (
      <button key={id} type="button" onClick={() => escolher(id)} aria-current={sel === id ? "true" : undefined}
        title={recuo ? caminhoDaPasta(id, porId) : undefined}
        className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2.5 lg:py-1.5 text-left ${recuo ? "pl-6" : ""} ${sel === id ? "bg-sel text-ink font-medium" : "text-muted hover:bg-sel/60 hover:text-ink"}`}>
        <Icone size={14} className="shrink-0 mt-[3px]" />
        <span className="flex-1 min-w-0 break-words leading-snug">{nomeDoItem(id)}</span>
        <span className={`text-xs tabular-nums shrink-0 mt-[2px] ${contagem[id] ? "text-muted" : "text-faint"}`}>{contagem[id] ?? 0}</span>
      </button>
    );
  };
  const IconeDoSel = iconeDoItem(sel);

  return (
    <Page tabs={<EstudosTabs />} title="Estudos" subtitle={tarefas ? manchete : "…"}
      ajuda={
        <div className="space-y-2.5">
          <p className="font-medium text-ink">Como usar: o Sistema de Autofoco</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Tudo numa lista só: o que surgir entra <b className="text-ink">no fim</b>, sem filtrar nem julgar.</li>
            <li>Passe o olho pela página e escolha a tarefa que você <b className="text-ink">tem vontade</b> de fazer — não a mais urgente. Toque em ▶ para ligar o Timer nela.</li>
            <li>Terminou: marque a caixinha. Não terminou: <b className="text-ink">“fiz uma parte”</b> (no ⋯), e ela é reescrita no fim.</li>
            <li>Só passe para a próxima página quando nada mais chamar a sua atenção. O que sobrar depois de algumas passagens, marque com <b className="text-ink">marca-texto</b>.</li>
          </ol>
          <p><b className="text-ink">Dica de ouro:</b> escreva tarefas mensuráveis — “ler 20 páginas de Madame Bovary”, “escrever por 1 hora”, não “ler Madame Bovary”.
            Prazo só para o que tem data de verdade (ex.: antes da próxima aula).</p>
          <p>Precisa de detalhes (passos, o que o professor pediu)? Use a <b className="text-ink">descrição</b>: o título fica curto e a lista continua fácil de passar o olho.</p>
        </div>
      }>
      {/* o mesmo esqueleto das Aulas: o índice à esquerda a partir de lg; antes disso ele abre pelo botão "Mostrar:" */}
      <div className="grade-indice">
        <button type="button" className="lg:hidden btn w-full justify-start" aria-expanded={indiceNoCelular} onClick={() => setIndiceNoCelular((v) => !v)}>
          <IconeDoSel size={16} className="text-muted shrink-0" />
          <span className="text-muted font-normal shrink-0">Mostrar:</span>
          <span className="truncate flex-1 text-left">{nomeDoItem(sel)}</span>
          <ChevronDown size={16} className={`text-faint shrink-0 transition-transform ${indiceNoCelular ? "rotate-180" : ""}`} />
        </button>
        <aside className={`card p-2 text-sm lg:sticky lg:top-4 ${indiceNoCelular ? "" : "hidden lg:block"}`}>
          {item(TODOS)}
          {cursosNoIndice.map((id) => item(id, true))}
          <div className="my-1.5 border-t border-line" />
          {HISTORICO.map((h) => item(h.id))}
        </aside>

        <div className="min-w-0 space-y-3 md:space-y-4">
          <NovaTarefa ordem={ordem} filhos={filhos} porId={porId} livros={livros} aulas={aulas} cursoInicial={curso === TODOS ? null : curso}
            onCriar={async (dados) => { const t = await criarTarefa(dados, tarefas ?? []); setTarefas((l) => [...(l ?? []), t]); }} />

          {!historico && (
            <>
              {ativas.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 min-h-8">
                  {vista === "lista" && paginas > 1 ? (
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      <span className="mr-1">Página</span>
                      {Array.from({ length: paginas }, (_, i) => (
                        <button key={i} onClick={() => setPagina(i)} aria-current={i === pag ? "page" : undefined}
                          className={`w-6 h-6 rounded-md tabular-nums ${i === pag ? "bg-sel text-ink font-medium" : "hover:text-ink"}`}>{i + 1}</button>
                      ))}
                    </div>
                  ) : <span />}
                  <div className="seg seg-md">
                    {([["lista", "Lista"], ["prazo", "Por prazo"]] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setVista(k)} aria-pressed={vista === k} className="px-3">{l}</button>
                    ))}
                  </div>
                </div>
              )}

              {tarefas && !visiveis.length && (
                <Empty icone={ListChecks}>Nenhuma tarefa {curso === TODOS ? "na lista" : "neste curso"}. Escreva acima o que precisa fazer.</Empty>
              )}

              {vista === "lista" && daPagina.length > 0 && (
                <section>
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
                    : <Empty icone={CalendarClock}>Nenhuma tarefa com prazo.</Empty>}
                  {visiveis.length > comPrazo.length && <p className="text-xs text-faint mt-2 px-1">{visiveis.length - comPrazo.length} sem prazo {visiveis.length - comPrazo.length === 1 ? "continua" : "continuam"} na Lista.</p>}
                </section>
              )}
            </>
          )}

          {/* histórico: uma linha de resumo no lugar da barra (o mesmo ritmo da lista) e a lista num cartão */}
          {sel === DEPOIS && (voltamDepois.length ? (
            <>
              <p className="flex items-center min-h-8 text-xs text-faint">Revisões agendadas, na ordem em que voltam para o fim da lista.</p>
              <ul className="card divide-y divide-line text-sm">
                {voltamDepois.map((t) => (
                  <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate" title={t.texto}>{t.texto}</span>
                    <span className="flex items-center gap-2 shrink-0 text-xs text-muted">
                      volta em {t.aparece_em?.split("-").reverse().slice(0, 2).join("/")}
                      <button className="btn text-xs py-0.5" onClick={() => trocar(t, { aparece_em: null, posicao: proximaPosicao(tarefas ?? []) })}>Trazer agora</button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : tarefas && <Empty icone={CalendarClock}>Nada agendado para voltar. Ao riscar uma tarefa, escolha quando ela deve reaparecer.</Empty>)}

          {sel === FEITAS && (feitas.length ? (
            <>
              <p className="flex items-center min-h-8 text-xs text-faint">Riscadas nos últimos 14 dias.</p>
              <ul className="card divide-y divide-line text-sm">
                {feitas.map((t) => (
                  <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-muted line-through decoration-faint" title={t.texto}>{t.texto}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {!!t.escrito_palavras && (
                        <button className="btn btn-ghost text-xs py-0.5" title="Abrir o que escreveu" onClick={() => setEscrevendo(t)}><Feather size={12} /> {nf.format(t.escrito_palavras)} palavras</button>
                      )}
                      <button className="btn btn-ghost text-xs py-0.5" onClick={() => trocar(t, { feita_em: null, posicao: proximaPosicao(tarefas ?? []) })}>Desfazer</button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : tarefas && <Empty icone={CheckCheck}>Nenhuma tarefa riscada nos últimos 14 dias.</Empty>)}

          {sel === ESCRITOS && (escritos.length ? (
            <>
              {/* tudo o que foi escrito nas tarefas, de qualquer data (o texto fica na própria tarefa) */}
              <p className="flex items-center min-h-8 text-xs text-faint tabular-nums">
                {nf.format(escritos.reduce((n, t) => n + (t.escrito_palavras ?? 0), 0))} palavras ao todo, de qualquer data
              </p>
              <ul className="card divide-y divide-line text-sm">
                {escritos.map((t) => (
                  <li key={t.id}>
                    <button className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-sel" onClick={() => setEscrevendo(t)} title="Abrir o texto">
                      <span className="min-w-0">
                        <span className="block truncate">{t.texto}</span>
                        <span className="block truncate text-xs text-muted">{(t.escrito ?? "").replace(/\s+/g, " ").slice(0, 120)}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted tabular-nums">
                        {nf.format(t.escrito_palavras ?? 0)} palavras
                        <span className="block">{t.feita_em ? `feita ${new Date(t.feita_em).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}` : "em aberto"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : <Empty icone={Feather}>Nada escrito ainda. As tarefas de escrever guardam aqui o que você escreve nelas.</Empty>)}
        </div>
      </div>

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
      {escrevendo && (
        <FolhaDaTarefa tarefa={escrevendo} onFechar={(escrito, palavras) => {
          setTarefas((l) => l?.map((x) => (x.id === escrevendo.id ? { ...x, escrito, escrito_palavras: palavras } : x)) ?? null);
          void carregarEscritos().then(setEscritos).catch(() => {});
          setEscrevendo(null);
        }} />
      )}
    </Page>
  );
}

function Janela({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="modal-title">{titulo}</h2>
          <button onClick={onClose} className="modal-close" aria-label="Fechar"><X size={18} /></button>
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
  const achados = busca.trim().length >= 2
    ? livros.filter((b) => semAcento(busca).split(/\s+/).every((w) => semAcento(`${b.title} ${b.author ?? ""}`).includes(w))).slice(0, 8) : [];
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
      <EscolhaDoTipo valor={tipo} onMudar={setTipo} />
      <div className="flex gap-2">
        <input className="input flex-1 min-w-0" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`ex.: ${exemplo}`} autoFocus={rotulo === "Salvar"} />
        {/* no celular, "Acrescentar" vira só o +, para o campo ficar com a largura toda; "Salvar" (edição) continua escrito */}
        <button className="btn btn-primary shrink-0" disabled={!texto.trim() || indo} title={rotulo} aria-label={rotulo}>
          <Plus size={15} /> {rotulo === "Acrescentar" ? <span className="hidden sm:inline">{rotulo}</span> : rotulo}
        </button>
      </div>
      {!mais ? (
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setMais(true)}>+ descrição, curso, aula, livro, link ou prazo</button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                    <div className="absolute z-20 left-0 right-0 mt-1 popover py-1 max-h-64 overflow-y-auto">
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
