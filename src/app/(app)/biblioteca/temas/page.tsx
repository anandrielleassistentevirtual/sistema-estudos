"use client";
/**
 * Temas: a leitura sintópica. Cada tema reúne os livros que tratam de um mesmo assunto (a bibliografia);
 * ler sintopicamente é fazer esses autores conversarem. (Substitui as antigas "obras de consulta".)
 */
import { useMemo } from "react";
import { Network, Pencil, Plus, Sparkles } from "lucide-react";
import { Empty } from "@/components/page";
import { RowMenu } from "@/components/row-menu";
import { NIVEIS_LEITURA, progressoDoRoteiro, type Roteiro } from "@/lib/adler";
import { palavrasCurto, pct } from "@/lib/leitura";
import { progressoDoLivro, type Book } from "@/lib/types";
import { useBiblioteca } from "@/components/biblioteca/dados";
import { LivroLinha } from "@/components/biblioteca/linha";
import { BibliotecaPagina } from "@/components/biblioteca/painel";
import { BarraMarcos } from "@/components/biblioteca/visual";

const COR = "var(--area-estudos)";

export default function Temas() {
  const d = useBiblioteca();
  const temas = useMemo(() => {
    const m = new Map<string, Book[]>();
    for (const b of d.livros) if (b.tema?.trim()) m.set(b.tema.trim(), [...(m.get(b.tema.trim()) ?? []), b]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [d.livros]);

  // sugestões: pastas com dois ou mais livros ainda sem tema (os livros de uma mesma pasta costumam tratar do mesmo assunto)
  const sugestoes = useMemo(() => {
    const m = new Map<string, Book[]>();
    for (const b of d.livros) if (b.folder_id && !b.tema) m.set(b.folder_id, [...(m.get(b.folder_id) ?? []), b]);
    return [...m.entries()].filter(([, l]) => l.length >= 2).map(([fid, l]) => ({ pasta: d.pastas.find((f) => f.id === fid), livros: l }))
      .filter((x) => x.pasta).sort((a, b) => b.livros.length - a.livros.length).slice(0, 6);
  }, [d.livros, d.pastas]);

  return (
    <BibliotecaPagina actions={<button className="btn btn-primary" onClick={() => d.abrir({ tipo: "tema" })}><Plus size={15} /> Novo tema</button>}>
      <div className="card p-4 sm:p-5 mb-6 flex gap-4 items-start" style={{ background: `color-mix(in srgb, ${COR} 6%, var(--surface))` }}>
        <Network size={20} className="shrink-0 mt-0.5" style={{ color: COR }} />
        <div className="text-sm leading-relaxed">
          <b className="font-semibold">Leitura sintópica</b> (Adler): ler muitos livros sobre um mesmo assunto, ordenando-os em relação a ele.
          Primeiro a bibliografia e uma inspeção de cada livro; depois, achar as passagens, pôr os autores em acordo nos termos,
          esclarecer as questões, as divergências — e chegar a uma análise que não está em nenhum deles.
          <span className="block text-muted mt-1">Para conduzir a leitura, abra a ficha de um livro do tema e escolha o nível <b className="text-ink font-medium">sintópico</b>: o roteiro das duas partes fica lá.</span>
        </div>
      </div>

      {!d.carregado ? <p className="text-sm text-muted">Carregando…</p> : (
        <>
          {temas.length === 0 && (
            <Empty icone={Network}>Nenhum tema ainda. Crie um assunto (por exemplo, “o método de estudo”) e marque os livros que falam dele.</Empty>
          )}
          <div className="space-y-4">
            {temas.map(([tema, livros]) => {
              const total = livros.reduce((a, b) => a + (b.word_count ?? 0), 0);
              const lidas = livros.reduce((a, b) => a + (b.word_count ?? 0) * progressoDoLivro(b), 0);
              const condutor = livros.find((b) => b.nivel_leitura === "sintopica");
              const roteiro = condutor ? progressoDoRoteiro("sintopica", (condutor.roteiro as Roteiro) ?? {}) : null;
              const inspecionados = livros.filter((b) => b.nivel_leitura && b.nivel_leitura !== "elementar" && b.status !== "aguardando").length;
              return (
                <article key={tema} className="card overflow-hidden">
                  <div className="p-4 sm:p-5 flex flex-wrap items-start gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <div className="eyebrow">Tema</div>
                      <h2 className="text-lg font-semibold tracking-tight mt-0.5">{tema}</h2>
                      <p className="text-xs text-muted mt-1 tabular-nums">{livros.length} {livros.length === 1 ? "livro" : "livros"} na bibliografia · {inspecionados} já {inspecionados === 1 ? "começado" : "começados"} · {palavrasCurto(lidas)} de {palavrasCurto(total)} palavras</p>
                    </div>
                    <div className="w-full sm:w-64 space-y-2.5">
                      <Medida nome="Bibliografia lida" valor={total ? lidas / total : 0} />
                      <Medida nome={`Roteiro sintópico${condutor ? "" : " (escolha o nível sintópico num livro)"}`} valor={roteiro ? roteiro.feitas / Math.max(1, roteiro.total) : null} />
                    </div>
                    <RowMenu items={[{ label: "Editar tema e livros", icon: Pencil, onClick: () => d.abrir({ tipo: "tema", tema }) }]} />
                  </div>
                  <div className="border-t border-line divide-y divide-line">
                    {livros.map((b) => <LivroLinha key={b.id} livro={b} />)}
                  </div>
                  {condutor && <p className="px-5 py-2 border-t border-line text-[11.5px] text-muted">O roteiro deste tema está em “{condutor.title}” (nível {NIVEIS_LEITURA.sintopica.nome.toLowerCase()}).</p>}
                </article>
              );
            })}
          </div>

          {sugestoes.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[1.0625rem] font-semibold tracking-tight flex items-center gap-2"><Sparkles size={16} style={{ color: COR }} /> Temas possíveis</h2>
              <p className="text-xs text-muted mt-0.5 mb-3">Pastas com vários livros ainda sem tema: livros da mesma pasta costumam conversar sobre o mesmo assunto.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {sugestoes.map(({ pasta, livros }) => (
                  <button key={pasta!.id} onClick={() => d.abrir({ tipo: "tema", tema: pasta!.name, ids: livros.map((b) => b.id) })}
                    className="card card-hover p-4 text-left">
                    <div className="text-sm font-medium">{pasta!.code && <span className="font-mono text-xs mr-1.5">{pasta!.code}</span>}{pasta!.name}</div>
                    <div className="text-xs text-muted mt-1 line-clamp-2">{livros.map((b) => b.title).join(" · ")}</div>
                    <div className="text-xs mt-2" style={{ color: COR }}>Criar tema com {livros.length} livros →</div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </BibliotecaPagina>
  );
}

function Medida({ nome, valor }: { nome: string; valor: number | null }) {
  return (
    <div>
      <div className="flex justify-between text-[11.5px] mb-1"><span className="text-muted truncate">{nome}</span><span className="tabular-nums">{valor === null ? "—" : pct(valor)}</span></div>
      <BarraMarcos valor={valor ?? 0} cor={COR} />
    </div>
  );
}
