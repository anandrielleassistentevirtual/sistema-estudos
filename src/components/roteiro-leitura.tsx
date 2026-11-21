"use client";
/**
 * Roteiro de leitura (Mortimer Adler, "Como ler livros"): o nível em que o livro vai ser lido e, para esse nível,
 * as etapas do método — para marcar e responder enquanto lê. Fica salvo no próprio livro.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  COR_NIVEL, NIVEIS_LEITURA, ORDEM_NIVEIS, estagiosDe, etapaFeita, progressoDoRoteiro,
  type NivelLeitura, type Roteiro, type Variante,
} from "@/lib/adler";

export interface LivroRoteiro { id: string; title: string; author: string | null; nivel_leitura?: NivelLeitura | null; roteiro?: Record<string, unknown> | null; tema?: string | null; format?: string }

export function RoteiroLeitura({ livro, outros, onMudou, onFechar, className = "" }: {
  livro: LivroRoteiro;
  /** os outros livros (para a bibliografia da leitura sintópica) */
  outros: LivroRoteiro[];
  onMudou?: (patch: Partial<LivroRoteiro>) => void;
  onFechar: () => void;
  className?: string;
}) {
  const [nivel, setNivel] = useState<NivelLeitura | null>(livro.nivel_leitura ?? null);
  const [r, setR] = useState<Roteiro>(() => (livro.roteiro as Roteiro) ?? {});
  const [tema, setTema] = useState(livro.tema ?? "");
  const [salvo, setSalvo] = useState<"salvo" | "salvando">("salvo");
  const pend = useRef<Record<string, unknown>>({});
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function gravar() {
    if (t.current) { clearTimeout(t.current); t.current = null; }
    const patch = pend.current;
    pend.current = {};
    if (!Object.keys(patch).length) return;
    setSalvo("salvando");
    const { error } = await supabase().from("books").update(patch).eq("id", livro.id);
    setSalvo("salvo");
    if (error) alert(`Não consegui salvar o roteiro: ${error.message}`);
  }
  function salvar(patch: Record<string, unknown>, ja = false) {
    pend.current = { ...pend.current, ...patch };
    onMudou?.(patch as Partial<LivroRoteiro>);
    setSalvo("salvando");
    if (t.current) clearTimeout(t.current);
    if (ja) void gravar(); else t.current = setTimeout(() => void gravar(), 700);
  }
  // ao fechar (ou sair da página), nada fica sem salvar
  useEffect(() => () => { void gravar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mudarRoteiro = (f: (x: Roteiro) => Roteiro, ja = false) => setR((x) => { const n = f(x); salvar({ roteiro: n }, ja); return n; });
  const escolherNivel = (n: NivelLeitura | null) => { setNivel(n); salvar({ nivel_leitura: n }, true); };

  const temas = useMemo(() => [...new Set(outros.map((b) => b.tema?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR")), [outros]);
  const bibliografia = tema.trim() ? outros.filter((b) => b.id !== livro.id && b.tema?.trim().toLowerCase() === tema.trim().toLowerCase()) : [];
  const info = nivel ? NIVEIS_LEITURA[nivel] : null;
  const estagios = nivel ? estagiosDe(nivel, r.variante) : [];
  const prog = nivel ? progressoDoRoteiro(nivel, r) : null;

  return (
    <aside className={`bg-surface text-ink border-l border-line flex flex-col ${className}`}>
      <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
        <span className="font-medium text-sm">Roteiro de leitura <span className="text-muted font-normal">· Adler</span></span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-faint">{salvo === "salvo" ? "salvo" : "salvando…"}</span>
          <button onClick={onFechar} aria-label="Fechar" className="text-muted hover:text-ink"><X size={18} /></button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {/* o nível */}
        <div>
          <div className="label mb-1.5">Como vou ler este livro</div>
          <div className="grid grid-cols-2 gap-1.5">
            {ORDEM_NIVEIS.map((n, i) => {
              const x = NIVEIS_LEITURA[n];
              const ativo = nivel === n;
              return (
                <button key={n} onClick={() => escolherNivel(ativo ? null : n)} aria-pressed={ativo}
                  className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${ativo ? "" : "border-line hover:border-[var(--muted)]"}`}
                  style={ativo ? { borderColor: COR_NIVEL[n], background: `color-mix(in srgb, ${COR_NIVEL[n]} 10%, transparent)` } : undefined}>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="text-[10px] tabular-nums text-faint">{i + 1}</span>{x.nome}
                  </span>
                  <span className="block text-[11.5px] text-muted leading-snug mt-0.5">{x.curto}</span>
                </button>
              );
            })}
          </div>
          {!info && (
            <p className="text-xs text-muted mt-2 leading-relaxed">
              Os quatro níveis são cumulativos: cada um contém os anteriores. Escolha o que este livro pede — a leitura lenta e
              qualitativa é a <b className="text-ink font-medium">analítica</b>; a de pesquisa, com vários livros sobre um tema, é a <b className="text-ink font-medium">sintópica</b>.
            </p>
          )}
        </div>

        {info && nivel && (
          <>
            <div className="rounded-lg px-3 py-2.5" style={{ background: `color-mix(in srgb, ${COR_NIVEL[nivel]} 8%, transparent)` }}>
              <div className="text-xs text-muted">{info.ritmo}</div>
              <div className="font-serif italic mt-0.5">{info.pergunta}</div>
              {prog && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted tabular-nums">
                  <span className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(prog.feitas / Math.max(1, prog.total)) * 100}%`, background: COR_NIVEL[nivel] }} /></span>
                  {prog.feitas} de {prog.total}
                </div>
              )}
            </div>

            {nivel === "analitica" && (
              <div className="seg grid grid-cols-2 w-full text-[13px]">
                {([["expositivo", "Livro expositivo"], ["imaginativo", "Literatura imaginativa"]] as [Variante, string][]).map(([k, l]) => (
                  <button key={k} aria-pressed={(r.variante ?? "expositivo") === k} onClick={() => mudarRoteiro((x) => ({ ...x, variante: k }), true)}>{l}</button>
                ))}
              </div>
            )}

            {nivel === "sintopica" && (
              <div>
                <label className="block"><span className="label">Tema (a sua pergunta)</span>
                  <input className="input mt-1" list="temas-sintopicos" value={tema} placeholder="ex.: a natureza da felicidade"
                    onChange={(e) => { setTema(e.target.value); salvar({ tema: e.target.value.trim() || null }); }} />
                  <datalist id="temas-sintopicos">{temas.map((x) => <option key={x} value={x} />)}</datalist>
                </label>
                {tema.trim() && (
                  <div className="mt-2">
                    <div className="text-xs text-muted mb-1">Bibliografia · {bibliografia.length + 1} {bibliografia.length ? "livros" : "livro"} com este tema</div>
                    {bibliografia.length === 0 ? <p className="text-xs text-faint">Dê o mesmo tema aos outros livros (no roteiro de cada um) para montar a bibliografia.</p> : (
                      <ul className="space-y-1">
                        {bibliografia.map((b) => (
                          <li key={b.id} className="text-[13px] truncate">
                            {b.format === "fisico" ? <span>{b.title}</span> : <Link className="hover:underline underline-offset-2" href={`/ler/${b.id}`}>{b.title}</Link>}
                            {b.author && <span className="text-muted"> · {b.author}</span>}
                            {b.nivel_leitura && b.nivel_leitura !== "sintopica" && <span className="text-faint"> · {NIVEIS_LEITURA[b.nivel_leitura].nome.toLowerCase()}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {estagios.map((s) => (
              <section key={s.nome}>
                <h3 className="text-[11px] uppercase tracking-wider text-muted">{s.nome}{s.resumo && <span className="normal-case tracking-normal text-faint"> · {s.resumo}</span>}</h3>
                <ul className="mt-1.5 space-y-2.5">
                  {s.etapas.map((e) => {
                    const feita = etapaFeita(e, r);
                    return (
                      <li key={e.id}>
                        <div className="flex items-start gap-2">
                          {e.campo || e.opcoes ? (
                            <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full grid place-items-center border" style={feita ? { background: COR_NIVEL[nivel], borderColor: COR_NIVEL[nivel], color: "#fff" } : { borderColor: "var(--border)" }}>
                              {feita && <Check size={11} />}
                            </span>
                          ) : (
                            <input type="checkbox" className="mt-0.5 shrink-0" checked={feita} aria-label={e.texto}
                              onChange={(ev) => mudarRoteiro((x) => ({ ...x, feitas: ev.target.checked ? [...new Set([...(x.feitas ?? []), e.id])] : (x.feitas ?? []).filter((y) => y !== e.id) }), true)} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={`leading-snug ${feita && !e.campo && !e.opcoes ? "text-muted" : ""}`}>{e.texto}</div>
                            {e.dica && <div className="text-[11.5px] text-faint leading-snug mt-0.5">{e.dica}</div>}
                          </div>
                        </div>
                        {e.campo && (
                          <textarea className="input mt-1.5 ml-6 w-[calc(100%-1.5rem)] resize-none leading-snug text-[13px]" rows={2}
                            style={{ fieldSizing: "content", minHeight: "3.2rem" } as React.CSSProperties}
                            value={r.campos?.[e.campo] ?? ""} placeholder="Sua resposta…"
                            onChange={(ev) => { const v = ev.target.value; mudarRoteiro((x) => ({ ...x, campos: { ...(x.campos ?? {}), [e.campo!]: v } })); }} />
                        )}
                        {e.opcoes && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 ml-6">
                            {e.opcoes.map((o) => {
                              const sel = r.escolhas?.[e.id] === o;
                              return (
                                <button key={o} aria-pressed={sel}
                                  className={`text-xs rounded-full px-2.5 py-1 border ${sel ? "text-ink" : "border-line text-muted hover:text-ink"}`}
                                  style={sel ? { borderColor: COR_NIVEL[nivel], background: `color-mix(in srgb, ${COR_NIVEL[nivel]} 12%, transparent)` } : undefined}
                                  onClick={() => mudarRoteiro((x) => { const esc = { ...(x.escolhas ?? {}) }; if (sel) delete esc[e.id]; else esc[e.id] = o; return { ...x, escolhas: esc }; }, true)}>{o}</button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <p className="text-[11px] text-faint">Segundo Mortimer Adler e Charles Van Doren, “Como ler livros”.</p>
          </>
        )}
      </div>
    </aside>
  );
}
