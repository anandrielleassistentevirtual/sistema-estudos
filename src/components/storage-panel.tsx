"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { baixarCopia } from "@/lib/backup";
import { CardHead } from "@/components/page";

// limites do plano gratuito do Supabase
const LIMITE_BANCO = 500 * 1024 * 1024;
const LIMITE_ARQUIVOS = 1024 * 1024 * 1024;

type Uso = { banco: number; dados?: number; arquivos: number; qtd_arquivos?: number };

// sem um número de verdade, um traço (nunca "NaN MB")
const mb = (b: number) =>
  !Number.isFinite(b) ? "—"
  : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB`
  : `${Math.max(0.1, b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0).replace(".", ",")} MB`;

/** cor pela situação: folgado (verde), atenção (âmbar), quase cheio (vermelho); sem número, cinza (nunca vermelho por engano) */
const corDoUso = (f: number) => (!Number.isFinite(f) ? "var(--faint)" : f < 0.6 ? "var(--good)" : f < 0.85 ? "var(--warn)" : "var(--critical)");
const nomeDoUso = (f: number) => (f < 0.6 ? "com folga" : f < 0.85 ? "atenção" : "quase cheio");
const pct = (f: number) => `${Math.max(1, Math.min(100, f * 100))}%`;

/** Um medidor: o nome e o número na mesma linha, a barra na largura toda e uma dica embaixo. */
function Medidor({ rotulo, valor, limite, frac, fixo = 0, cor, dica }: {
  rotulo: string; valor: string; limite: string; frac: number; cor: string; dica?: React.ReactNode;
  /** a parte fixa do Supabase, desenhada em cinza antes da sua */
  fixo?: number;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted truncate">{rotulo}</span>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          {/* sem número (carregando ou sem resposta), o traço fica apagado */}
          <span className={`ind-valor ${Number.isFinite(frac) ? "" : "text-faint"}`}>{valor}</span>
          <span className="text-xs text-muted">de {limite}</span>
        </span>
      </div>
      {/* o trilho fica sempre (a tela não pula ao carregar); a barra só aparece com uma fração de verdade */}
      <div className="mt-2.5 h-1.5 rounded-full bg-surface-2 overflow-hidden flex gap-px">
        {Number.isFinite(frac) && (
          <>
            {fixo > 0 && <div className="h-full bg-faint/40" style={{ width: pct(fixo) }} />}
            <div className="h-full rounded-r-full" style={{ width: pct(frac), background: cor }} />
          </>
        )}
      </div>
      {dica && <div className="text-xs text-faint mt-2">{dica}</div>}
    </div>
  );
}

/**
 * Duas perguntas, dois cartões: o espaço ainda cabe? (dois medidores e a situação)
 * e há uma cópia de segurança recente? (para nunca depender só da nuvem).
 */
export function StoragePanel() {
  // undefined = carregando; null = o banco não respondeu com os números
  const [uso, setUso] = useState<Uso | null | undefined>(undefined);
  const [ultima, setUltima] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    const sb = supabase();
    void sb.rpc("uso_armazenamento").then(({ data }) => {
      const d = data as Partial<Uso> | null;
      // só confia na resposta com os dois números (sem a função no banco vem vazia, e viraria "NaN MB")
      if (d && Number.isFinite(d.banco) && Number.isFinite(d.arquivos)) {
        setUso({
          banco: d.banco as number,
          arquivos: d.arquivos as number,
          dados: Number.isFinite(d.dados) ? d.dados : undefined,
          qtd_arquivos: Number.isFinite(d.qtd_arquivos) ? d.qtd_arquivos : undefined,
        });
      } else setUso(null);
    });
    void sb.auth.getUser().then(({ data }) => setUltima((data.user?.user_metadata?.ultima_copia as string) ?? null));
  }, []);

  async function copiar() {
    setRodando(true);
    try {
      const r = await baixarCopia(setMsg);
      setUltima(new Date().toISOString());
      setMsg(`Cópia baixada (${r.arquivos} ${r.arquivos === 1 ? "arquivo" : "arquivos"})${r.falhas.length ? `, ${r.falhas.length} não puderam ser copiados` : ""}. Guarde no seu computador ou no Drive.`);
    } catch (e) {
      setMsg(`Não consegui terminar a cópia: ${(e as Error).message}`);
    } finally {
      setRodando(false);
    }
  }

  const fracDados = uso ? (uso.dados ?? uso.banco) / LIMITE_BANCO : NaN;
  const fracFixo = uso && uso.dados !== undefined ? (uso.banco - uso.dados) / LIMITE_BANCO : 0;
  const fracArq = uso ? uso.arquivos / LIMITE_ARQUIVOS : NaN;
  // a situação do cartão é a do medidor mais cheio (o banco conta com a parte fixa)
  const pior = Math.max(fracDados + fracFixo, fracArq);
  const semNumero = uso === undefined ? "…" : "—";

  const dias = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / 864e5) : null;
  const copiaVelha = ultima !== undefined && (dias === null || dias > 30);

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
      <div className="card p-4 min-w-0 flex flex-col">
        <CardHead
          titulo="Espaço usado"
          meta={uso === null ? "Não consegui ler o uso agora" : "Plano gratuito do Supabase"}
          acao={Number.isFinite(pior) && (
            <span className="chip"><span className="dot !w-1.5 !h-1.5" style={{ background: corDoUso(pior) }} aria-hidden />{nomeDoUso(pior)}</span>
          )}
        />
        <div className="mt-1 space-y-5">
          <Medidor
            rotulo="Seus dados" limite="500 MB"
            valor={uso ? mb(uso.dados ?? uso.banco) : semNumero}
            frac={fracDados} fixo={fracFixo} cor={corDoUso(fracDados + fracFixo)}
            dica={uso?.dados !== undefined && `+ ${mb(uso.banco - uso.dados)} fixos do Supabase (não crescem com o uso)`}
          />
          <Medidor
            rotulo="Arquivos" limite="1 GB"
            valor={uso ? mb(uso.arquivos) : semNumero}
            frac={fracArq} cor={corDoUso(fracArq)}
            dica={uso?.qtd_arquivos !== undefined ? `${uso.qtd_arquivos} ${uso.qtd_arquivos === 1 ? "arquivo" : "arquivos"} · livros, capas e áudios` : "Livros, capas e áudios"}
          />
        </div>
      </div>

      <div className="card p-4 min-w-0 flex flex-col">
        <CardHead titulo="Cópia de segurança" meta="Dados, textos e arquivos num só .zip" />
        <div className="mt-1 text-[1.6rem] font-medium tracking-[-0.02em] leading-none tabular-nums" style={copiaVelha ? { color: "var(--warn)" } : undefined}>
          {ultima === undefined ? "…" : dias === null ? "nenhuma" : dias === 0 ? "hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`}
        </div>
        <div className="text-xs text-faint mt-2 mb-5">{ultima === undefined ? "\u00a0" : copiaVelha ? "Faça uma cópia: o ideal é uma por mês." : "Última cópia baixada para o seu aparelho."}</div>
        {/* mt-auto: o botão desce até a base, alinhado ao fim do cartão ao lado */}
        <button className="btn mt-auto self-start" disabled={rodando} onClick={copiar}><Download size={15} /> {rodando ? "Copiando…" : "Baixar cópia de tudo"}</button>
        {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
      </div>
    </section>
  );
}
