"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, BookOpen, ChevronDown, ChevronRight, CircleCheck, Download, FileText, FolderInput, FolderOpen, FolderPlus, FolderUp,
  ListOrdered, NotebookPen, Pencil, Plus, Search, Trash2, Upload, X,
} from "lucide-react";
import { Empty, Page } from "@/components/page";
import { RowMenu } from "@/components/row-menu";
import { SITUACOES_AULA, StatusPill, type SituacaoAula } from "@/components/status-pill";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import {
  arvoreDePastas, baixarAula, baixarTodas, caminhoDaPasta, camposDaSituacao, COLUNAS_AULA, faltam, importarAulas, nivelProvavel, numeroDaAula,
  pastasDoArquivo, porOrdem, porTitulo, ppmMedio, reordenarAulas, subarvore, syncHeading, type Aula, type PastaEstudo,
} from "@/lib/estudos";
import { fmtDuration, nf } from "@/lib/dates";

type Filtro = "todas" | SituacaoAula;
const SEM_PASTA = "sem";

export default function Estudos() {
  const router = useRouter();
  const [aulas, setAulas] = useState<Aula[] | null>(null);
  const [pastas, setPastas] = useState<PastaEstudo[]>([]);
  const [sel, setSel] = useState<string>("todas"); // "todas" | "sem" (aulas sem pasta) | id da pasta
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [movendo, setMovendo] = useState<{ pasta?: PastaEstudo; aula?: Aula } | null>(null);
  const [nomeando, setNomeando] = useState<{ pai: string | null; pasta?: PastaEstudo } | null>(null);
  const [posicionando, setPosicionando] = useState<Aula | null>(null);
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<Set<string> | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [preview, setPreview] = useState<{ files: File[]; nivel: 0 | 1; destino: string | null } | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const destinoDoImport = useRef<string | null>(null); // para onde vão os arquivos escolhidos
  const [msg, setMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<Aula | null>(null);
  const [ppm, setPpm] = useState<{ ppm: number; origem: string }>({ ppm: 220, origem: "padrão" });
  const tempo = (palavras: number) => fmtDuration((palavras / ppm.ppm) * 60);
  const pastaRef = useRef<HTMLInputElement>(null);
  const arquivosRef = useRef<HTMLInputElement>(null);

  async function load() {
    const sb = supabase();
    const [a, p] = await Promise.all([
      todas<Aula>((de, ate) => sb.from("notes").select(COLUNAS_AULA).eq("kind", "estudo").order("id").range(de, ate)),
      sb.from("estudo_pastas").select("id,parent_id,nome,posicao"),
    ]);
    setAulas(a.sort(porTitulo));
    const ps = (p.data as PastaEstudo[]) ?? [];
    setPastas(ps);
    // na primeira vez, as pastas do primeiro nível aparecem abertas
    setAbertos((s) => (s.size ? s : new Set(ps.filter((x) => !x.parent_id).map((x) => x.id))));
  }
  useEffect(() => {
    // links antigos (/estudos?id=…) abrem direto a aula
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) { router.replace(`/estudos/${id}`); return; }
    void load();
    void ppmMedio().then(setPpm);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // busca dentro das transcrições: feita no banco (sem baixar tudo)
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setAchados(null); return; }
    const h = setTimeout(async () => {
      const termo = t.replace(/[%_\\]/g, (c) => `\\${c}`);
      const sb = supabase();
      const [a, b] = await Promise.all([
        sb.from("notes").select("id").eq("kind", "estudo").ilike("content", `%${termo}%`).limit(1000),
        sb.from("notes").select("id").eq("kind", "estudo").ilike("anotacoes", `%${termo}%`).limit(1000),
      ]);
      setAchados(new Set([...((a.data as { id: string }[]) ?? []), ...((b.data as { id: string }[]) ?? [])].map((x) => x.id)));
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  // árvore de pastas, contagens (somando as subpastas) e a ordem dos grupos
  const { ordem, filhos } = useMemo(() => arvoreDePastas(pastas), [pastas]);
  const porId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);
  const posNaArvore = useMemo(() => new Map(ordem.map((o, i) => [o.pasta.id, i])), [ordem]);
  const contagem = useMemo(() => {
    const m = new Map<string, { total: number; feitas: number; faltam: number }>();
    for (const a of aulas ?? []) {
      for (let p = a.pasta_id ? porId.get(a.pasta_id) : undefined, n = 0; p && n < 50; p = p.parent_id ? porId.get(p.parent_id) : undefined, n++) {
        const x = m.get(p.id) ?? { total: 0, feitas: 0, faltam: 0 };
        x.total++;
        if (a.situacao === "concluida") x.feitas++;
        x.faltam += faltam(a);
        m.set(p.id, x);
      }
    }
    return m;
  }, [aulas, porId]);
  const semPasta = (aulas ?? []).filter((a) => !a.pasta_id || !porId.has(a.pasta_id));
  const visivel = (id: string) => {
    for (let p = porId.get(id)?.parent_id; p; p = porId.get(p)?.parent_id) if (!abertos.has(p)) return false;
    return true;
  };

  const dentroDaSel = useMemo(() => (sel !== "todas" && sel !== SEM_PASTA ? subarvore(sel, filhos) : null), [sel, filhos]);
  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (aulas ?? []).filter((a) => {
      if (sel === SEM_PASTA && a.pasta_id && porId.has(a.pasta_id)) return false;
      if (dentroDaSel && !(a.pasta_id && dentroDaSel.has(a.pasta_id))) return false;
      if (filtro !== "todas" && a.situacao !== filtro) return false;
      if (t && !a.title.toLowerCase().includes(t) && !(achados?.has(a.id))) return false;
      return true;
    });
  }, [aulas, sel, dentroDaSel, porId, filtro, q, achados]);

  // agrupado por pasta, na ordem da árvore
  const grupos = useMemo(() => {
    const g = new Map<string, Aula[]>();
    for (const a of visiveis) {
      const k = a.pasta_id && porId.has(a.pasta_id) ? a.pasta_id : SEM_PASTA;
      g.set(k, [...(g.get(k) ?? []), a]);
    }
    return [...g.entries()]
      .sort(([a], [b]) => (posNaArvore.get(a) ?? 1e9) - (posNaArvore.get(b) ?? 1e9))
      .map(([k, l]) => [k === SEM_PASTA ? "Sem pasta" : caminhoDaPasta(k, porId), [...l].sort(porOrdem)] as [string, Aula[]]);
  }, [visiveis, porId, posNaArvore]);

  // aulas em leitura (as mais adiantadas primeiro)
  const lendo = useMemo(() => (aulas ?? []).filter((a) => a.situacao === "lendo").sort((x, y) => (y.progresso ?? 0) - (x.progresso ?? 0)), [aulas]);

  // ---- ordem das aulas dentro da pasta ----
  const chaveDaPasta = (a: Aula) => (a.pasta_id && porId.has(a.pasta_id) ? a.pasta_id : SEM_PASTA);
  /** Todas as aulas da mesma pasta (sem filtro nem busca), na ordem atual. */
  const daMesmaPasta = (a: Aula) => (aulas ?? []).filter((x) => chaveDaPasta(x) === chaveDaPasta(a)).sort(porOrdem);
  async function gravarOrdem(lista: Aula[]) {
    const pos = new Map(lista.map((x, i) => [x.id, i]));
    setAulas((all) => all?.map((x) => (pos.has(x.id) ? { ...x, ordem: pos.get(x.id)! } : x)) ?? null);
    try { await reordenarAulas(lista.map((x) => x.id)); } catch (e) {
      setMsg(`Não consegui salvar a nova ordem: ${(e as Error).message}`);
      setTimeout(() => setMsg(null), 5000);
      void load();
    }
  }
  /** Sobe ou desce uma posição em relação às aulas que estão à vista (com filtro ou busca, pula as escondidas). */
  function moverNaLista(a: Aula, dir: -1 | 1) {
    const lista = daMesmaPasta(a);
    const vis = new Set(visiveis.map((x) => x.id));
    const i = lista.findIndex((x) => x.id === a.id);
    let j = i + dir;
    while (j >= 0 && j < lista.length && !vis.has(lista[j].id)) j += dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const vizinho = lista[j].id;
    const sem = lista.filter((x) => x.id !== a.id);
    const alvo = sem.findIndex((x) => x.id === vizinho);
    sem.splice(dir < 0 ? alvo : alvo + 1, 0, a);
    void gravarOrdem(sem);
  }
  function moverParaPosicao(a: Aula, n: number) {
    const lista = daMesmaPasta(a).filter((x) => x.id !== a.id);
    lista.splice(Math.max(0, Math.min(lista.length, n - 1)), 0, a);
    void gravarOrdem(lista);
  }

  // ---- pastas: criar, renomear, ordenar, mover, apagar ----
  const irmaos = (pai: string | null) => filhos.get(pai) ?? [];
  async function salvarNome(nome: string) {
    if (!nomeando) return;
    const sb = supabase();
    if (nomeando.pasta) await sb.from("estudo_pastas").update({ nome }).eq("id", nomeando.pasta.id);
    else {
      await sb.from("estudo_pastas").insert({ parent_id: nomeando.pai, nome, posicao: irmaos(nomeando.pai).length });
      if (nomeando.pai) setAbertos((s) => new Set(s).add(nomeando.pai!));
    }
    setNomeando(null);
    void load();
  }
  async function moverNaOrdem(p: PastaEstudo, dir: -1 | 1) {
    const lista = [...irmaos(p.parent_id)];
    const i = lista.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    setPastas((all) => all.map((x) => { const k = lista.findIndex((y) => y.id === x.id); return k >= 0 ? { ...x, posicao: k } : x; }));
    const sb = supabase();
    await Promise.all(lista.map((x, k) => (x.posicao === k ? null : sb.from("estudo_pastas").update({ posicao: k }).eq("id", x.id))));
  }
  async function moverPasta(p: PastaEstudo, para: string | null) {
    if (para === p.parent_id) return;
    const { error } = await supabase().from("estudo_pastas").update({ parent_id: para, posicao: irmaos(para).length }).eq("id", p.id);
    if (error) { alert(error.message); return; }
    if (para) setAbertos((s) => new Set(s).add(para));
    void load();
  }
  async function moverAula(a: Aula, para: string | null) {
    const sb = supabase();
    // na pasta nova, a aula entra no fim (sem posição escolhida)
    await sb.from("notes").update(para ? { pasta_id: para, ordem: null } : { pasta_id: null, course: "", folder: "", ordem: null }).eq("id", a.id);
    void load();
  }
  async function apagarPasta(p: PastaEstudo) {
    const c = contagem.get(p.id)?.total ?? 0;
    const sub = irmaos(p.id).length;
    const pai = p.parent_id ? porId.get(p.parent_id)?.nome : null;
    const destino = pai ? `“${pai}”` : "o primeiro nível";
    if (!confirm(c || sub
      ? `Apagar a pasta “${p.nome}”? Nada se perde: ${[c ? `${c} ${c === 1 ? "aula" : "aulas"}` : "", sub ? `${sub} ${sub === 1 ? "subpasta" : "subpastas"}` : ""].filter(Boolean).join(" e ")} ${c + sub === 1 ? "vai" : "vão"} para ${destino}.`
      : `Apagar a pasta “${p.nome}”?`)) return;
    const sb = supabase();
    const base = irmaos(p.parent_id).length;
    await Promise.all(irmaos(p.id).map((f, k) => sb.from("estudo_pastas").update({ parent_id: p.parent_id, posicao: base + k }).eq("id", f.id)));
    await sb.from("notes").update(p.parent_id ? { pasta_id: p.parent_id } : { pasta_id: null, course: "", folder: "" }).eq("pasta_id", p.id);
    await sb.from("estudo_pastas").delete().eq("id", p.id);
    if (sel === p.id) setSel(p.parent_id ?? "todas");
    void load();
  }

  async function mudarSituacao(a: Aula, situacao: SituacaoAula) {
    const campos = camposDaSituacao(situacao, a);
    setAulas((all) => all?.map((x) => (x.id === a.id ? { ...x, ...campos } : x)) ?? null);
    await supabase().from("notes").update(campos).eq("id", a.id);
  }

  async function apagar(a: Aula) {
    if (!confirm(`Apagar a aula “${a.title}” (e as suas anotações dela)?`)) return;
    await supabase().from("notes").delete().eq("id", a.id);
    setAulas((all) => all?.filter((x) => x.id !== a.id) ?? null);
  }

  const pastaSel = sel !== "todas" && sel !== SEM_PASTA && porId.has(sel) ? sel : null;
  async function novaAula(destino: string | null) {
    const { data } = await supabase().from("notes").insert({
      kind: "estudo", title: "Nova aula", content: "# Nova aula\n\n", course: "", folder: "", pasta_id: destino,
    }).select("id").single();
    if (data) router.push(`/estudos/${(data as { id: string }).id}?editar=1`);
  }

  // o campo só é esvaziado depois de importar (ou desistir): antes disso os arquivos ainda vão ser lidos
  const limparCampos = () => { if (pastaRef.current) pastaRef.current.value = ""; if (arquivosRef.current) arquivosRef.current.value = ""; };
  function fecharPreview() { setPreview(null); limparCampos(); }
  function escolher(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
    if (files.length) setPreview({ files, nivel: nivelProvavel(files), destino: destinoDoImport.current });
  }

  async function importar() {
    if (!preview || !aulas) return;
    const { files, nivel, destino } = preview;
    setPreview(null);
    try {
      const r = await importarAulas(files, nivel, aulas, destino, pastas, setMsg);
      limparCampos();
      setMsg(`${r.novas} ${r.novas === 1 ? "aula importada" : "aulas importadas"}${r.atualizadas ? `, ${r.atualizadas} atualizadas` : ""}.`);
    } catch (e) {
      limparCampos();
      setMsg(`Não consegui importar: ${(e as Error).message}`);
    }
    setTimeout(() => setMsg(null), 5000);
    void load();
  }

  const total = aulas?.length ?? 0;
  const feitas = aulas?.filter((a) => a.situacao === "concluida").length ?? 0;
  const pelaFrente = (aulas ?? []).reduce((n, a) => n + faltam(a), 0);
  const alterna = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <Page wide title="Estudos"
      subtitle={total
        ? `${total - feitas} ${total - feitas === 1 ? "aula pendente" : "aulas pendentes"} · ≈ ${tempo(pelaFrente)} de leitura pela frente a ${ppm.ppm} ppm`
        : "Cursos e transcrições de aulas."}
      actions={
        <>
          <button className="btn" onClick={() => { destinoDoImport.current = pastaSel; pastaRef.current?.click(); }}><FolderUp size={15} /> Importar curso</button>
          <button className="btn btn-primary" onClick={() => setNovaAberta(true)}><Plus size={15} /> Nova aula</button>
          <RowMenu label="Mais opções" items={[
            { label: "Importar arquivos .md", icon: Upload, onClick: () => { destinoDoImport.current = pastaSel; arquivosRef.current?.click(); } },
            { label: "Baixar todas as aulas (.zip)", icon: Download, disabled: !total, onClick: () => aulas && void baixarTodas(aulas) },
          ]} />
        </>
      }>
      <input ref={pastaRef} type="file" hidden multiple {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(e) => escolher(e.target.files)} />
      <input ref={arquivosRef} type="file" hidden multiple accept=".md,.markdown,.txt" onChange={(e) => escolher(e.target.files)} />
      {msg && <div className="mb-4 rounded-lg bg-surface-2 px-4 py-2 text-sm">{msg}</div>}

      <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
        {/* pastas: autor › curso › módulo… */}
        <aside className="card p-2 text-sm lg:sticky lg:top-4">
          <button onClick={() => setSel("todas")}
            className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 ${sel === "todas" ? "bg-sel text-ink font-medium" : "text-muted hover:bg-sel/60 hover:text-ink"}`}>
            <span>Todas as aulas</span><span className="text-xs text-faint tabular-nums">{total}</span>
          </button>
          <div className="my-1.5 border-t border-line" />
          {ordem.filter(({ pasta }) => visivel(pasta.id)).map(({ pasta: p, nivel }) => {
            const temFilhos = irmaos(p.id).length > 0;
            const c = contagem.get(p.id);
            const lista = irmaos(p.parent_id);
            const k = lista.findIndex((x) => x.id === p.id);
            return (
              <div key={p.id} className={`group/p flex items-start rounded-lg ${sel === p.id ? "bg-sel" : "hover:bg-sel/60"}`} style={{ paddingLeft: nivel * 14 }}>
                <button className="p-1.5 text-faint hover:text-ink disabled:opacity-0" disabled={!temFilhos} onClick={() => alterna(p.id)} aria-label={abertos.has(p.id) ? "Fechar" : "Abrir"}>
                  {abertos.has(p.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <button onClick={() => setSel(p.id)} title={c?.faltam ? `≈ ${tempo(c.faltam)} de leitura pela frente` : undefined}
                  className={`flex-1 min-w-0 flex items-start gap-2 py-1.5 text-left ${sel === p.id ? "text-ink font-medium" : "text-ink/90"}`}>
                  <FolderOpen size={14} className="text-icon shrink-0 mt-[3px]" />
                  {/* nome inteiro: quebra em mais linhas em vez de cortar com "…" */}
                  <span className="flex-1 min-w-0 break-words leading-snug" title={p.nome}>{p.nome}</span>
                  {c && <span className="text-xs text-faint tabular-nums shrink-0 mt-[2px]">{c.feitas}/{c.total}</span>}
                </button>
                <span className="opacity-100 lg:opacity-0 lg:group-hover/p:opacity-100 focus-within:opacity-100 transition-opacity">
                  <RowMenu label={`Opções da pasta ${p.nome}`} items={[
                    { label: "Nova subpasta", icon: FolderPlus, onClick: () => setNomeando({ pai: p.id }) },
                    { label: "Renomear", icon: Pencil, onClick: () => setNomeando({ pai: p.parent_id, pasta: p }) },
                    { label: "Subir", icon: ArrowUp, separar: true, disabled: k <= 0, onClick: () => void moverNaOrdem(p, -1) },
                    { label: "Descer", icon: ArrowDown, disabled: k >= lista.length - 1, onClick: () => void moverNaOrdem(p, 1) },
                    { label: "Mover para outra pasta", icon: FolderInput, onClick: () => setMovendo({ pasta: p }) },
                    { label: "Apagar pasta", icon: Trash2, danger: true, separar: true, onClick: () => void apagarPasta(p) },
                  ]} />
                </span>
              </div>
            );
          })}
          {semPasta.length > 0 && (
            <button onClick={() => setSel(SEM_PASTA)}
              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 ${sel === SEM_PASTA ? "bg-sel text-ink font-medium" : "text-muted hover:bg-sel/60 hover:text-ink"}`}>
              <span>Sem pasta</span><span className="text-xs text-faint tabular-nums">{semPasta.length}</span>
            </button>
          )}
          <button onClick={() => setNomeando({ pai: null })} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 mt-1 text-muted hover:bg-sel/60 hover:text-ink">
            <FolderPlus size={14} /> Nova pasta
          </button>
          {aulas && !pastas.length && !total && <p className="px-2.5 py-2 text-xs text-muted">Crie uma pasta (ex.: o nome do professor) ou importe a pasta de um curso.</p>}
        </aside>

        {/* aulas */}
        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="input flex items-center gap-2 py-1.5 flex-1 min-w-[220px]">
              <Search size={15} className="text-faint shrink-0" />
              <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Buscar no título, no texto das aulas ou nas anotações" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button onClick={() => setQ("")} className="text-faint hover:text-ink"><X size={14} /></button>}
            </label>
            <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
              {([["todas", "Todas"], ["pendente", "Pendentes"], ["lendo", "Lendo"], ["concluida", "Concluídas"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1 rounded-md ${filtro === k ? "bg-seg shadow-sm" : "text-muted"}`}>{l}</button>
              ))}
            </div>
          </div>

          {aulas && total === 0 && (
            <Empty>Nenhuma aula ainda. Use <b>Importar curso</b> e escolha a pasta do curso no seu computador (cada arquivo .md vira uma aula).</Empty>
          )}
          {aulas && total > 0 && !visiveis.length && <p className="text-sm text-muted">Nada encontrado.</p>}

          {lendo.length > 0 && !q.trim() && (
            <section className="mb-6">
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="font-medium flex items-center gap-2"><BookOpen size={16} className="text-icon" /> Lendo agora</h2>
                <span className="text-xs text-muted tabular-nums">≈ {tempo(lendo.reduce((n, a) => n + faltam(a), 0))} pela frente</span>
              </div>
              <div className="card divide-y divide-line">
                {lendo.map((a) => (
                  <button key={a.id} onClick={() => router.push(`/estudos/${a.id}`)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-sel/60 transition-colors first:rounded-t-[11px] last:rounded-b-[11px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.title}</span>
                      <span className="block truncate text-xs text-muted">{a.course}</span>
                      <span className="block h-1.5 rounded-full bg-surface-2 mt-1.5 overflow-hidden">
                        <span className="block h-full bg-chart rounded-full" style={{ width: `${Math.round((a.progresso ?? 0) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="text-right shrink-0 tabular-nums">
                      <span className="block text-sm">{Math.round((a.progresso ?? 0) * 100)}%</span>
                      {a.palavras ? <span className="block text-xs text-muted">faltam ≈ {tempo(faltam(a))}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-6">
            {grupos.map(([g, lista]) => (
              <div key={g}>
                <div className="flex items-baseline justify-between mb-2 px-1">
                  <h2 className="text-sm text-muted truncate">{g}</h2>
                  <span className="text-xs text-faint tabular-nums">
                    {lista.filter((a) => a.situacao === "concluida").length}/{lista.length}
                    {lista.some((a) => a.situacao !== "concluida") && ` · ≈ ${tempo(lista.reduce((n, a) => n + faltam(a), 0))} pela frente`}
                  </span>
                </div>
                <div className="card divide-y divide-line">
                  {lista.map((a, k) => {
                    const n = numeroDaAula(a.title);
                    const feita = a.situacao === "concluida";
                    return (
                      <div key={a.id} className="group flex items-center gap-2 pr-2 hover:bg-sel/60 transition-colors first:rounded-t-[11px] last:rounded-b-[11px]">
                        <button onClick={() => router.push(`/estudos/${a.id}`)} className="flex items-center gap-3 min-w-0 flex-1 p-3 text-left" title="Abrir a aula">
                          <span className={`w-10 h-10 shrink-0 grid place-items-center rounded-lg text-[13px] font-medium tabular-nums ${feita ? "bg-good/15 text-good" : "bg-surface-2 text-ink/80"}`}>
                            {feita ? <CircleCheck size={17} /> : n ?? <FileText size={16} className="text-icon" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.title}</span>
                            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted mt-0.5">
                              {[
                                a.professor || null,
                                a.situacao === "lendo" && (a.progresso ?? 0) > 0 ? `${Math.round((a.progresso ?? 0) * 100)}%` : null,
                                // em leitura: o que falta, no seu ritmo; senão, o total
                                a.palavras ? (a.situacao === "lendo" ? `faltam ${nf.format(Math.round(faltam(a)))} palavras · ≈ ${tempo(faltam(a))}` : `${nf.format(a.palavras)} palavras · ≈ ${tempo(a.palavras)}`) : null,
                              ].filter(Boolean).join(" · ")}
                              {(a.anotacoes ?? "").trim() && (
                                <span className="inline-flex items-center gap-1" title="Esta aula tem anotações suas">
                                  · <NotebookPen size={11} /> anotações
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                        <StatusPill label="Status da aula" value={a.situacao ?? "pendente"} options={SITUACOES_AULA} onChange={(v) => mudarSituacao(a, v)} />
                        <RowMenu items={[
                          { label: "Abrir a aula", icon: BookOpen, onClick: () => router.push(`/estudos/${a.id}`) },
                          { label: "Editar nome e professor", icon: Pencil, onClick: () => setEditando(a) },
                          { label: "Mover para outra pasta", icon: FolderInput, onClick: () => setMovendo({ aula: a }) },
                          { label: "Subir", icon: ArrowUp, separar: true, disabled: k === 0, onClick: () => moverNaLista(a, -1) },
                          { label: "Descer", icon: ArrowDown, disabled: k === lista.length - 1, onClick: () => moverNaLista(a, 1) },
                          { label: "Mover para a posição…", icon: ListOrdered, disabled: lista.length < 2 && daMesmaPasta(a).length < 2, onClick: () => setPosicionando(a) },
                          { label: "Editar a transcrição", icon: FileText, onClick: () => router.push(`/estudos/${a.id}?editar=1`) },
                          { label: "Baixar a transcrição (.md)", icon: Download, onClick: () => void baixarAula(a) },
                          { label: feita ? "Voltar para pendente" : "Marcar como concluída", icon: CircleCheck, onClick: () => mudarSituacao(a, feita ? "pendente" : "concluida"), separar: true },
                          { label: "Apagar aula", icon: Trash2, danger: true, separar: true, onClick: () => apagar(a) },
                        ]} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={fecharPreview}>
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center">
              <h2 className="text-lg">Importar {preview.files.length} {preview.files.length === 1 ? "aula" : "aulas"}</h2>
              <button onClick={fecharPreview} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            {preview.files.some((f) => pastasDoArquivo(f, 0).length > 0) && <div className="grid grid-cols-2 gap-1.5">
              <button className={`btn justify-center text-xs ${preview.nivel === 1 ? "border-muted bg-sel" : ""}`} onClick={() => setPreview({ ...preview, nivel: 1 })}>Escolhi a pasta com vários cursos</button>
              <button className={`btn justify-center text-xs ${preview.nivel === 0 ? "border-muted bg-sel" : ""}`} onClick={() => setPreview({ ...preview, nivel: 0 })}>Escolhi a pasta de um curso</button>
            </div>}
            <div className="rounded-lg bg-surface-2 p-3 text-sm space-y-1">
              <label className="flex items-center gap-2 text-xs text-muted mb-1">Vai para:
                <SeletorDePasta ordem={ordem} valor={preview.destino} vazio="Primeiro nível (sem pasta)" onMudar={(destino) => setPreview({ ...preview, destino })} />
              </label>
              {(() => {
                const m = new Map<string, number>();
                for (const f of preview.files) {
                  const k = pastasDoArquivo(f, preview.nivel).join(" › ");
                  m.set(k, (m.get(k) ?? 0) + 1);
                }
                const lista = [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
                return (
                  <>
                    {lista.slice(0, 12).map(([k, n]) => (
                      <div key={k} className="flex justify-between gap-3"><span className="truncate">{k || "(direto na pasta)"}</span><span className="text-muted tabular-nums shrink-0">{n} {n === 1 ? "aula" : "aulas"}</span></div>
                    ))}
                    {lista.length > 12 && <div className="text-xs text-faint">… e mais {lista.length - 12} pastas</div>}
                  </>
                );
              })()}
            </div>
            <p className="text-xs text-muted">O nome de cada aula vem do primeiro “# título” do arquivo (ou do nome do arquivo). Importar de novo atualiza as aulas que já existem, sem duplicar.</p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={fecharPreview}>Cancelar</button>
              <button className="btn btn-primary" onClick={importar}>Importar</button>
            </div>
          </div>
        </div>
      )}

      {novaAberta && <NovaAula ordem={ordem} inicial={pastaSel} onClose={() => setNovaAberta(false)}
        onImportar={(destino) => { setNovaAberta(false); destinoDoImport.current = destino; arquivosRef.current?.click(); }}
        onEmBranco={(destino) => { setNovaAberta(false); void novaAula(destino); }} />}
      {posicionando && (() => {
        const lista = daMesmaPasta(posicionando);
        return <PosicaoDaAula aula={posicionando} atual={lista.findIndex((x) => x.id === posicionando.id) + 1} total={lista.length}
          pasta={chaveDaPasta(posicionando) === SEM_PASTA ? "Sem pasta" : caminhoDaPasta(chaveDaPasta(posicionando), porId)}
          onClose={() => setPosicionando(null)} onMover={(n) => { moverParaPosicao(posicionando, n); setPosicionando(null); }} />;
      })()}
      {nomeando && <NomeDaPasta inicial={nomeando.pasta?.nome ?? ""} titulo={nomeando.pasta ? "Renomear pasta" : nomeando.pai ? `Nova subpasta em “${porId.get(nomeando.pai)?.nome ?? ""}”` : "Nova pasta"}
        onClose={() => setNomeando(null)} onSalvar={salvarNome} />}
      {movendo && <MoverPara ordem={ordem} titulo={movendo.pasta ? `Mover a pasta “${movendo.pasta.nome}”` : `Mover a aula “${movendo.aula?.title}”`}
        proibidas={movendo.pasta ? subarvore(movendo.pasta.id, filhos) : new Set()} atual={movendo.pasta ? movendo.pasta.parent_id : movendo.aula?.pasta_id ?? null}
        raiz={movendo.pasta ? "Primeiro nível" : "Sem pasta"}
        onClose={() => setMovendo(null)}
        onEscolher={(para) => { const m = movendo; setMovendo(null); if (m.pasta) void moverPasta(m.pasta, para); else if (m.aula) void moverAula(m.aula, para); }} />}
      {editando && <EditarAula aula={editando} onClose={() => setEditando(null)}
        onSalvo={(a) => { setEditando(null); setAulas((all) => all?.map((x) => (x.id === a.id ? a : x)).sort(porTitulo) ?? null); }} />}
    </Page>
  );
}

function EditarAula({ aula, onClose, onSalvo }: { aula: Aula; onClose: () => void; onSalvo: (a: Aula) => void }) {
  const [f, setF] = useState({ title: aula.title, professor: aula.professor });
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const sb = supabase();
    const title = f.title.trim() || aula.title;
    const patch: Record<string, string> = { title, professor: f.professor.trim() };
    if (title !== aula.title) {
      // o "# título" do começo da transcrição acompanha o nome novo
      const { data } = await sb.from("notes").select("content").eq("id", aula.id).single();
      const c = (data as { content: string } | null)?.content;
      if (c !== undefined) patch.content = syncHeading(c, aula.title, title);
    }
    await sb.from("notes").update(patch).eq("id", aula.id);
    onSalvo({ ...aula, title, professor: patch.professor });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-6 space-y-3 shadow-2xl">
        <div className="flex justify-between items-center">
          <h2 className="text-lg">Editar aula</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <label className="block"><span className="label">Nome da aula</span>
          <input autoFocus className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="block"><span className="label">Professor</span>
          <input className="input mt-1" value={f.professor} onChange={(e) => setF({ ...f, professor: e.target.value })} /></label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}

function NomeDaPasta({ titulo, inicial, onClose, onSalvar }: { titulo: string; inicial: string; onClose: () => void; onSalvar: (nome: string) => void }) {
  const [nome, setNome] = useState(inicial);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (nome.trim()) onSalvar(nome.trim()); }}
        className="card w-full max-w-sm p-6 space-y-3 shadow-2xl">
        <h2 className="text-lg">{titulo}</h2>
        <input autoFocus className="input" value={nome} placeholder="ex.: Olavo de Carvalho, COF, Módulo 1" onChange={(e) => setNome(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!nome.trim()}>Salvar</button>
        </div>
      </form>
    </div>
  );
}

function MoverPara({ titulo, ordem, proibidas, atual, raiz, onClose, onEscolher }: {
  titulo: string; ordem: { pasta: PastaEstudo; nivel: number }[]; proibidas: Set<string>; atual: string | null; raiz: string;
  onClose: () => void; onEscolher: (para: string | null) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm p-5 space-y-3 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center">
          <h2 className="text-lg truncate">{titulo}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto -mx-2 text-sm">
          <button disabled={atual === null} onClick={() => onEscolher(null)}
            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-sel disabled:opacity-40 disabled:hover:bg-transparent">{raiz}</button>
          {ordem.map(({ pasta, nivel }) => (
            <button key={pasta.id} disabled={proibidas.has(pasta.id) || pasta.id === atual} onClick={() => onEscolher(pasta.id)}
              className="w-full text-left py-1.5 pr-2.5 rounded-lg hover:bg-sel disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-2"
              style={{ paddingLeft: 10 + nivel * 16 }}>
              <FolderOpen size={14} className="text-icon shrink-0" /> <span className="truncate">{pasta.nome}</span>
              {pasta.id === atual && <span className="text-xs text-faint ml-auto">atual</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SeletorDePasta({ ordem, valor, vazio, onMudar }: {
  ordem: { pasta: PastaEstudo; nivel: number }[]; valor: string | null; vazio: string; onMudar: (id: string | null) => void;
}) {
  const porId = new Map(ordem.map((o) => [o.pasta.id, o.pasta]));
  return (
    <select className="input py-1.5 text-sm text-ink flex-1 min-w-0" value={valor ?? ""} onChange={(e) => onMudar(e.target.value || null)}>
      <option value="">{vazio}</option>
      {ordem.map(({ pasta }) => (
        <option key={pasta.id} value={pasta.id}>{caminhoDaPasta(pasta.id, porId)}</option>
      ))}
    </select>
  );
}

function NovaAula({ ordem, inicial, onClose, onImportar, onEmBranco }: {
  ordem: { pasta: PastaEstudo; nivel: number }[]; inicial: string | null; onClose: () => void;
  onImportar: (destino: string | null) => void; onEmBranco: (destino: string | null) => void;
}) {
  const [destino, setDestino] = useState<string | null>(inicial);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex justify-between items-center">
          <h2 className="text-lg">Nova aula</h2>
          <button onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <label className="block"><span className="label">Em qual pasta?</span>
          <div className="mt-1 flex"><SeletorDePasta ordem={ordem} valor={destino} vazio="Primeiro nível (sem pasta)" onMudar={setDestino} /></div></label>
        <button className="w-full card p-4 text-left hover:border-faint transition-colors flex gap-3 items-start" onClick={() => onImportar(destino)}>
          <Upload size={18} className="text-icon mt-0.5 shrink-0" />
          <span>
            <span className="block font-medium">Importar arquivos .md</span>
            <span className="block text-sm text-muted">Escolha uma ou várias transcrições de uma vez. O título vem do “# título” de cada arquivo.</span>
          </span>
        </button>
        <button className="w-full card p-4 text-left hover:border-faint transition-colors flex gap-3 items-start" onClick={() => onEmBranco(destino)}>
          <FileText size={18} className="text-icon mt-0.5 shrink-0" />
          <span>
            <span className="block font-medium">Escrever ou colar o texto</span>
            <span className="block text-sm text-muted">Cria a aula em branco e abre o editor.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function PosicaoDaAula({ aula, atual, total, pasta, onClose, onMover }: {
  aula: Aula; atual: number; total: number; pasta: string; onClose: () => void; onMover: (n: number) => void;
}) {
  const [n, setN] = useState(String(atual));
  const num = Math.round(Number(n));
  const ok = Number.isFinite(num) && num >= 1 && num <= total && num !== atual;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (ok) onMover(num); }}
        className="card w-full max-w-sm p-6 space-y-4 shadow-2xl">
        <div>
          <h2 className="text-lg">Mover para a posição</h2>
          <p className="text-sm text-muted mt-1 truncate">{aula.title}</p>
          <p className="text-xs text-faint truncate">{pasta} · hoje na posição {atual} de {total}</p>
        </div>
        <label className="block"><span className="label">Nova posição (1 a {total})</span>
          <input autoFocus type="number" inputMode="numeric" min={1} max={total} className="input mt-1" value={n} onChange={(e) => setN(e.target.value)} /></label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn text-sm" disabled={atual === 1} onClick={() => onMover(1)}>Primeira</button>
          <button type="button" className="btn text-sm" disabled={atual === total} onClick={() => onMover(total)}>Última</button>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!ok}>Mover</button>
        </div>
      </form>
    </div>
  );
}
