"use client";
/**
 * Ficha do livro: tudo sobre um livro numa tela. À esquerda, como ele está (avanço, tempo, ritmo, marcas, domínio
 * e retenção); à direita, como lê-lo (motivo, nível e o roteiro de Adler).
 */
import { BookOpen, Brain, Download, Pencil, Play, Rows3, X } from "lucide-react";
import { Cover } from "@/components/cover";
import { OPCOES_LIVRO, StatusPill } from "@/components/status-pill";
import { RoteiroLeitura } from "@/components/roteiro-leitura";
import { saveBookFile } from "@/lib/books";
import { dayKey, fmtDayLong, fmtDuration, nf } from "@/lib/dates";
import { NOTAS_RECORDAR, PERFIS, dominioDe, faixaDe, perfilDe, perguntasDe, recordarDe, recordarHoje } from "@/lib/leitura";
import { progressoDoLivro, type Book } from "@/lib/types";
import { faltaDe, useBiblioteca } from "./dados";
import { Anel, EtiquetaPerfil, Selos } from "./visual";

export function Ficha({ livro: b }: { livro: Book }) {
  const d = useBiblioteca();
  const fechar = () => d.abrir(null);
  const perfil = perfilDe(b);
  const cor = perfil ? PERFIS[perfil].cor : "var(--area-leitura)";
  const p = progressoDoLivro(b);
  const uso = d.uso.get(b.id);
  const marcas = d.marcas.get(b.id) ?? 0;
  const ritmo = uso && uso.segundos > 120 ? Math.round(uso.palavras / (uso.segundos / 60)) : null;
  const falta = faltaDe(b);
  const dom = dominioDe(b, marcas);
  const pasta = d.pastaDe(b);
  const onde = d.lugar.get(b.id);
  const rec = recordarDe(b);
  const perguntas = perguntasDe(b).length;
  const lidas = (b.word_count ?? 0) * p;

  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-0 sm:p-4 bg-black/45" onClick={fechar}>
      <div className="card w-full max-w-5xl h-[100dvh] sm:h-[min(92vh,860px)] overflow-hidden shadow-2xl flex flex-col md:flex-row !rounded-none sm:!rounded-xl"
        onClick={(e) => e.stopPropagation()}>
        {/* ── como o livro está ── */}
        <section className="flex-1 min-w-0 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-4">
            <Cover book={b} url={d.capas[b.id]} className="w-20 h-[116px] sm:w-24 sm:h-36" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-xl font-semibold tracking-tight leading-snug">{b.title}</h2>
                <button onClick={fechar} className="modal-close shrink-0 md:hidden" aria-label="Fechar"><X size={18} /></button>
              </div>
              <p className="text-sm text-muted mt-0.5">{b.author ?? "Autor desconhecido"}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <EtiquetaPerfil livro={b} />
                {pasta && <span className="chip" title="Pasta (CDD)">{pasta.code && <b className="font-mono font-medium text-ink">{pasta.code}</b>} {pasta.name}</span>}
                {onde
                  ? <span className="chip" title="Mesa do plano">Mesa {onde.mesaN} · {onde.mesa.titulo} · nº {onde.n}</span>
                  : <button className="chip border border-dashed border-line bg-transparent hover:text-ink" onClick={() => d.abrir({ tipo: "na-mesa", id: b.id })}><Rows3 size={11} /> pôr numa mesa</button>}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button className="btn btn-primary py-1.5" onClick={() => { fechar(); d.ler(b); }}>
                  {b.status === "lendo" ? <><Play size={14} /> Continuar</> : <><BookOpen size={14} /> {b.format === "fisico" ? "Ler (Timer)" : "Abrir no leitor"}</>}
                </button>
                <StatusPill label="Status do livro" value={b.status} options={OPCOES_LIVRO} onChange={(st) => void d.atualizar(b, { status: st })} />
                <button className="btn btn-ghost py-1.5 px-2" title="Editar título, autor, pasta e capa" onClick={() => d.abrir({ tipo: "editar", id: b.id })}><Pencil size={14} /></button>
                {b.format !== "fisico" && <button className="btn btn-ghost py-1.5 px-2" title="Baixar o arquivo" onClick={() => void saveBookFile(b)}><Download size={14} /></button>}
              </div>
            </div>
          </div>

          {/* números do livro */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Numero rotulo="Avanço" valor={`${Math.round(p * 100)}%`}
              dica={b.status === "lido" ? `lido${b.finished_at ? ` em ${new Date(b.finished_at).toLocaleDateString("pt-BR")}` : ""}`
                : b.format === "fisico" && b.total_pages ? `p. ${b.current_page ?? 0} de ${b.total_pages}`
                : falta ? `faltam ≈ ${fmtDuration((falta / d.ppm) * 60)}` : "—"}>
              <div className="h-1 rounded-full bg-surface-2 mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: cor }} /></div>
            </Numero>
            <Numero rotulo="Tempo investido" valor={uso?.segundos ? fmtDuration(uso.segundos) : "—"} dica={uso?.palavras ? `${nf.format(uso.palavras)} palavras no leitor` : "no leitor e no Timer"} />
            <Numero rotulo="Ritmo neste livro" valor={ritmo ? `${ritmo} ppm` : "—"}
              dica={ritmo ? (ritmo < d.ppm * 0.8 ? `mais devagar que o seu normal (${d.ppm})` : ritmo > d.ppm * 1.2 ? `mais rápido que o seu normal (${d.ppm})` : `perto do seu normal (${d.ppm})`) : `seu normal: ${d.ppm} ppm`} />
            <Numero rotulo="Marcas" valor={nf.format(marcas)}
              dica={marcas && lidas > 1000 ? `1 a cada ${nf.format(Math.round(lidas / marcas / 100) * 100)} palavras` : "destaques e notas literárias"} />
          </div>

          {/* domínio: só faz sentido para conhecimento */}
          {perfil === "conhecimento" || b.nivel_leitura === "analitica" || b.nivel_leitura === "sintopica" ? (
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-4">
                <Anel valor={dom.total} cor={cor} tamanho={72} espessura={6}>
                  <span className="text-base font-semibold tabular-nums">{dom.total === null ? "—" : `${Math.round(dom.total * 100)}%`}</span>
                </Anel>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="card-title">Domínio</h3>
                    {dom.total !== null && <span className="chip font-medium" style={{ color: cor }}>{faixaDe(dom.total).nome}</span>}
                  </div>
                  <p className="text-xs text-muted mt-0.5 leading-snug">Num livro denso, a velocidade não diz nada: diz o quanto você entendeu, conversou com o autor e ainda lembra.</p>
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                <Componente nome="Compreensão" peso="50%" valor={dom.compreensao} cor={cor} dica={b.nivel_leitura ? "etapas do roteiro cumpridas (ao lado)" : "escolha o nível de leitura ao lado"} />
                <Componente nome="Retenção" peso="30%" valor={dom.retencao} cor={cor} dica={perguntas ? (rec ? "média das três últimas recordações" : "ainda não recordou") : "responda perguntas do roteiro para poder recordar"} />
                <Componente nome="Diálogo" peso="20%" valor={dom.dialogo} cor={cor} dica={lidas > 500 ? "uma marca a cada 3 mil palavras lidas = 100%" : "começa a contar quando você lê"} />
              </div>
            </div>
          ) : perfil === "informacao" ? (
            <Explica cor={cor} texto={`Livro de informação: o que importa é o ritmo e o quanto falta. ${ritmo ? `Aqui você lê a ${ritmo} ppm.` : "O ritmo aparece quando você ler no leitor."}`} />
          ) : perfil === "entretenimento" ? (
            <Explica cor={cor} texto="Livro de entretenimento: só o avanço conta. Boa leitura." />
          ) : (
            <Explica cor="var(--muted)" texto="Escolha ao lado por que você lê este livro (o motivo). É ele que diz como medir: avanço, ritmo ou domínio." />
          )}

          {/* selos e recordação */}
          {b.nivel_leitura && (
            <div className="space-y-2">
              <h3 className="eyebrow">Selos do método</h3>
              <Selos livro={b} grande />
            </div>
          )}
          {perguntas > 0 && (
            <div className="rounded-xl bg-surface-2/60 p-4 flex flex-wrap items-center gap-3">
              <Brain size={18} className="text-icon shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Recordação</div>
                <div className="text-xs text-muted mt-0.5">
                  {perguntas} {perguntas === 1 ? "pergunta respondida" : "perguntas respondidas"} ·{" "}
                  {!rec ? "nunca recordou" : rec.proxima <= dayKey() ? "a recordação é hoje" : `próxima: ${fmtDayLong(rec.proxima)}`}
                </div>
                {rec && rec.historico.length > 0 && (
                  <div className="flex gap-1 mt-1.5" title="As últimas recordações">
                    {rec.historico.slice(-12).map((h, i) => <span key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: NOTAS_RECORDAR[h.nota].cor }} title={`${h.dia}: ${NOTAS_RECORDAR[h.nota].nome}`} />)}
                  </div>
                )}
              </div>
              <button className={`btn ${recordarHoje(b) ? "btn-primary" : ""}`} onClick={() => d.abrir({ tipo: "recordar", id: b.id })}>Recordar agora</button>
            </div>
          )}
        </section>

        {/* ── como ler: o roteiro de Adler ── */}
        <RoteiroLeitura className="w-full md:w-[400px] shrink-0 min-h-[60vh] md:min-h-0 border-t md:border-t-0" livro={b}
          outros={d.livros.map((x) => ({ id: x.id, title: x.title, author: x.author, nivel_leitura: x.nivel_leitura, motivo_leitura: x.motivo_leitura, tema: x.tema, format: x.format }))}
          onFechar={fechar}
          onMudou={(patch) => d.setLivros((all) => all.map((x) => (x.id === b.id ? ({ ...x, ...patch } as Book) : x)))} />
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, dica, children }: { rotulo: string; valor: string; dica: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-3 py-2.5 min-w-0">
      <div className="text-[11.5px] text-muted truncate">{rotulo}</div>
      <div className="text-lg font-medium tabular-nums leading-tight mt-0.5">{valor}</div>
      {children}
      <div className="text-[11px] text-faint mt-1 leading-snug line-clamp-2">{dica}</div>
    </div>
  );
}

function Componente({ nome, peso, valor, cor, dica }: { nome: string; peso: string; valor: number | null; cor: string; dica: string }) {
  return (
    <div className="grid grid-cols-[8.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 gap-y-0.5 text-sm">
      <span>{nome} <span className="text-[10.5px] text-faint">{peso}</span></span>
      <span className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(valor ?? 0) * 100}%`, background: cor }} /></span>
      <span className="text-right tabular-nums text-xs">{valor === null ? "—" : `${Math.round(valor * 100)}%`}</span>
      <span className="col-start-2 col-span-2 text-[11px] text-faint">{dica}</span>
    </div>
  );
}

function Explica({ cor, texto }: { cor: string; texto: string }) {
  return <p className="rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: `color-mix(in srgb, ${cor} 8%, transparent)` }}>{texto}</p>;
}
