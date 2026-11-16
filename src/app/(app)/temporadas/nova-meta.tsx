"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { arvoreDePastas, caminhoDaPasta, type PastaEstudo } from "@/lib/estudos";
import { AREAS, type Area, type Meta } from "@/lib/temporadas";
import type { BookStatus } from "@/lib/types";

export interface Livro { id: string; title: string; author: string | null; word_count: number | null; progress: number; status: BookStatus; format: string }
export interface AulaT { id: string; title: string; pasta_id: string | null; palavras: number; progresso: number; situacao: "pendente" | "lendo" | "concluida" }

type Tipo = Meta["tipo"];
const TIPOS: { id: Tipo; nome: string; exemplo: string }[] = [
  { id: "livros", nome: "Livros", exemplo: "ler estes livros" },
  { id: "curso", nome: "Curso", exemplo: "terminar um curso" },
  { id: "palavras", nome: "Escrita", exemplo: "escrever N palavras" },
  { id: "horas", nome: "Horas", exemplo: "N horas numa área" },
];

function nomeAutomatico(tipo: Tipo, livros: number, curso: string | undefined, alvo: string, area: Area) {
  return tipo === "livros" ? `Ler ${livros} ${livros === 1 ? "livro" : "livros"}`
    : tipo === "curso" ? `Terminar ${curso ?? "o curso"}`
    : tipo === "palavras" ? `Escrever ${alvo || "N"} palavras`
    : `${alvo || "N"} h de ${AREAS.find((a) => a.id === area)?.nome}`;
}

/** Uma meta da temporada: livros da Biblioteca, um curso dos Estudos, palavras escritas ou horas numa área. */
export function NovaMeta({ temporadaId, livros, pastas, posicao, onClose, onSalva, editar }: {
  temporadaId: string; livros: Livro[]; pastas: PastaEstudo[]; posicao: number; onClose: () => void; onSalva: (m: Meta) => void;
  /** meta existente: o formulário vem preenchido e salva por cima */
  editar?: Meta;
}) {
  const [tipo, setTipo] = useState<Tipo>(editar?.tipo ?? "livros");
  const [escolhidos, setEscolhidos] = useState<string[]>(editar?.tipo === "livros" ? editar.refs : []);
  const [busca, setBusca] = useState("");
  const [pasta, setPasta] = useState(editar?.tipo === "curso" ? editar.refs[0] ?? "" : "");
  const [alvo, setAlvo] = useState(editar && (editar.tipo === "palavras" || editar.tipo === "horas") ? String(editar.alvo) : "");
  const [area, setArea] = useState<Area>(editar?.tipo === "horas" ? editar.area : "idiomas");
  // um nome que era o automático continua automático (acompanha os livros, o alvo…)
  const [titulo, setTitulo] = useState(() => {
    if (!editar) return "";
    const auto = nomeAutomatico(editar.tipo, editar.refs.length, editar.tipo === "curso" ? pastas.find((p) => p.id === editar.refs[0])?.nome : undefined, String(editar.alvo), editar.area);
    return editar.titulo === auto ? "" : editar.titulo;
  });
  const [erro, setErro] = useState<string | null>(null);
  const porId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);
  const { ordem } = useMemo(() => arvoreDePastas(pastas), [pastas]);
  const dobra = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const achados = busca.trim().length >= 2
    ? livros.filter((b) => b.status !== "lido" && !escolhidos.includes(b.id) && dobra(busca).split(/\s+/).every((w) => dobra(`${b.title} ${b.author ?? ""}`).includes(w))).slice(0, 6) : [];

  const sugestao = nomeAutomatico(tipo, escolhidos.length, pasta ? porId.get(pasta)?.nome : undefined, alvo, area);

  async function salvar() {
    setErro(null);
    const m: Meta = {
      temporada_id: temporadaId, posicao: editar?.posicao ?? posicao, tipo,
      area: tipo === "livros" ? "leitura" : tipo === "curso" ? "estudos" : tipo === "palavras" ? "escrita" : area,
      titulo: titulo.trim() || sugestao,
      alvo: tipo === "palavras" || tipo === "horas" ? Number(alvo.replace(",", ".")) || 0 : 0,
      refs: tipo === "livros" ? escolhidos : tipo === "curso" ? [pasta] : [],
    };
    if (tipo === "livros" && !escolhidos.length) return setErro("Escolha pelo menos um livro.");
    if (tipo === "curso" && !pasta) return setErro("Escolha o curso.");
    if ((tipo === "palavras" || tipo === "horas") && !m.alvo) return setErro("Diga quanto.");
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
          {TIPOS.map((x) => (
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

        {tipo === "curso" && (
          <label className="block text-sm"><span className="label">Curso (pasta dos Estudos)</span>
            <select className="input mt-1" value={pasta} onChange={(e) => setPasta(e.target.value)}>
              <option value="">Escolha…</option>
              {ordem.map(({ pasta: p }) => <option key={p.id} value={p.id}>{caminhoDaPasta(p.id, porId)}</option>)}
            </select></label>
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
