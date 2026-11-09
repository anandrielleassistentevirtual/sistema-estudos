"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Page, Stat } from "@/components/page";
import { IdiomasTabs } from "@/components/idiomas-tabs";
import { Heatmap } from "@/components/heatmap";
import { ANKI_INICIO, anki, ankiOnline, ankiUrl } from "@/lib/anki";
import { addDays, dayKey, nf, weekStart } from "@/lib/dates";
import { DayStats, loadDaily } from "@/lib/stats";
import { supabase } from "@/lib/supabase/client";

interface DeckStat { deck_id: number; name: string; new_count: number; learn_count: number; review_count: number; total_in_deck: number }

export default function AnkiPage() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [decks, setDecks] = useState<DeckStat[]>([]);
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState("Leituras");
  const [url, setUrl] = useState("http://127.0.0.1:8765");
  const [origin, setOrigin] = useState("");

  async function refresh() {
    setBusy(true);
    setMsg(null);
    const ok = await ankiOnline();
    setOnline(ok);
    if (ok) {
      try {
        const names = await anki<string[]>("deckNames");
        const stats = await anki<Record<string, DeckStat>>("getDeckStats", { decks: names });
        setDecks(Object.values(stats).sort((a, b) => a.name.localeCompare(b.name)));
        const byDay = await anki<[string, number][]>("getNumCardsReviewedByDay");
        if (byDay.length) {
          const rows = byDay.filter(([day]) => day >= ANKI_INICIO).map(([day, reviews]) => ({ day, reviews }));
          for (let i = 0; i < rows.length; i += 500) await supabase().from("anki_daily").upsert(rows.slice(i, i + 500));
          setMsg(`${rows.length} ${rows.length === 1 ? "dia" : "dias"} de revisões sincronizados com o calendário (contagem desde 08/11/2026).`);
        }
      } catch (e) {
        setMsg((e as Error).message);
      }
    }
    setDaily(await loadDaily(dayKey(addDays(weekStart(new Date()), -52 * 7))));
    setBusy(false);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      setDeck(localStorage.getItem("anki-deck") || "Leituras");
      setUrl(ankiUrl());
    } catch {}
    void refresh();
  }, []);

  const today = daily.get(dayKey())?.anki ?? 0;
  let week = 0;
  for (let d = weekStart(new Date()); d <= new Date(); d = addDays(d, 1)) week += daily.get(dayKey(d))?.anki ?? 0;
  const due = decks.filter((d) => !d.name.includes("::")).reduce((a, d) => a + d.review_count + d.learn_count, 0);

  return (
    <Page
      tabs={<IdiomasTabs />}
      title="Anki"
      subtitle="Revise seus baralhos aqui mesmo: as respostas vão direto para o seu Anki (que precisa estar aberto neste computador)."
      actions={<button className="btn" onClick={refresh} disabled={busy}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Atualizar</button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Conexão" value={online === null ? "…" : online ? "Conectado" : "Desconectado"} hint={online ? "Anki aberto neste computador" : "abra o Anki com o AnkiConnect"} />
        <Stat label="Para revisar hoje" value={online ? nf.format(due) : "—"} />
        <Stat label="Revisões hoje" value={nf.format(today)} />
        <Stat label="Revisões na semana" value={nf.format(week)} />
      </div>
      {msg && <p className="text-sm text-muted mt-3">{msg}</p>}

      <section className="card p-5 mt-4">
        <h2 className="font-medium mb-3">Histórico de revisões</h2>
        <Heatmap data={daily} metric="anki" />
      </section>

      {online && decks.length > 0 && (
        <section className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="p-3 font-medium">Baralho</th>
                <th className="p-3 font-medium text-right">Novos</th>
                <th className="p-3 font-medium text-right">Aprendendo</th>
                <th className="p-3 font-medium text-right">Revisar</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {decks.map((d) => (
                <tr key={d.deck_id} className="border-b border-line last:border-0">
                  <td className="p-3" style={{ paddingLeft: 12 + (d.name.split("::").length - 1) * 16 }}>{d.name.split("::").pop()}</td>
                  <td className="p-3 text-right tabular-nums">{d.new_count}</td>
                  <td className="p-3 text-right tabular-nums">{d.learn_count}</td>
                  <td className="p-3 text-right tabular-nums font-medium">{d.review_count}</td>
                  <td className="p-3 text-right">
                    <span className="inline-flex gap-1">
                      <Link className="btn btn-primary text-xs py-1" href={`/idiomas/anki/revisar?deck=${encodeURIComponent(d.name)}`}><Play size={12} /> Revisar</Link>
                      <button className="btn btn-ghost text-xs py-1" title="Abrir a revisão na janela do Anki" onClick={() => anki("guiDeckReview", { name: d.name }).catch(() => {})}>no Anki</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="card p-5 space-y-3">
          <h2 className="font-medium">Preferências</h2>
          <label className="block space-y-1">
            <span className="label">Baralho para destaques de leitura</span>
            <input className="input" value={deck} onChange={(e) => { setDeck(e.target.value); try { localStorage.setItem("anki-deck", e.target.value); } catch {} }} />
          </label>
          <p className="text-xs text-muted">Frases das lições de idiomas vão para <code>Idiomas::&lt;idioma&gt;</code>.</p>
          <label className="block space-y-1">
            <span className="label">Endereço do AnkiConnect</span>
            <input className="input font-mono text-xs" value={url} onChange={(e) => { setUrl(e.target.value); try { localStorage.setItem("anki-url", e.target.value); } catch {} }} />
          </label>
        </div>
        <div className="card p-5 text-sm space-y-2">
          <h2 className="font-medium">Como conectar (uma vez por computador)</h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted">
            <li>No Anki: <b>Ferramentas → Complementos → Obter complementos</b> e cole o código <code className="bg-surface-2 px-1 rounded">2055492159</code> (AnkiConnect). Reinicie o Anki.</li>
            <li>Em <b>Complementos → AnkiConnect → Configuração</b>, adicione este site em <code>webCorsOriginList</code>:
              <pre className="bg-surface-2 rounded p-2 mt-1 text-xs overflow-x-auto">{`"webCorsOriginList": [\n  "http://localhost",\n  "${origin || "https://seu-site"}"\n]`}</pre>
            </li>
            <li>Deixe o Anki aberto e clique em <b>Atualizar</b>. Se o navegador perguntar sobre acesso à rede local, permita.</li>
          </ol>
          <p className="text-xs text-faint">Funciona no computador onde o Anki está aberto. No celular, o histórico já sincronizado continua aparecendo.</p>
        </div>
      </section>
    </Page>
  );
}
