"use client";
/**
 * Triagem: os livros ainda sem motivo, com um palpite tirado da pasta (CDD). Um clique escolhe o motivo
 * (e o nível que Adler indica para ele); "Aplicar os palpites" faz todos de uma vez.
 */
import { useState } from "react";
import { MOTIVOS_LEITURA, NIVEIS_LEITURA, ORDEM_MOTIVOS, type MotivoLeitura, type NivelLeitura, type Roteiro } from "@/lib/adler";
import { PERFIS, sugerir, type Sugestao } from "@/lib/leitura";
import type { Book } from "@/lib/types";
import { useBiblioteca } from "./dados";
import { Janela } from "./janelas";

/** o nível que acompanha cada motivo quando o livro ainda não tem nível */
const NIVEL_DO_MOTIVO: Record<MotivoLeitura, NivelLeitura> = { entretenimento: "elementar", informacao: "inspecional", conhecimento: "analitica" };

export function Triagem({ onClose }: { onClose: () => void }) {
  const d = useBiblioteca();
  // a lista é montada ao abrir: classificar um livro não o tira da tela (dá para mudar de ideia)
  const [ids] = useState(() => d.livros.filter((b) => !b.motivo_leitura && b.status !== "lido").map((b) => b.id));
  const livros = ids.map((id) => d.porId.get(id)).filter((b): b is Book => !!b);
  const palpite = (b: Book) => sugerir(d.pastaDe(b)?.code);
  const pendentes = livros.filter((b) => !b.motivo_leitura && palpite(b));

  function aplicar(b: Book, motivo: MotivoLeitura, s?: Sugestao | null) {
    const patch: Partial<Book> = { motivo_leitura: motivo };
    if (!b.nivel_leitura) patch.nivel_leitura = s?.motivo === motivo ? s.nivel : NIVEL_DO_MOTIVO[motivo];
    const r = (b.roteiro ?? {}) as Roteiro;
    if (patch.nivel_leitura === "analitica" && s?.variante && s.motivo === motivo && !r.variante) patch.roteiro = { ...r, variante: s.variante };
    void d.atualizar(b, patch);
  }

  return (
    <Janela titulo="Classificar os livros" onClose={onClose} largura="max-w-3xl"
      sub="Por que você lê cada livro? O motivo decide como ele é medido: entretenimento pelo avanço, informação pelo ritmo, conhecimento pelo domínio. O palpite vem da pasta (CDD).">
      {livros.length === 0 ? <p className="text-sm text-muted">Todos os livros já têm motivo.</p> : (
        <ul className="divide-y divide-line -mx-1">
          {livros.map((b) => {
            const s = palpite(b);
            return (
              <li key={b.id} className="px-1 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug truncate">{b.title}</div>
                  <div className="text-xs text-muted truncate">
                    {b.author ?? "Autor desconhecido"}{d.pastaDe(b)?.code ? ` · ${d.pastaDe(b)!.code}` : ""}
                    {s && !b.motivo_leitura && <span className="text-faint"> · palpite: {PERFIS[s.motivo].nome.toLowerCase()} ({s.porque})</span>}
                    {b.motivo_leitura && b.nivel_leitura && <span className="text-faint"> · nível {NIVEIS_LEITURA[b.nivel_leitura].nome.toLowerCase()}</span>}
                  </div>
                </div>
                <div className="seg shrink-0">
                  {ORDEM_MOTIVOS.map((m) => {
                    const escolhido = b.motivo_leitura === m;
                    const sugerido = !b.motivo_leitura && s?.motivo === m;
                    return (
                      <button key={m} aria-pressed={escolhido} title={MOTIVOS_LEITURA[m].descricao} onClick={() => aplicar(b, m, s)}
                        style={escolhido ? { color: PERFIS[m].cor } : sugerido ? { boxShadow: `inset 0 0 0 1px ${PERFIS[m].cor}`, color: PERFIS[m].cor } : undefined}>
                        {PERFIS[m].nome}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
        <span className="text-xs text-faint">O nível (Adler) vem junto: entretenimento → elementar, informação → inspecional, conhecimento → analítico. Dá para mudar na ficha.</span>
        <div className="flex gap-2">
          {pendentes.length > 0 && <button className="btn" onClick={() => pendentes.forEach((b) => { const s = palpite(b)!; aplicar(b, s.motivo, s); })}>Aplicar os {pendentes.length} palpites</button>}
          <button className="btn btn-primary" onClick={onClose}>Pronto</button>
        </div>
      </div>
    </Janela>
  );
}
