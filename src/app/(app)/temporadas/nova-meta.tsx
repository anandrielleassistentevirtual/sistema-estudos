"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { arvoreDePastas, caminhoDaPasta, faltam, subarvore, type PastaEstudo } from "@/lib/estudos";
import { nf } from "@/lib/dates";
import { AREAS, type Area, type Meta } from "@/lib/temporadas";
import type { BookStatus } from "@/lib/types";

export interface Livro { id: string; title: string; author: string | null; word_count: number | null; progress: number; status: BookStatus; format: string }
export interface AulaT { id: string; title: string; pasta_id: string | null; palavras: number; progresso: number; situacao: "pendente" | "lendo" | "concluida"; ordem?: number | null }
export interface BaralhoT { nome: string; total: number }

type Tipo = "livros" | "aulas" | "anki" | "palavras" | "horas" | "contagem";
type Medida = NonNullable<Meta["medida"]>;
const TIPOS: { id: Tipo; nome: string; exemplo: string }[] = [
  { id: "livros", nome: "Livros", exemplo: "ler estes livros" },
  { id: "aulas", nome: "Aulas", exemplo: "fazer estas aulas" },
  { id: "anki", nome: "Anki", exemplo: "um baralho chegar a N cartões" },
  { id: "palavras", nome: "Escrita", exemplo: "escrever N palavras" },
  { id: "horas", nome: "Horas", exemplo: "N horas numa área" },
  { id: "contagem", nome: "Contagem", exemplo: "N coisas até uma data (ex.: 28 aulas em 14 dias)" },
];
const MEDIDAS: { id: Medida; nome: string; dica: string }[] = [
  { id: "total", nome: "Total no baralho", dica: "o baralho chega a N cartões" },
  { id: "criados", nome: "Cartões novos", dica: "criar N cartões na temporada" },
  { id: "revisoes", nome: "Revisões", dica: "fazer N revisões na temporada" },
];

function nomeAutomatico(tipo: Tipo, n: number, alvo: string, area: Area, baralho: string, medida: Medida, unidade = "", prazo = "") {
  const N = alvo ? nf.format(Number(alvo)) : "N";
  if (tipo === "contagem") return `${N} ${unidade || "itens"}${prazo ? ` até ${prazo.slice(8, 10)}/${prazo.slice(5, 7)}` : ""}`;
  return tipo === "livros" ? `Ler ${n} ${n === 1 ? "livro" : "livros"}`
    : tipo === "aulas" ? `Fazer ${n} ${n === 1 ? "aula" : "aulas"}`
    : tipo === "anki" ? (medida === "total" ? `${baralho || "Baralho"} com ${N} cartões` : medida === "criados" ? `${N} cartões novos em ${baralho || "…"}` : `${N} revisões em ${baralho || "…"}`)
    : tipo === "palavras" ? `Escrever ${N} palavras`
    : `${alvo || "N"} h de ${AREAS.find((a) => a.id === area)?.nome}`;
}

