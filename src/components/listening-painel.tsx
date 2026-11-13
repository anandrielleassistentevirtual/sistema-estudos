"use client";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Headphones, KeyRound } from "lucide-react";
import { haQuanto } from "@/components/anki-conta";
import { cancelarChaveListening, chavesListening, criarChaveListening, scriptListening, type ChaveListening } from "@/lib/listening";

/** Ligar o listening automático do curso do Mairo a um idioma (Tampermonkey + chave pessoal). */
export function ListeningPainel({ idioma }: { idioma: string }) {
  const [chaves, setChaves] = useState<ChaveListening[] | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  const carregar = () => void chavesListening().then(setChaves);
  useEffect(carregar, []);
  const minhas = (chaves ?? []).filter((c) => c.idioma === idioma);
  const ultimo = minhas.map((c) => c.ultimo_uso).filter(Boolean).sort().pop() ?? null;

  async function gerar() {
    setIndo(true); setErro(null); setCopiado(false);
    try {
      const k = await criarChaveListening(idioma);
      setScript(scriptListening(k, idioma));
      carregar();
    } catch (e) { setErro((e as Error).message); }
    setIndo(false);
  }

  async function copiar() {
    if (!script) return;
    try { await navigator.clipboard.writeText(script); setCopiado(true); } catch { setErro("Não consegui copiar: selecione o texto e copie com Ctrl+C."); }
  }

  return (
    <details className="card group mt-6" open={!!script}>
      <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <Headphones size={16} className="text-icon" />
          <b className="font-medium">Listening automático do curso do Mairo</b>
          <span className="text-muted">
            · {minhas.length ? (ultimo ? `ligado · último envio ${haQuanto(ultimo)}` : "ligado · esperando o primeiro áudio") : "não ligado"}
          </span>
        </span>
        <ChevronDown size={15} className="text-muted group-open:rotate-180 transition-transform shrink-0" />
      </summary>
      <div className="border-t border-line p-5 space-y-4 text-sm">
        <p className="text-muted">
          Enquanto o player do curso estiver <b className="text-ink">tocando de verdade</b> no seu computador, os minutos entram aqui em {idioma} como
          <b className="text-ink"> Listening</b> (pausado, mudo ou arrastando a barra não conta). Não usa a senha do curso: só uma chave pessoal, que você pode cancelar.
        </p>

        {!script ? (
          <button className="btn btn-primary" onClick={() => void gerar()} disabled={indo}>
            <KeyRound size={14} /> {indo ? "Gerando…" : minhas.length ? "Gerar outro script (outro computador)" : "Gerar a chave e o script"}
          </button>
        ) : (
          <div className="space-y-3">
            <ol className="list-decimal pl-5 space-y-2 text-muted">
              <li>No Chrome, instale a extensão <b className="text-ink">Tampermonkey</b>{" "}
                <a className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink" href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo" target="_blank" rel="noopener noreferrer">
                  (abrir na Chrome Web Store <ExternalLink size={11} />)</a> e clique em <b className="text-ink">Usar no Chrome</b>.</li>
              <li>Clique no ícone da extensão (quebra-cabeça, no canto do Chrome) → <b className="text-ink">Tampermonkey</b> → <b className="text-ink">Criar um novo script</b>.</li>
              <li>Apague tudo o que aparecer lá, cole o script abaixo e salve com <b className="text-ink">Ctrl+S</b>.</li>
              <li>Se o Tampermonkey avisar que scripts estão desativados: abra <b className="text-ink">chrome://extensions</b> → Tampermonkey → <b className="text-ink">Detalhes</b> e ligue <b className="text-ink">Permitir scripts do usuário</b> (em versões mais antigas do Chrome, é o <b className="text-ink">Modo do desenvolvedor</b>, no canto da mesma página).</li>
              <li>Abra a Playlist do curso e dê play. Em 1 a 2 minutos o tempo aparece aqui (recarregue a página).</li>
            </ol>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => void copiar()}>{copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar o script</>}</button>
              <button className="btn btn-ghost" onClick={() => setScript(null)}>Fechar</button>
            </div>
            <textarea readOnly className="input font-mono text-[11px] leading-snug h-40" value={script} onFocus={(e) => e.currentTarget.select()} />
            <p className="text-xs text-faint">Guarde o script só para você: a chave dentro dele soma minutos de escuta na sua conta.</p>
          </div>
        )}

        {minhas.length > 0 && (
          <div>
            <h4 className="label mb-1.5">Chaves ligadas a {idioma}</h4>
            <ul className="space-y-1 text-xs text-muted">
              {minhas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>criada em {new Date(c.created_at).toLocaleDateString("pt-BR")} · {c.ultimo_uso ? `último envio ${haQuanto(c.ultimo_uso)}` : "ainda sem envios"}</span>
                  <button className="underline underline-offset-2 hover:text-critical" onClick={async () => {
                    if (!confirm("Cancelar esta chave? O script que usa ela para de enviar minutos (o que já foi registrado continua).")) return;
                    await cancelarChaveListening(c.id); carregar();
                  }}>cancelar</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {erro && <p className="text-critical">{erro}</p>}
      </div>
    </details>
  );
}
