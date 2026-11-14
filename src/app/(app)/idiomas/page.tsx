"use client";
/**
 * Idiomas: cada idioma na sua seção. O tempo (Timer e registros), as revisões e os cartões criados no Anki
 * aparecem só no idioma dono dos baralhos (Inglês ← "English"), nunca misturados.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Layers, Play, Plus, Settings2, Trash2, X } from "lucide-react";
import { Empty, Page, Stat } from "@/components/page";
import { AnkiNoComputador, AnkiWebBarra, Conectar } from "@/components/anki-conta";
import { ListeningPainel } from "@/components/listening-painel";
import { ROTULO_LISTENING } from "@/lib/listening";
import { contaComoEstudo } from "@/lib/tempo";
import { BarChart } from "@/components/bar-chart";
import { Heatmap } from "@/components/heatmap";
import { Bandeira, BANDEIRAS, bandeiraDoIdioma } from "@/components/bandeira";
import { Language, loadLanguages, ONDE, palpiteDeBaralhos, SUGESTOES } from "@/lib/languages";
import { ankiOnline, contaAnki, sincronizarAnkiSeAntigo, type BaralhoAnki, type ContaAnki } from "@/lib/anki";
import { addDays, dayKey, fmtDuration, nf, weekStart } from "@/lib/dates";
import { emptyDay, type DayStats } from "@/lib/stats";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";

interface Sess { day: string; seconds: number; language: string | null; label: string }
interface DiaBaralho { day: string; baralho: string; reviews: number; segundos: number; criados: number; notas_criadas: number }

const WEEKS = 12;

export default function Idiomas() {
  const [langs, setLangs] = useState<Language[] | null>(null);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [ankiDias, setAnkiDias] = useState<DiaBaralho[]>([]);
  const [conta, setConta] = useState<ContaAnki | null | undefined>(undefined); // null = AnkiWeb não conectado
  const baralhos: BaralhoAnki[] | null = conta ? conta.baralhos ?? [] : null;
  const [noComputador, setNoComputador] = useState(false); // Anki aberto neste computador (AnkiConnect)
  useEffect(() => { void ankiOnline().then(setNoComputador); }, []);
  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "idioma" | "tempo" | { edit: Language }>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const desde = dayKey(addDays(weekStart(new Date()), -52 * 7));
    const [st, lg, ad, conta] = await Promise.all([
      todas<Sess>((de, ate) => sb.from("study_sessions").select("day,seconds,language,label").eq("category", "Idiomas").order("id").range(de, ate)),
      loadLanguages(),
      todas<DiaBaralho>((de, ate) => sb.from("anki_baralho_dia").select("day,baralho,reviews,segundos,criados,notas_criadas").gte("day", desde).order("day").order("baralho").range(de, ate)).catch(() => [] as DiaBaralho[]),
      contaAnki(),
    ]);
    setSessions(st);
    setLangs(lg);
    setAnkiDias(ad);
    setConta(conta);
    setSelId((cur) => {
      if (cur && lg.some((l) => l.id === cur)) return cur;
      let salvo: string | null = null;
      try { salvo = localStorage.getItem("idioma-atual"); } catch {}
      return lg.find((l) => l.id === salvo)?.id ?? lg[0]?.id ?? null;
    });
  }, []);
  useEffect(() => {
    void load();
    // números do Anki velhos: busca no AnkiWeb em segundo plano e atualiza
    void sincronizarAnkiSeAntigo(0.5).then((ok) => { if (ok) void load(); });
  }, [load]);
  useEffect(() => { if (selId) try { localStorage.setItem("idioma-atual", selId); } catch {} }, [selId]);

  const sel = langs?.find((l) => l.id === selId) ?? null;
  const decksDoIdioma = useMemo(() => new Set(sel?.anki_baralhos ?? []), [sel]);
  const meusDias = useMemo(() => ankiDias.filter((d) => decksDoIdioma.has(d.baralho)), [ankiDias, decksDoIdioma]);
  // a revisão feita aqui no sistema ("Anki · 12 cartões") já está no histórico do Anki: com baralhos ligados, não conta duas vezes
  const minhasSessoes = useMemo(() => sessions.filter((s) => s.language === sel?.name && contaComoEstudo(s.label, !!conta)), [sessions, sel, conta]);

  // por dia: revisões (azul), criados (amarelo) e segundos no Anki
  const { revisoes, criados } = useMemo(() => {
    const revisoes = new Map<string, DayStats>(), criados = new Map<string, DayStats>();
    for (const d of meusDias) {
      if (d.reviews) revisoes.set(d.day, { ...emptyDay(), anki: (revisoes.get(d.day)?.anki ?? 0) + d.reviews });
      if (d.criados) criados.set(d.day, { ...emptyDay(), anki: (criados.get(d.day)?.anki ?? 0) + d.criados });
    }
    return { revisoes, criados };
  }, [meusDias]);

  const hoje = dayKey();
  const ws = dayKey(weekStart(new Date()));
  const domingo = dayKey(addDays(new Date(), -new Date().getDay()));
  const ms = dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
  const timerSemana = soma(minhasSessoes.filter((s) => s.day >= ws), (s) => s.seconds);
  const ankiSemana = soma(meusDias.filter((d) => d.day >= ws), (d) => d.segundos);
  const totalMes = soma(minhasSessoes.filter((s) => s.day >= ms), (s) => s.seconds) + soma(meusDias.filter((d) => d.day >= ms), (d) => d.segundos);
  const revHoje = soma(meusDias.filter((d) => d.day === hoje), (d) => d.reviews);
  const revSemana = soma(meusDias.filter((d) => d.day >= ws), (d) => d.reviews);
  const criadosDomingo = soma(meusDias.filter((d) => d.day >= domingo), (d) => d.criados);
  const notasDomingo = soma(meusDias.filter((d) => d.day >= domingo), (d) => d.notas_criadas);
  const tabela = (baralhos ?? []).filter((b) => decksDoIdioma.has(b.nome.split("::")[0]));
  const paraHoje = soma(tabela.filter((b) => !b.nome.includes("::")), (b) => b.revisar + b.aprendendo);
  const meta = sel?.weekly_goal_min ? sel.weekly_goal_min * 60 : 0;
  // Listening (curso do Mairo, medido pelo script)
  const escuta = minhasSessoes.filter((s) => s.label === ROTULO_LISTENING);
  const escutaHoje = soma(escuta.filter((s) => s.day === hoje), (s) => s.seconds);
  const escutaSemana = soma(escuta.filter((s) => s.day >= ws), (s) => s.seconds);
  // aulas em vídeo do curso (medidas pelo mesmo script)
  const aulasSemana = soma(minhasSessoes.filter((s) => s.label === "Aulas" && s.day >= ws), (s) => s.seconds);

  const semanal = useMemo(() => {
    const w0 = weekStart(new Date());
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(w0, -(WEEKS - 1 - i) * 7);
      const a = dayKey(start), z = dayKey(addDays(start, 6));
      const t = soma(minhasSessoes.filter((s) => s.day >= a && s.day <= z), (s) => s.seconds);
      const k = soma(meusDias.filter((d) => d.day >= a && d.day <= z), (d) => d.segundos);
      return {
        label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        detail: `semana de ${start.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} · ${fmtDuration(t + k)}${k ? ` (Anki ${fmtDuration(k)})` : ""}`,
        value: Math.round((t + k) / 60),
      };
    });
  }, [minhasSessoes, meusDias]);

  const ondeFoi = useMemo(() => {
    const m = new Map<string, number>();
    const from = dayKey(addDays(new Date(), -29));
    for (const s of minhasSessoes) {
      if (s.day < from) continue;
      const k = s.label.startsWith("Lição") ? "Lições" : s.label.startsWith("Anki") ? "Anki" : s.label.startsWith("Listening") ? "Listening" : s.label || "Timer";
      m.set(k, (m.get(k) ?? 0) + s.seconds);
    }
    const anki = soma(meusDias.filter((d) => d.day >= from), (d) => d.segundos);
    if (anki) m.set("Anki", (m.get("Anki") ?? 0) + anki);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [minhasSessoes, meusDias]);


  return (
    <Page
      title="Idiomas"
      subtitle="Cada idioma com o seu tempo, as suas revisões e os seus cartões do Anki."
      actions={
        <>
          <button className="btn" onClick={() => setModal("idioma")}><Plus size={15} /> Cadastrar idioma</button>
          <button className="btn" onClick={() => setModal("tempo")} disabled={!langs?.length}><Clock size={15} /> Registrar tempo</button>
        </>
      }
    >
      {langs && langs.length === 0 && <Empty>Cadastre os idiomas que você estuda: cada um ganha a sua seção, com o tempo e os baralhos do Anki dele.</Empty>}

      {langs && langs.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {langs.map((l) => (
            <button key={l.id} onClick={() => setSelId(l.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${l.id === selId ? "border-ink font-medium" : "border-line text-muted hover:text-ink"}`}>
              <Bandeira codigo={l.bandeira} tamanho={14} /> {l.name}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <Bandeira codigo={sel.bandeira} tamanho={26} />
            <h2 className="text-xl font-medium">{sel.name}</h2>
            <button className="btn btn-ghost text-xs" onClick={() => setModal({ edit: sel })}><Settings2 size={14} /> Configurar</button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Tempo esta semana" value={fmtDuration(timerSemana + ankiSemana)}
              hint={[meta ? `meta ${fmtDuration(meta)} · ${Math.round(Math.min(1, (timerSemana + ankiSemana) / meta) * 100)}%` : null,
                escutaSemana ? `Listening ${fmtDuration(escutaSemana)}` : null, aulasSemana ? `Aulas ${fmtDuration(aulasSemana)}` : null,
                ankiSemana ? `Anki ${fmtDuration(ankiSemana)}` : null,
                timerSemana - escutaSemana - aulasSemana > 0 ? `Timer ${fmtDuration(timerSemana - escutaSemana - aulasSemana)}` : null,
                `mês ${fmtDuration(totalMes)}`].filter(Boolean).join(" · ")} />
            <Stat label="Para revisar hoje" value={baralhos ? nf.format(paraHoje) : "—"} hint={baralhos ? "nos baralhos deste idioma" : "conecte o AnkiWeb (no fim da página)"} />
            <Stat label="Listening" value={fmtDuration(escutaHoje)} hint={`hoje · ${fmtDuration(escutaSemana)} na semana`} />
            <Stat label="Revisões" value={nf.format(revHoje)} hint={`hoje · ${nf.format(revSemana)} na semana`} />
            <Stat label="Cartões criados" value={nf.format(criadosDomingo)} hint={`desde domingo${notasDomingo && notasDomingo !== criadosDomingo ? ` · em ${nf.format(notasDomingo)} notas` : ""}`} />
          </div>

          {conta && <div className="mt-3"><AnkiWebBarra conta={conta} onMudou={load} /></div>}

          {!sel.anki_baralhos.length && (
            <p className="text-sm text-muted mt-3">
              Nenhum baralho do Anki ligado a {sel.name}. <button className="underline underline-offset-2 hover:text-ink" onClick={() => setModal({ edit: sel })}>Escolher os baralhos</button>
              {conta === null && <> · antes, conecte o AnkiWeb (abaixo)</>}.
            </p>
          )}

          <div className="grid lg:grid-cols-[1fr_300px] gap-4 mt-4">
            <section className="card p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-medium">Minutos por semana</h3>
                <span className="text-xs text-muted">últimas {WEEKS} semanas · Timer + Anki</span>
              </div>
              <BarChart data={semanal} unit="min" />
            </section>
            <section className="card p-5">
              <h3 className="font-medium mb-3">Onde foi o tempo</h3>
              <p className="text-xs text-muted -mt-2 mb-3">últimos 30 dias</p>
              {ondeFoi.length === 0 ? (
                <p className="text-sm text-muted">Nada ainda. Use o Timer (categoria Idiomas → {sel.name}) ou “Registrar tempo”.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {ondeFoi.map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-2"><span className="text-muted truncate">{k}</span><span className="tabular-nums">{fmtDuration(v)}</span></li>
                  ))}
                </ul>
              )}

            </section>
          </div>

          {sel.anki_baralhos.length > 0 && (
            <>
              <section className="card p-5 mt-4">
                <h3 className="font-medium mb-3">Revisões no Anki</h3>
                <Heatmap data={revisoes} metric="anki" />
              </section>
              <section className="card p-5 mt-4">
                <h3 className="font-medium mb-3">Cartões criados</h3>
                <Heatmap data={criados} metric="anki" unidade="cartões criados" paleta="ama" />
                <p className="text-xs text-faint mt-2">Contagem desde 08/11/2026, só nos baralhos de {sel.name}: {sel.anki_baralhos.join(", ")}.</p>
              </section>
              {tabela.length > 0 && (
                <section className="card mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted border-b border-line">
                        <th className="p-3 font-medium flex items-center gap-1.5"><Layers size={14} /> Baralho</th>
                        <th className="p-3 font-medium text-right">Revisar</th>
                        <th className="p-3 font-medium text-right">Aprendendo</th>
                        <th className="p-3 font-medium text-right">Novos</th>
                        <th className="p-3 font-medium text-right hidden sm:table-cell">Cartões</th>
                        {noComputador && <th className="p-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {tabela.map((d) => (
                        <tr key={d.nome} className="border-b border-line last:border-0">
                          <td className="p-3" style={{ paddingLeft: 12 + (d.nome.split("::").length - 1) * 16 }}>{d.nome.split("::").pop()}</td>
                          <td className="p-3 text-right tabular-nums font-medium">{nf.format(d.revisar)}</td>
                          <td className="p-3 text-right tabular-nums">{nf.format(d.aprendendo)}</td>
                          <td className="p-3 text-right tabular-nums text-muted">{nf.format(d.novos)}</td>
                          <td className="p-3 text-right tabular-nums text-muted hidden sm:table-cell">{nf.format(d.total)}</td>
                          {noComputador && (
                            <td className="p-3 text-right">
                              <Link className="btn btn-primary text-xs py-1" href={`/idiomas/anki/revisar?deck=${encodeURIComponent(d.nome)}`}><Play size={12} /> Revisar</Link>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}
        </>
      )}

      {conta === null && (
        <div className="mt-6"><Conectar onConectado={async () => { await load(); }} /></div>
      )}
      {sel && <ListeningPainel idioma={sel.name} />}
      <AnkiNoComputador conectado={noComputador} setConectado={setNoComputador} />
      {conta && (
        <p className="text-xs text-faint mt-6">
          AnkiWeb: {conta.usuario} ·{" "}
          <button className="underline underline-offset-2 hover:text-ink" onClick={async () => {
            if (!confirm("Desligar o AnkiWeb deste sistema? O histórico que já está aqui continua.")) return;
            const { ankiWeb } = await import("@/lib/anki");
            await ankiWeb("sair").catch(() => {});
            await load();
          }}>desligar</button>
        </p>
      )}

      {(modal === "idioma" || (modal && typeof modal === "object")) && (
        <LanguageModal edit={typeof modal === "object" ? modal.edit : null} existing={(langs ?? []).map((l) => l.name)}
          // baralhos vazios (0 cartões) não aparecem para escolher, a não ser que já estejam ligados
          baralhos={(baralhos ?? []).filter((b) => !b.nome.includes("::") && (b.total > 0 || (langs ?? []).some((l) => l.anki_baralhos.includes(b.nome))))}
          usados={new Map((langs ?? []).flatMap((l) => l.anki_baralhos.map((b) => [b, l.name] as [string, string])))}
          onClose={() => setModal(null)} onSaved={(id) => { setModal(null); if (id) setSelId(id); void load(); }} />
      )}
      {modal === "tempo" && (
        <TimeModal langs={(langs ?? []).map((l) => l.name)} defaultLang={sel?.name ?? langs?.[0]?.name ?? ""}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} />
      )}
    </Page>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-medium">{title}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LanguageModal({ edit, existing, baralhos, usados, onClose, onSaved }: {
  edit: Language | null; existing: string[]; baralhos: BaralhoAnki[]; usados: Map<string, string>;
  onClose: () => void; onSaved: (id: string | null) => void;
}) {
  const [name, setName] = useState(edit?.name ?? "");
  const [goalH, setGoalH] = useState(edit?.weekly_goal_min ? String(edit.weekly_goal_min / 60) : "");
  const [bandeira, setBandeira] = useState<string | null>(edit?.bandeira ?? null);
  const [decks, setDecks] = useState<string[]>(edit?.anki_baralhos ?? []);
  const [tocouBandeira, setTocouBandeira] = useState(!!edit?.bandeira);
  const [tocouDecks, setTocouDecks] = useState(!!edit);
  const [err, setErr] = useState<string | null>(null);

  // idioma novo: sugere a bandeira e os baralhos pelo nome (dá para mudar)
  useEffect(() => {
    if (!tocouBandeira) setBandeira(bandeiraDoIdioma(name));
    if (!tocouDecks) setDecks(palpiteDeBaralhos(name, baralhos.map((b) => b.nome)).filter((b) => !usados.has(b)));
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const weekly_goal_min = goalH ? Math.round(Number(goalH.replace(",", ".")) * 60) : null;
    const campos = { name: n, weekly_goal_min, bandeira, anki_baralhos: decks };
    const sb = supabase();
    const { data, error } = edit
      ? await sb.from("languages").update(campos).eq("id", edit.id).select("id").single()
      : await sb.from("languages").insert({ ...campos, position: existing.length }).select("id").single();
    if (error) return setErr(error.code === "23505" ? "Esse idioma já está cadastrado." : error.message);
    if (edit && n !== edit.name) await sb.from("study_sessions").update({ language: n }).eq("language", edit.name);
    onSaved((data as { id: string }).id);
  }

  async function remove() {
    if (!edit || !confirm(`Remover “${edit.name}”? O tempo já registrado continua salvo, e os baralhos continuam no seu Anki.`)) return;
    await supabase().from("languages").delete().eq("id", edit.id);
    onSaved(null);
  }

  return (
    <Modal title={edit ? `Configurar ${edit.name}` : "Cadastrar idioma"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className="block space-y-1">
          <span className="label">Idioma</span>
          <input className="input" list="sugestoes-idiomas" required autoFocus={!edit} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Inglês" />
          <datalist id="sugestoes-idiomas">{SUGESTOES.filter((s) => !existing.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <div>
          <span className="label">Bandeira</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {BANDEIRAS.map((b) => (
              <button key={b.id} type="button" title={b.nome} onClick={() => { setBandeira(b.id); setTocouBandeira(true); }}
                className={`rounded-md p-1.5 border ${bandeira === b.id ? "border-ink bg-surface-2" : "border-transparent hover:border-line"}`}>
                <Bandeira codigo={b.id} tamanho={16} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Baralhos do Anki deste idioma</span>
          {baralhos.length === 0 ? (
            <p className="text-xs text-muted mt-1">Conecte o AnkiWeb na aba Anki para escolher os baralhos.</p>
          ) : (
            <div className="mt-1.5 space-y-1">
              {baralhos.map((b) => {
                const dono = usados.get(b.nome);
                const deOutro = dono && dono !== edit?.name;
                return (
                  <label key={b.nome} className={`flex items-center justify-between gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-surface-2 ${deOutro ? "opacity-50" : "cursor-pointer"}`}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" disabled={!!deOutro} checked={decks.includes(b.nome)}
                        onChange={(e) => { setTocouDecks(true); setDecks((d) => (e.target.checked ? [...d, b.nome] : d.filter((x) => x !== b.nome))); }} />
                      {b.nome}
                    </span>
                    <span className="text-xs text-muted">{deOutro ? `de ${dono}` : `${nf.format(b.total)} cartões`}</span>
                  </label>
                );
              })}
              <p className="text-xs text-faint pt-1">Os subbaralhos entram junto. Só os baralhos marcados contam neste idioma.</p>
            </div>
          )}
        </div>
        <label className="block space-y-1">
          <span className="label">Meta semanal (horas, opcional)</span>
          <input className="input" inputMode="decimal" value={goalH} onChange={(e) => setGoalH(e.target.value)} placeholder="ex.: 5" />
        </label>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-between gap-2 pt-1">
          {edit ? <button type="button" className="btn btn-ghost hover:text-critical" onClick={remove}><Trash2 size={14} /> Remover</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TimeModal({ langs, defaultLang, onClose, onSaved }: { langs: string[]; defaultLang: string; onClose: () => void; onSaved: () => void }) {
  const [language, setLanguage] = useState(defaultLang);
  const [day, setDay] = useState(dayKey());
  const [h, setH] = useState("");
  const [m, setM] = useState("30");
  const [onde, setOnde] = useState(ONDE[0]);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const seconds = (Number(h || 0) * 60 + Number(m || 0)) * 60;
    if (seconds <= 0) return setErr("Informe quanto tempo você estudou.");
    setBusy(true);
    const label = nota.trim() ? `${onde} · ${nota.trim()}` : onde;
    const { error } = await supabase().from("study_sessions").insert({
      day, started_at: new Date(`${day}T12:00:00`).toISOString(), seconds, category: "Idiomas", language, label,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    onSaved();
  }

  return (
    <Modal title="Registrar tempo de idioma" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span className="label">Idioma</span>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {langs.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="label">Dia</span>
            <input className="input" type="date" value={day} max={dayKey()} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="space-y-1"><span className="label">Horas</span>
            <input className="input" type="number" min={0} max={23} value={h} placeholder="0" onChange={(e) => setH(e.target.value)} />
          </label>
          <label className="space-y-1"><span className="label">Minutos</span>
            <input className="input" type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1"><span className="label">Onde</span>
          <select className="input" value={onde} onChange={(e) => setOnde(e.target.value)}>
            {ONDE.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label className="block space-y-1"><span className="label">Observação (opcional)</span>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ex.: Lição 14, revisão de frases" />
        </label>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Registrar"}</button>
        </div>
      </form>
    </Modal>
  );
}
