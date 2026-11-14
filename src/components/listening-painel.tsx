"use client";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Download, ExternalLink, Headphones, Laptop, Monitor, Smartphone } from "lucide-react";
import { haQuanto } from "@/components/anki-conta";
import { cancelarChaveListening, chavesListening, criarInstalacaoListening, scriptListening, type ChaveListening } from "@/lib/listening";

type Tipo = "computador" | "android" | "iphone";

const TIPOS: { id: Tipo; nome: string; icone: typeof Monitor }[] = [
  { id: "computador", nome: "Computador", icone: Monitor },
  { id: "android", nome: "Celular Android", icone: Smartphone },
  { id: "iphone", nome: "iPhone", icone: Smartphone },
];

function detectar(): Tipo {
  if (typeof navigator === "undefined") return "computador";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "computador";
}

const link = (href: string, texto: string) => (
  <a className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink" href={href} target="_blank" rel="noopener noreferrer">{texto} <ExternalLink size={11} /></a>
);

/** Listening automático do curso do Mairo, em vários aparelhos (cada um com a sua chave). */
export function ListeningPainel({ idioma }: { idioma: string }) {
  const [chaves, setChaves] = useState<ChaveListening[] | null>(null);
  const [tipo, setTipo] = useState<Tipo>("computador");
  const [aparelho, setAparelho] = useState("");
  const [gerado, setGerado] = useState<{ url: string; script: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  const carregar = () => void chavesListening().then(setChaves);
  useEffect(() => {
    carregar();
    const t = detectar();
    setTipo(t);
    setAparelho(t === "computador" ? "PC" : "Celular");
  }, []);
  const minhas = (chaves ?? []).filter((c) => c.idioma === idioma);
  const ultimo = minhas.map((c) => c.ultimo_uso).filter(Boolean).sort().pop() ?? null;

  async function instalar() {
    setIndo(true); setErro(null); setCopiado(false);
    try {
      const nome = aparelho.trim() || TIPOS.find((t) => t.id === tipo)!.nome;
      const { codigo, chave } = await criarInstalacaoListening(idioma, nome);
      const url = `${window.location.origin}/api/listening/${codigo}/listening.user.js`;
      setGerado({ url, script: scriptListening(chave, idioma, nome) });
      carregar();
      window.open(url, "_blank");
    } catch (e) { setErro((e as Error).message); }
    setIndo(false);
  }

  async function copiar() {
    if (!gerado) return;
    try { await navigator.clipboard.writeText(gerado.script); setCopiado(true); } catch { setErro("Não consegui copiar: selecione o texto e copie."); }
  }

  const passos: Record<Tipo, React.ReactNode[]> = {
    computador: [
      <>No Chrome (ou Edge), instale a extensão <b className="text-ink">Tampermonkey</b> — {link("https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo", "Chrome Web Store")}.</>,
      <>Abra <b className="text-ink">chrome://extensions</b> → Tampermonkey → <b className="text-ink">Detalhes</b> e ligue <b className="text-ink">Permitir scripts do usuário</b> (em versões antigas do Chrome: <b className="text-ink">Modo do desenvolvedor</b>, no canto da página).</>,
      <>Toque em <b className="text-ink">Instalar neste aparelho</b> (abaixo). Na página do Tampermonkey que abrir, clique em <b className="text-ink">Instalar</b>.</>,
      <>Pronto: use a Playlist do curso neste computador. Faça o mesmo no notebook (com o nome “Notebook”).</>,
    ],
    android: [
      <>Instale o navegador <b className="text-ink">Firefox</b> — {link("https://play.google.com/store/apps/details?id=org.mozilla.firefox", "Play Store")} (o Chrome do celular não aceita extensões).</>,
      <>No Firefox: menu <b className="text-ink">⋮</b> → <b className="text-ink">Extensões</b> → procure <b className="text-ink">Tampermonkey</b> → <b className="text-ink">+</b> → <b className="text-ink">Adicionar</b>.</>,
      <>Ainda no Firefox, entre no Sistema de Estudos → Idiomas → este quadro, e toque em <b className="text-ink">Instalar neste aparelho</b>. Na tela do Tampermonkey, toque em <b className="text-ink">Instalar</b>.</>,
      <>Escute a Playlist do curso <b className="text-ink">pelo Firefox</b>. Com a tela bloqueada, os minutos entram quando você desbloquear.</>,
    ],
    iphone: [
      <>Instale o app gratuito <b className="text-ink">Userscripts</b> — {link("https://apps.apple.com/app/userscripts/id1463298887", "App Store")} — e abra o app uma vez.</>,
      <>Em <b className="text-ink">Ajustes → Apps → Safari → Extensões → Userscripts</b>: ative e permita em <b className="text-ink">todos os sites</b> (ou em curso.mairovergara.com e neste sistema).</>,
      <>No <b className="text-ink">Safari</b>, entre no Sistema de Estudos → Idiomas → este quadro, e toque em <b className="text-ink">Instalar neste aparelho</b>. Na página que abrir, toque no ícone <b className="text-ink">aA</b> (ou no quebra-cabeça) → <b className="text-ink">Userscripts</b> → <b className="text-ink">Instalar</b>.</>,
      <>Escute a Playlist do curso <b className="text-ink">pelo Safari</b>. Com a tela bloqueada, os minutos entram quando você desbloquear.</>,
    ],
  };

  return (
    <details className="card group mt-6" open={!!gerado}>
      <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 flex-wrap">
          <Headphones size={16} className="text-icon" />
          <b className="font-medium">Listening automático</b>
          <span className="text-muted">
            · {minhas.length ? `${minhas.length} ${minhas.length === 1 ? "aparelho" : "aparelhos"}${ultimo ? ` · último envio ${haQuanto(ultimo)}` : " · esperando o primeiro áudio"}` : "não ligado"}
          </span>
        </span>
        <ChevronDown size={15} className="text-muted group-open:rotate-180 transition-transform shrink-0" />
      </summary>
      <div className="border-t border-line p-5 space-y-5 text-sm">
        <p className="text-muted">
          Enquanto o player do curso estiver <b className="text-ink">tocando de verdade</b>, os minutos entram aqui em {idioma} como <b className="text-ink">Listening</b>
          {" "}(pausado, mudo ou arrastando a barra não conta). Ligue cada aparelho uma vez — PC, notebook e celular — cada um com a sua chave, que dá para cancelar.
        </p>

        {minhas.length > 0 && (
          <div>
            <h4 className="label mb-1.5">Aparelhos ligados</h4>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {minhas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    {/celular|iphone|android/i.test(c.aparelho) ? <Smartphone size={14} className="text-icon shrink-0" /> : /note/i.test(c.aparelho) ? <Laptop size={14} className="text-icon shrink-0" /> : <Monitor size={14} className="text-icon shrink-0" />}
                    <span className="truncate"><b className="font-medium">{c.aparelho || "Aparelho"}</b>
                      <span className="text-xs text-muted"> · {c.ultimo_uso ? `último envio ${haQuanto(c.ultimo_uso)}` : "ainda sem envios"}</span></span>
                  </span>
                  <button className="text-xs underline underline-offset-2 text-muted hover:text-critical shrink-0" onClick={async () => {
                    if (!confirm(`Desligar “${c.aparelho || "este aparelho"}”? Ele para de enviar minutos (o que já foi registrado continua).`)) return;
                    await cancelarChaveListening(c.id); carregar();
                  }}>desligar</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="label">Ligar um aparelho</h4>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <button key={t.id} onClick={() => { setTipo(t.id); setAparelho(t.id === "computador" ? "PC" : "Celular"); setGerado(null); }}
                className={`text-xs rounded-full px-2.5 py-1 border inline-flex items-center gap-1 ${tipo === t.id ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}>
                <t.icone size={12} /> {t.nome}
              </button>
            ))}
          </div>
          <ol className="list-decimal pl-5 space-y-2 text-muted">{passos[tipo].map((p, i) => <li key={i}>{p}</li>)}</ol>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="label">Nome deste aparelho</span>
              <input className="input mt-1 w-44" value={aparelho} onChange={(e) => setAparelho(e.target.value)} placeholder="PC, Notebook, Celular…" /></label>
            <button className="btn btn-primary" onClick={() => void instalar()} disabled={indo}><Download size={14} /> {indo ? "Preparando…" : "Instalar neste aparelho"}</button>
          </div>
          <p className="text-xs text-faint">Abra esta página <b>no próprio aparelho</b> que vai escutar (no celular, pelo Firefox ou pelo Safari) e toque em “Instalar neste aparelho”.</p>
          <div className="rounded-lg bg-surface-2 p-3 text-xs text-muted space-y-1">
            <p><b className="text-ink">Como saber se está funcionando:</b> na página do curso aparece, no canto de baixo à esquerda, o selo <b className="text-ink">🎧 Listening</b>. Ao dar play ele mostra “● ouvindo” e, a cada minuto, “enviados ao sistema”.</p>
            <p>Não apareceu o selo? O script não está rodando: confira se o Tampermonkey está instalado e com <b className="text-ink">Permitir scripts do usuário</b> ligado. Se, ao tocar em “Instalar neste aparelho”, abriu uma página cheia de código (em vez da tela “Instalar” do Tampermonkey), é sinal de que a extensão não está ligada neste navegador.</p>
            <p>O selo aparece mas fica em “aguardando o áudio tocar” mesmo com o áudio tocando? Me avise: o player usa outro jeito de tocar e eu ajusto.</p>
          </div>
        </div>

        {gerado && (
          <div className="space-y-2 rounded-lg bg-surface-2 p-3">
            <p className="text-xs text-muted">
              Abriu a página de instalação em outra aba. Se ela não abriu ou a extensão não mostrou “Instalar”,{" "}
              <a className="underline underline-offset-2 hover:text-ink" href={gerado.url} target="_blank" rel="noopener noreferrer">abra o link de novo</a> (vale 30 minutos) ou copie o script e cole num script novo da extensão.
            </p>
            <button className="btn text-xs" onClick={() => void copiar()}>{copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar o script</>}</button>
          </div>
        )}
        {erro && <p className="text-critical">{erro}</p>}
      </div>
    </details>
  );
}