/** Uma meta da temporada: livros da Biblioteca, aulas dos Estudos, um baralho do Anki, palavras escritas ou horas numa área. */
export function NovaMeta({ temporadaId, livros, pastas, aulas, baralhos, posicao, onClose, onSalva, editar, soContagem, fimPadrao }: {
  temporadaId: string; livros: Livro[]; pastas: PastaEstudo[]; aulas: AulaT[]; baralhos: BaralhoT[]; posicao: number;
  /** já há 3 metas: só cabe uma reta curta de contagem */
  soContagem?: boolean;
  /** prazo sugerido para a contagem */
  fimPadrao?: string;
  onClose: () => void; onSalva: (m: Meta) => void;
  /** meta existente: o formulário vem preenchido e salva por cima */
  editar?: Meta;
}) {
  const porId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);
  const { ordem, filhos } = useMemo(() => arvoreDePastas(pastas), [pastas]);
  const daPasta = (id: string) => { const d = subarvore(id, filhos); return aulas.filter((a) => a.pasta_id && d.has(a.pasta_id)); };

  // metas antigas de "curso" (a pasta inteira) viram aulas escolhidas: as pendentes daquela pasta
  const ini = useMemo(() => {
    if (editar?.tipo === "curso") {
      const p = editar.refs[0] ?? "";
      return { tipo: "aulas" as Tipo, pasta: p, aulas: daPasta(p).filter((a) => a.situacao !== "concluida").map((a) => a.id) };
    }
    if (editar?.tipo === "aulas") return { tipo: "aulas" as Tipo, pasta: aulas.find((a) => a.id === editar.refs[0])?.pasta_id ?? "", aulas: editar.refs };
    return { tipo: (editar?.tipo ?? (soContagem ? "contagem" : "livros")) as Tipo, pasta: "", aulas: [] as string[] };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [tipo, setTipo] = useState<Tipo>(ini.tipo);
  const [escolhidos, setEscolhidos] = useState<string[]>(editar?.tipo === "livros" ? editar.refs : []);
  const [busca, setBusca] = useState("");
  const [pasta, setPasta] = useState(ini.pasta);
  const [aulasSel, setAulasSel] = useState<string[]>(ini.aulas);
  const [baralho, setBaralho] = useState(editar?.tipo === "anki" ? editar.refs[0] ?? "" : baralhos[0]?.nome ?? "");
  const [medida, setMedida] = useState<Medida>(editar?.medida ?? "total");
  const [alvo, setAlvo] = useState(editar && ["palavras", "horas", "anki", "contagem"].includes(editar.tipo) ? String(editar.alvo) : "");
  const [unidade, setUnidade] = useState(editar?.unidade ?? "aulas");
  const [prazo, setPrazo] = useState(editar?.prazo ?? fimPadrao ?? "");
  const [area, setArea] = useState<Area>(editar?.tipo === "horas" ? editar.area : "idiomas");
  // um nome que era o automático continua automático (acompanha os livros, o alvo…)
  const [titulo, setTitulo] = useState(() => {
    if (!editar || editar.tipo === "curso") return "";
    const auto = nomeAutomatico(editar.tipo as Tipo, editar.refs.length, String(editar.alvo), editar.area, editar.refs[0] ?? "", editar.medida ?? "total", editar.unidade ?? "", editar.prazo ?? "");
    return editar.titulo === auto ? "" : editar.titulo;
  });
  const [erro, setErro] = useState<string | null>(null);

  const dobra = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const achados = busca.trim().length >= 2
    ? livros.filter((b) => b.status !== "lido" && !escolhidos.includes(b.id) && dobra(busca).split(/\s+/).every((w) => dobra(`${b.title} ${b.author ?? ""}`).includes(w))).slice(0, 6) : [];
  const [buscaAula, setBuscaAula] = useState("");
  const [soEscolhidas, setSoEscolhidas] = useState(false);
  // a lista: do curso escolhido (ou de todos), filtrada pela busca; "só as escolhidas" mostra o que já marcou
  const listaAulas = (soEscolhidas ? aulas.filter((a) => aulasSel.includes(a.id)) : pasta ? daPasta(pasta) : buscaAula.trim().length >= 2 ? aulas : [])
    .filter((a) => !buscaAula.trim() || dobra(buscaAula).split(/\s+/).every((w) => dobra(a.title).includes(w)));
  const palavrasAulas = aulas.filter((a) => aulasSel.includes(a.id)).reduce((n, a) => n + faltam(a), 0);
  const totalBaralho = baralhos.find((b) => b.nome === baralho)?.total;

  const n = tipo === "livros" ? escolhidos.length : aulasSel.length;
  const sugestao = nomeAutomatico(tipo, n, alvo, area, baralho, medida, unidade, prazo);

  function escolherPasta(id: string) {
    setPasta(id);
    setSoEscolhidas(false);
  }

  async function salvar() {
    setErro(null);
    const m: Meta = {
      temporada_id: temporadaId, posicao: editar?.posicao ?? posicao, tipo,
      area: tipo === "livros" ? "leitura" : tipo === "aulas" ? "estudos" : tipo === "anki" ? "idiomas" : tipo === "palavras" ? "escrita" : area,
      ...(tipo === "contagem" ? { prazo: prazo || null, unidade: unidade.trim() || "itens" } : {}),
      titulo: titulo.trim() || sugestao,
      alvo: ["palavras", "horas", "anki", "contagem"].includes(tipo) ? Number(alvo.replace(/\./g, "").replace(",", ".")) || 0 : 0,
      // as aulas ficam na ordem do curso
      refs: tipo === "livros" ? escolhidos : tipo === "aulas" ? aulas.filter((a) => aulasSel.includes(a.id)).map((a) => a.id) : tipo === "anki" ? [baralho]
        : tipo === "contagem" ? (editar?.tipo === "contagem" ? editar.refs : []) : [],
      medida: tipo === "anki" ? medida : null,
    };
    if (tipo === "livros" && !escolhidos.length) return setErro("Escolha pelo menos um livro.");
    if (tipo === "aulas" && !aulasSel.length) return setErro("Marque pelo menos uma aula.");
    if (tipo === "anki" && !baralho) return setErro("Escolha o baralho.");
    if (["palavras", "horas", "anki", "contagem"].includes(tipo) && !m.alvo) return setErro("Diga quanto.");
    if (tipo === "contagem" && !prazo) return setErro("Diga até quando.");
    const sb = supabase();
    const { data, error } = editar?.id
      ? await sb.from("temporada_metas").update(m).eq("id", editar.id).select().single()
      : await sb.from("temporada_metas").insert(m).select().single();
    if (error) return setErro(error.message);
    onSalva(data as Meta);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/45" onClick={onClose}>
      <div className="card w-full max-w-md p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{editar ? "Editar a meta" : "Nova meta da temporada"}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.filter((x) => !soContagem || x.id === "contagem").map((x) => (
            <button key={x.id} onClick={() => setTipo(x.id)} title={x.exemplo}
              className={`text-xs rounded-full px-3 py-1 border ${tipo === x.id ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}>{x.nome}</button>
          ))}
        </div>

        {tipo === "livros" && (
          <div className="space-y-2 text-sm">
            <span className="label">Livros da Biblioteca, na ordem em que vai ler</span>
            {escolhidos.length > 0 && (
              <ol className="space-y-1">
                {escolhidos.map((id, i) => {
                  const b = livros.find((x) => x.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5">
                      <span className="truncate">{i + 1}. {b?.title}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <button className="text-faint hover:text-ink disabled:opacity-30" title="Ler antes" disabled={i === 0}
                          onClick={() => setEscolhidos((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}><ChevronUp size={14} /></button>
                        <button className="text-faint hover:text-ink disabled:opacity-30" title="Ler depois" disabled={i === escolhidos.length - 1}
                          onClick={() => setEscolhidos((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}><ChevronDown size={14} /></button>
                        <button className="text-faint hover:text-ink" title="Tirar da meta" onClick={() => setEscolhidos((l) => l.filter((x) => x !== id))}><X size={13} /></button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="relative">
              <label className="input flex items-center gap-2 py-1.5">
                <Search size={14} className="text-faint" />
                <input className="bg-transparent outline-none flex-1 min-w-0" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou autor" />
              </label>
              {achados.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 card shadow-xl py-1">
                  {achados.map((b) => (
                    <button key={b.id} className="w-full text-left px-3 py-1.5 hover:bg-sel" onClick={() => { setEscolhidos((l) => [...l, b.id]); setBusca(""); }}>
                      <span className="block truncate">{b.title}</span>
                      <span className="block truncate text-xs text-muted">{b.author}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tipo === "aulas" && (
          <div className="space-y-2 text-sm">
            <label className="block"><span className="label">Curso (pasta dos Estudos)</span>
              <select className="input mt-1" value={pasta} onChange={(e) => escolherPasta(e.target.value)}>
                <option value="">Todos os cursos (busque pelo nome)</option>
                {ordem.map(({ pasta: p }) => <option key={p.id} value={p.id}>{caminhoDaPasta(p.id, porId)} · {daPasta(p.id).length}</option>)}
              </select></label>
            <label className="input flex items-center gap-2 py-1.5">
              <Search size={14} className="text-faint" />
              <input className="bg-transparent outline-none flex-1 min-w-0" value={buscaAula} onChange={(e) => setBuscaAula(e.target.value)}
                placeholder={pasta ? "Filtrar as aulas deste curso" : "Buscar aula pelo nome (ex.: COF 12)"} />
            </label>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Marque as aulas que vai fazer nesta temporada</span>
              <span className="flex gap-2">
                {pasta && !soEscolhidas && (
                  <button className="hover:text-ink" title="Marca todas as pendentes que estão na lista"
                    onClick={() => setAulasSel((l) => [...new Set([...l, ...listaAulas.filter((a) => a.situacao !== "concluida").map((a) => a.id)])])}>marcar pendentes</button>
                )}
                {aulasSel.length > 0 && <button className="hover:text-ink" onClick={() => setAulasSel([])}>limpar</button>}
              </span>
            </div>
            {(pasta || soEscolhidas || buscaAula.trim().length >= 2) && (
              <ul className="max-h-56 overflow-y-auto rounded-md border border-line divide-y divide-line">
                {listaAulas.length === 0 && <li className="px-2.5 py-2 text-muted">Nenhuma aula encontrada.</li>}
                {listaAulas.slice(0, 400).map((a) => {
                  const feita = a.situacao === "concluida";
                  return (
                    <li key={a.id}>
                      <label className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-sel ${feita ? "text-faint" : ""}`}>
                        <input type="checkbox" checked={aulasSel.includes(a.id)}
                          onChange={(e) => setAulasSel((l) => (e.target.checked ? [...l, a.id] : l.filter((x) => x !== a.id)))} />
                        <span className="truncate flex-1">{a.title}</span>
                        <span className="text-xs text-muted shrink-0 tabular-nums">
                          {feita ? "✓ feita" : a.situacao === "lendo" ? `${Math.round((a.progresso || 0) * 100)}%` : a.palavras ? `${nf.format(a.palavras)} pal.` : ""}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {aulasSel.length > 0 && (
              <p className="text-xs text-muted flex items-center justify-between gap-2">
                <span>{aulasSel.length} {aulasSel.length === 1 ? "aula escolhida" : "aulas escolhidas"} · faltam {nf.format(palavrasAulas)} palavras</span>
                <button className="hover:text-ink underline-offset-2 hover:underline" onClick={() => setSoEscolhidas((v) => !v)}>{soEscolhidas ? "ver o curso" : "ver só as escolhidas"}</button>
              </p>
            )}
          </div>
        )}

        {tipo === "anki" && (
          <div className="space-y-3 text-sm">
            <label className="block"><span className="label">Baralho</span>
              {baralhos.length ? (
                <select className="input mt-1" value={baralho} onChange={(e) => setBaralho(e.target.value)}>
                  {baralhos.map((b) => <option key={b.nome} value={b.nome}>{b.nome} · {nf.format(b.total)} cartões</option>)}
                </select>
              ) : (
                <input className="input mt-1" value={baralho} onChange={(e) => setBaralho(e.target.value)} placeholder="ex.: English" />
              )}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MEDIDAS.map((x) => (
                <button key={x.id} onClick={() => setMedida(x.id)} title={x.dica}
                  className={`text-xs rounded-full px-3 py-1 border ${medida === x.id ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}>{x.nome}</button>
              ))}
            </div>
            <label className="block"><span className="label">
              {medida === "total" ? "O baralho chega a (cartões)" : medida === "criados" ? "Cartões novos na temporada" : "Revisões na temporada"}</span>
              <input className="input mt-1" inputMode="numeric" value={alvo} onChange={(e) => setAlvo(e.target.value.replace(/\D/g, ""))}
                placeholder={medida === "total" && totalBaralho ? `hoje: ${nf.format(totalBaralho)}` : "ex.: 500"} /></label>
            {medida === "total" && totalBaralho !== undefined && <p className="text-xs text-muted">Hoje o baralho tem {nf.format(totalBaralho)} cartões.</p>}
          </div>
        )}

        {tipo === "contagem" && (
          <div className="space-y-3 text-sm">
            {soContagem && <p className="text-xs text-muted">A temporada já tem 3 metas; cabe ainda uma reta curta de contagem.</p>}
            <div className="grid grid-cols-3 gap-3">
              <label className="block"><span className="label">Quantas</span>
                <input className="input mt-1" inputMode="numeric" value={alvo} onChange={(e) => setAlvo(e.target.value.replace(/\D/g, ""))} placeholder="ex.: 28" /></label>
              <label className="block"><span className="label">O quê</span>
                <input className="input mt-1" value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="aulas" /></label>
              <label className="block"><span className="label">Até</span>
                <input type="date" className="input mt-1" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
            </div>
            <label className="block"><span className="label">Área</span>
              <select className="input mt-1" value={area} onChange={(e) => setArea(e.target.value as Area)}>
                {AREAS.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select></label>
            <p className="text-xs text-muted">Cada dia você marca o que fez com “+1”; a meta mostra se está em dia e quanto precisa por dia.</p>
          </div>
        )}

        {tipo === "palavras" && (
          <label className="block text-sm"><span className="label">Palavras a escrever na temporada</span>
            <input className="input mt-1" inputMode="numeric" value={alvo} onChange={(e) => setAlvo(e.target.value.replace(/\D/g, ""))} placeholder="ex.: 30000" /></label>
        )}

        {tipo === "horas" && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="block"><span className="label">Área</span>
              <select className="input mt-1" value={area} onChange={(e) => setArea(e.target.value as Area)}>
                {AREAS.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select></label>
            <label className="block"><span className="label">Horas na temporada</span>
              <input className="input mt-1" inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="ex.: 40" /></label>
          </div>
        )}

        <label className="block text-sm"><span className="label">Nome da meta (opcional)</span>
          <input className="input mt-1" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={sugestao} /></label>
        {erro && <p className="text-sm text-critical">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void salvar()}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
