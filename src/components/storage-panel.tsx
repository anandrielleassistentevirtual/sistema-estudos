"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { baixarCopia } from "@/lib/backup";

// limites do plano gratuito do Supabase
const LIMITE_BANCO = 500 * 1024 * 1024;
const LIMITE_ARQUIVOS = 1024 * 1024 * 1024;

const mb = (b: number) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB` : `${Math.max(0.1, b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0).replace(".", ",")} MB`);

/** Quanto do plano está em uso + cópia de segurança de tudo (para nunca depender só da nuvem). */
export function StoragePanel() {
  const [uso, setUso] = useState<{ banco: number; dados?: number; arquivos: number; qtd_arquivos: number } | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    const sb = supabase();
    void sb.rpc("uso_armazenamento").then(({ data }) => { if (data) setUso(data as typeof uso); });
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

  const dias = ultima ? Math.floor((Date.now() - new Date(ultima).getTime()) / 864e5) : null;
  /** cor da barra pela situação: folgado (verde), atenção (âmbar), quase cheio (vermelho) */
  const corDoUso = (f: number) => (f < 0.6 ? "var(--good)" : f < 0.85 ? "var(--warn)" : "var(--critical)");
  const fracDados = uso ? (uso.dados ?? uso.banco) / LIMITE_BANCO : 0;
  const fracFixo = uso && uso.dados !== undefined ? (uso.banco - uso.dados) / LIMITE_BANCO : 0;
  const fracArq = uso ? uso.arquivos / LIMITE_ARQUIVOS : 0;
  const pct = (f: number) => `${Math.max(1, Math.min(100, f * 100))}%`;
  const copiaVelha = dias === null || dias > 30;

  // os mesmos cartões de indicador das outras abas: o nome, o número grande, a barra e a legenda
  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 items-stretch">
      <div className="card p-4 min-w-0">
        <div className="text-xs text-muted">Seus dados</div>
        <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
          <span className="text-[1.6rem] font-medium tracking-[-0.02em] leading-none">{uso ? mb(uso.dados ?? uso.banco) : "…"}</span>
          <span className="text-xs text-muted">de 500 MB</span>
        </div>
        {uso && (
          <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden flex gap-px">
            {/* parte fixa do Supabase (cinza) + os seus dados (na cor da situação) */}
            {fracFixo > 0 && <div className="h-full bg-faint/40" style={{ width: pct(fracFixo) }} />}
            <div className="h-full rounded-r-full" style={{ width: pct(fracDados), background: corDoUso(fracDados + fracFixo) }} />
          </div>
        )}
        {uso?.dados !== undefined && (
          <div className="text-xs text-faint mt-2">+ {mb(uso.banco - uso.dados)} fixos do Supabase, que não crescem com o uso</div>
        )}
      </div>
      <div className="card p-4 min-w-0">
        <div className="text-xs text-muted">Arquivos</div>
        <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
          <span className="text-[1.6rem] font-medium tracking-[-0.02em] leading-none">{uso ? mb(uso.arquivos) : "…"}</span>
          <span className="text-xs text-muted">de 1 GB</span>
        </div>
        {uso && (
          <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: pct(fracArq), background: corDoUso(fracArq) }} />
          </div>
        )}
        {uso && <div className="text-xs text-faint mt-2">{uso.qtd_arquivos} {uso.qtd_arquivos === 1 ? "arquivo" : "arquivos"} · livros, capas e áudios</div>}
      </div>
      <div className="card p-4 min-w-0 flex flex-col">
        <div className="text-xs text-muted">Cópia de segurança</div>
        <div className="mt-1 text-[1.6rem] font-medium tracking-[-0.02em] leading-none" style={copiaVelha ? { color: "var(--warn)" } : undefined}>
          {dias === null ? "nenhuma" : dias === 0 ? "hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`}
        </div>
        <div className="text-xs text-faint mt-2">{copiaVelha ? "Faça uma cópia: o ideal é uma por mês." : "Última cópia baixada para o seu aparelho."}</div>
        <button className="btn mt-3 self-start" disabled={rodando} onClick={copiar}><Download size={15} /> {rodando ? "Copiando…" : "Baixar cópia de tudo"}</button>
        {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
      </div>
    </section>
  );
}
