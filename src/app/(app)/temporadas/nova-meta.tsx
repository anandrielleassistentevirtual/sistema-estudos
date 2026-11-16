"use client";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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

/** Uma meta da temporada: livros da Biblioteca, um curso dos Estudos, palavras escritas ou horas numa área. */
export function NovaMeta({ temporadaId, livros, pastas, posicao, onClose, onSalva }: {
  temporadaId: string; livros: Livro[]; pastas: PastaEstudo[]; posicao: number; onClose: () => void; onSalva: (m: Meta) => void;
}) {
  const [tipo, setTipo] = useState<Tipo>("livros");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [pasta, setPasta] = useState("");
  const [alvo, setAlvo] = useState("");
  const [area, setArea] = useState<Area>("idiomas");
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const porId = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);
  const { ordem } = useMemo(() => arvoreDePastas(pastas), [pastas]);
  const dobra = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const achados = busca.trim().length >= 2
    ? livros.filter((b) => b.status !== "lido" && !escolhidos.includes(b.id) && dobra(busca).split(/\s+/).every((w) => dobra(`${b.title} ${b.author ?? ""}`).includes(w))).slice(0, 6) : [];

  const sugestao = tipo === "livros" ? `Ler ${escolhidos.length} ${escolhidos.length === 1 ? "livro" : "livros"}`
    : tipo === "curso" ? (pasta ? `Terminar ${porId.get(pasta)?.nome ?? "o curso"}` : "Terminar o curso")
    : tipo === "palavras" ? `Escrever ${alvo || "N"} palavras`
    : `${alvo || "N"} h de ${AREAS.find((a) => a.id === area)?.nome}`;

  async function salvar() {
    setErro(null);
    const m: Meta = {
      temporada_id: temporadaId, posicao, tipo,
      area: tipo === "livros" ? "leitura" : tipo === "curso" ? "estudos" : tipo === "palavras" ? "escrita" : area,
      titulo: titulo.trim() || sugestao,
      alvo: tipo === "palavras" || tipo === "horas" ? Number(alvo.replace(",", ".")) || 0 : 0,
      refs: tipo === "livros" ? escolhidos : tipo === "curso" ? [pasta] : [],
    };
    if (tipo === "livros" && !escolhidos.length) return setErro("Escolha pelo menos um livro.");
    if (tipo === "curso" && !pasta) return setErro("Escolha o curso.");
    if ((tipo === "palavras" || tipo === "horas") && !m.alvo) return setErro("Diga quanto.");
    const { data, error } = await supabase().from("temporada_metas").insert(m).select().single();
    if (error) return setErro(error.message);
    onSalva(data as Meta);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/45" onClick={onClose}>
      <div className="card w-full max-w-md p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Nova meta da temporada</h2>
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
                      <button className="text-faint hover:text-ink" onClick={() => setEscolhidos((l) => l.filter((x) => x !== id))}><X size={13} /></button>
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
