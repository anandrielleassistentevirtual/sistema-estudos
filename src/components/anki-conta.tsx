"use client";
/**
 * Anki dentro de Idiomas: a conexão com o AnkiWeb (conectar, atualizar, desligar) e, opcional,
 * a revisão dentro do sistema com o Anki aberto no computador (AnkiConnect).
 */
import { useEffect, useState } from "react";
import { ChevronDown, Cloud, RefreshCw } from "lucide-react";
import { anki, ankiOnline, ankiUrl, ankiWeb, type ContaAnki } from "@/lib/anki";

/** "agora há pouco", "há 12 min", "há 3 h", "ontem às 21:40" */
export function haQuanto(iso: string | null) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}


/** Linha do AnkiWeb: de quando são os números, Atualizar e desligar. */
export function AnkiWebBarra({ conta, onMudou }: { conta: ContaAnki; onMudou: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  async function atualizar() {
    setBusy(true); setMsg(null);
    try {
      const r = await ankiWeb("sincronizar");
      setMsg({ texto: r.mensagem ? `Recado do AnkiWeb: ${r.mensagem}` : r.semNovidades ? "Nada novo no AnkiWeb." : "Atualizado com o AnkiWeb." });
      await onMudou();
    } catch (e) { setMsg({ texto: (e as Error).message, erro: true }); }
    setBusy(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5"><Cloud size={13} /> Anki: números do AnkiWeb, atualizados {haQuanto(conta.sincronizado_em)}</span>
      <button className="btn text-xs py-0.5" onClick={() => void atualizar()} disabled={busy}>
        <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> {busy ? "Atualizando…" : "Atualizar"}
      </button>
      {msg ? <span className={msg.erro ? "text-critical" : ""}>{msg.texto}</span>
        : conta.erro ? <span className="text-critical">Última tentativa: {conta.erro}</span> : null}
    </div>
  );
}

export function Conectar({ onConectado }: { onConectado: () => Promise<void> }) {
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
export function AnkiNoComputador({ conectado, setConectado }: { conectado: boolean; setConectado: (v: boolean) => void }) {
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

