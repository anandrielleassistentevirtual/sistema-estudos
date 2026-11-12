"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Cloud, Play, RefreshCw } from "lucide-react";
import { Page, Stat } from "@/components/page";
import { IdiomasTabs } from "@/components/idiomas-tabs";
import { Heatmap } from "@/components/heatmap";
import { anki, ankiOnline, ankiPrecisaAtualizar, ankiUrl, ankiWeb, contaAnki, type ContaAnki } from "@/lib/anki";
import { addDays, dayKey, fmtDuration, nf, weekStart } from "@/lib/dates";
import { DayStats, emptyDay, loadDaily } from "@/lib/stats";
import { todas } from "@/lib/supabase/todas";
import { supabase } from "@/lib/supabase/client";

/** "agora há pouco", "há 12 min", "há 3 h", "ontem às 21:40" */
function haQuanto(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AnkiPage() {
  const [conta, setConta] = useState<ContaAnki | null | undefined>(undefined); // undefined = carregando
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());
  const [segundosHoje, setSegundosHoje] = useState(0);
  /** cartões criados por dia (no formato do mapa de calor: o número vai em "anki") e notas criadas */
  const [criados, setCriados] = useState<Map<string, DayStats>>(new Map());
  const [notas, setNotas] = useState<Map<string, number>>(new Map());
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [conectado, setConectado] = useState(false); // AnkiConnect (Anki aberto neste computador)

  async function carregar() {
    const desde = dayKey(addDays(weekStart(new Date()), -52 * 7));
    type Linha = { day: string; segundos: number; criados: number; notas_criadas: number };
    const [c, d, linhas] = await Promise.all([
      contaAnki(),
      loadDaily(desde),
      todas<Linha>((de, ate) => supabase().from("anki_daily").select("day,segundos,criados,notas_criadas").gte("day", desde).order("day").range(de, ate)).catch(() => [] as Linha[]),
    ]);
    setConta(c);
    setDaily(d);
    setSegundosHoje(linhas.find((l) => l.day === dayKey())?.segundos ?? 0);
    setCriados(new Map(linhas.filter((l) => l.criados > 0).map((l) => [l.day, { ...emptyDay(), anki: l.criados }])));
    setNotas(new Map(linhas.filter((l) => l.notas_criadas > 0).map((l) => [l.day, l.notas_criadas])));
    return c;
  }

  async function atualizar(silencioso = false) {
    setBusy(true);
    if (!silencioso) setMsg(null);
    try {
      const r = await ankiWeb("sincronizar");
      if (!silencioso || r.mensagem) {
        setMsg({ texto: r.mensagem ? `Recado do AnkiWeb: ${r.mensagem}` : r.vazio ? "Sua coleção no AnkiWeb está vazia." : r.semNovidades ? "Nada novo no AnkiWeb desde a última atualização." : "Atualizado com o AnkiWeb." });
      }
    } catch (e) {
      setMsg({ texto: (e as Error).message, erro: true });
    }
    await carregar();
    setBusy(false);
  }

  useEffect(() => {
    void carregar().then((c) => {
      // números com mais de 30 minutos: busca no AnkiWeb sozinho
      if (c && ankiPrecisaAtualizar(c, 0.5)) void atualizar(true);
    });
    void ankiOnline().then(setConectado);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hoje = daily.get(dayKey())?.anki ?? 0;
  let semana = 0;
  for (let d = weekStart(new Date()); d <= new Date(); d = addDays(d, 1)) semana += daily.get(dayKey(d))?.anki ?? 0;
  const r = conta?.resumo;
  // cartões criados: hoje, na semana, nos últimos 30 dias
  const somaCriados = (desde: Date) => {
    let c = 0, n = 0;
    for (let d = desde; d <= new Date(); d = addDays(d, 1)) { c += criados.get(dayKey(d))?.anki ?? 0; n += notas.get(dayKey(d)) ?? 0; }
    return { c, n };
  };
  const criadosHoje = somaCriados(new Date());
  // desde o último domingo (inclusive)
  const domingo = addDays(new Date(), -new Date().getDay());
  const criadosSemana = somaCriados(domingo);
  const criados30 = somaCriados(addDays(new Date(), -29));
  const emNotas = (x: { c: number; n: number }) => (x.n && x.n !== x.c ? `em ${nf.format(x.n)} ${x.n === 1 ? "nota" : "notas"}` : undefined);
  const baralhos = conta?.baralhos ?? [];

  return (
    <Page
      tabs={<IdiomasTabs />}
      title="Anki"
      subtitle={conta ? `Números do AnkiWeb · atualizado ${haQuanto(conta.sincronizado_em)}` : "Seus números do Anki, direto do AnkiWeb — sem precisar do Anki aberto."}
      actions={conta ? (
        <button className="btn" onClick={() => void atualizar()} disabled={busy}>
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> {busy ? "Atualizando…" : "Atualizar"}
        </button>
      ) : undefined}
    >
      {conta === null && <Conectar onConectado={async () => { setMsg({ texto: "AnkiWeb conectado. Seus números já estão aqui." }); await carregar(); }} />}

      {msg && <p className={`text-sm mb-3 ${msg.erro ? "text-critical" : "text-muted"}`}>{msg.texto}</p>}
      {conta?.erro && !msg && <p className="text-sm mb-3 text-critical">Última tentativa: {conta.erro}</p>}

      {conta !== null && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Para revisar hoje" value={r ? nf.format(r.revisar_hoje + r.aprendendo) : "—"}
              hint={r ? `${nf.format(r.revisar_hoje)} revisões · ${nf.format(r.aprendendo)} aprendendo` : undefined} />
            <Stat label="Revisões hoje" value={nf.format(hoje)} hint={segundosHoje >= 60 ? `${fmtDuration(segundosHoje)} revisando` : undefined} />
            <Stat label="Revisões na semana" value={nf.format(semana)} />
            <Stat label="Acertos (30 dias)" value={r?.retencao_30d != null ? `${Math.round(r.retencao_30d * 100)}%` : "—"}
              hint={r?.revisoes_30d ? `de ${nf.format(r.revisoes_30d)} revisões de cartões já aprendidos` : undefined} />
          </div>

          <section className="card p-5 mt-4">
            <h2 className="font-medium mb-3">Histórico de revisões</h2>
            <Heatmap data={daily} metric="anki" />
            <p className="text-xs text-faint mt-2">A contagem no sistema começa em 08/11/2026.</p>
          </section>

          <section className="card p-5 mt-4">
            <h2 className="font-medium mb-3">Cartões criados</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Hoje" value={nf.format(criadosHoje.c)} hint={emNotas(criadosHoje)} />
              <Stat label="Desde domingo" value={nf.format(criadosSemana.c)} hint={emNotas(criadosSemana)} />
              <Stat label="Últimos 30 dias" value={nf.format(criados30.c)} hint={emNotas(criados30)} />
            </div>
            <Heatmap data={criados} metric="anki" unidade="cartões criados" />
            <p className="text-xs text-faint mt-2">
              Conta os cartões que existem hoje na sua coleção, pelo dia em que foram criados (desde 08/11/2026).
              Uma nota com frente e verso invertido gera dois cartões; baralhos importados contam no dia da importação.
            </p>
          </section>

          {baralhos.length > 0 && (
            <section className="card mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-line">
                    <th className="p-3 font-medium">Baralho</th>
                    <th className="p-3 font-medium text-right">Revisar</th>
                    <th className="p-3 font-medium text-right">Aprendendo</th>
                    <th className="p-3 font-medium text-right" title="Cartões que você ainda não viu (o Anki libera alguns por dia)">Novos</th>
                    <th className="p-3 font-medium text-right hidden sm:table-cell">Cartões</th>
                    {conectado && <th className="p-3" />}
                  </tr>
                </thead>
                <tbody>
                  {baralhos.map((d) => (
                    <tr key={d.nome} className="border-b border-line last:border-0">
                      <td className="p-3" style={{ paddingLeft: 12 + (d.nome.split("::").length - 1) * 16 }}>{d.nome.split("::").pop()}</td>
                      <td className="p-3 text-right tabular-nums font-medium">{nf.format(d.revisar)}</td>
                      <td className="p-3 text-right tabular-nums">{nf.format(d.aprendendo)}</td>
                      <td className="p-3 text-right tabular-nums text-muted">{nf.format(d.novos)}</td>
                      <td className="p-3 text-right tabular-nums text-muted hidden sm:table-cell">{nf.format(d.total)}</td>
                      {conectado && (
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

          <p className="text-xs text-faint mt-3">
            Os números são os da última vez que o seu Anki (celular ou computador) sincronizou com o AnkiWeb. Revisou? Sincronize no Anki e toque em Atualizar aqui.
          </p>
        </>
      )}

      <AnkiNoComputador conectado={conectado} setConectado={setConectado} />

      {conta && (
        <p className="text-xs text-faint mt-6 flex flex-wrap items-center gap-x-2">
          <Cloud size={12} /> AnkiWeb: {conta.usuario}
          <button className="underline underline-offset-2 hover:text-ink" onClick={async () => {
            if (!confirm("Desligar o AnkiWeb deste sistema? O histórico que já está aqui continua.")) return;
            await ankiWeb("sair").catch(() => {});
            setMsg(null);
            await carregar();
          }}>desligar</button>
        </p>
      )}
    </Page>
  );
}

function Conectar({ onConectado }: { onConectado: () => Promise<void> }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <section className="card p-5 mb-4 max-w-xl">
      <h2 className="font-medium flex items-center gap-2"><Cloud size={17} className="text-icon" /> Conectar ao AnkiWeb</h2>
      <p className="text-sm text-muted mt-1">
        Use o mesmo e-mail e senha com que o seu Anki sincroniza. Depois disso é só tocar em <b className="text-ink">Atualizar</b>, no celular ou no computador — sem precisar do Anki aberto.
      </p>
      <form className="mt-4 space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        if (!usuario.trim() || !senha || indo) return;
        setIndo(true); setErro(null);
        try {
          await ankiWeb("entrar", { usuario: usuario.trim(), senha });
          setSenha("");
          await onConectado();
        } catch (x) {
          setErro((x as Error).message);
        } finally { setIndo(false); }
      }}>
        <label className="block"><span className="label">E-mail do AnkiWeb</span>
          <input className="input mt-1" type="email" autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} /></label>
        <label className="block"><span className="label">Senha do AnkiWeb</span>
          <input className="input mt-1" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
        {erro && <p className="text-sm text-critical">{erro}</p>}
        <button className="btn btn-primary" disabled={!usuario.trim() || !senha || indo}>{indo ? "Conectando e baixando seus números…" : "Conectar"}</button>
      </form>
      <ul className="text-xs text-faint mt-4 space-y-1 list-disc pl-4">
        <li>A senha não fica guardada: o AnkiWeb devolve uma chave de acesso (como faz com o próprio Anki), e só ela fica salva, protegida na sua conta.</li>
        <li>O sistema só lê: baixa uma cópia da coleção para contar revisões e cartões, e nunca altera os seus baralhos.</li>
      </ul>
    </section>
  );
}

/** AnkiConnect: opcional, para revisar dentro do sistema com o Anki aberto no computador. */
function AnkiNoComputador({ conectado, setConectado }: { conectado: boolean; setConectado: (v: boolean) => void }) {
  const [deck, setDeck] = useState("Leituras");
  const [url, setUrl] = useState("http://127.0.0.1:8765");
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    try { setDeck(localStorage.getItem("anki-deck") || "Leituras"); setUrl(ankiUrl()); } catch {}
  }, []);
  return (
    <details className="card group mt-6">
      <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between text-sm">
        <span>
          <b className="font-medium">Revisar dentro do sistema</b>
          <span className="text-muted"> · opcional, precisa do Anki aberto no computador{conectado ? " — conectado agora" : ""}</span>
        </span>
        <ChevronDown size={15} className="text-muted group-open:rotate-180 transition-transform" />
      </summary>
      <div className="border-t border-line p-5 grid md:grid-cols-2 gap-5 text-sm">
        <div className="space-y-3">
          <p className="text-muted">Com o Anki aberto neste computador (complemento AnkiConnect), aparece o botão <b className="text-ink">Revisar</b> em cada baralho, e os destaques de leitura podem virar cartões.</p>
          <label className="block space-y-1">
            <span className="label">Baralho para destaques de leitura</span>
            <input className="input" value={deck} onChange={(e) => { setDeck(e.target.value); try { localStorage.setItem("anki-deck", e.target.value); } catch {} }} />
          </label>
          <p className="text-xs text-muted">Frases das lições de idiomas vão para <code>Idiomas::&lt;idioma&gt;</code>.</p>
          <label className="block space-y-1">
            <span className="label">Endereço do AnkiConnect</span>
            <input className="input font-mono text-xs" value={url} onChange={(e) => { setUrl(e.target.value); try { localStorage.setItem("anki-url", e.target.value); } catch {} }} />
          </label>
          <button className="btn text-xs" onClick={async () => { const ok = await ankiOnline(); setConectado(ok); if (ok) await anki("version").catch(() => {}); }}>
            Testar conexão {conectado ? "✓" : ""}
          </button>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Como ligar (uma vez por computador)</h3>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted">
            <li>No Anki: <b>Ferramentas → Complementos → Obter complementos</b> e cole o código <code className="bg-surface-2 px-1 rounded">2055492159</code> (AnkiConnect). Reinicie o Anki.</li>
            <li>Em <b>Complementos → AnkiConnect → Configuração</b>, adicione este site em <code>webCorsOriginList</code>:
              <pre className="bg-surface-2 rounded p-2 mt-1 text-xs overflow-x-auto">{`"webCorsOriginList": [\n  "http://localhost",\n  "${origin || "https://seu-site"}"\n]`}</pre>
            </li>
            <li>Com o Anki aberto, toque em <b>Testar conexão</b>. Se o navegador perguntar sobre acesso à rede local, permita.</li>
          </ol>
        </div>
      </div>
    </details>
  );
}
