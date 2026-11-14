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
  const barra = (v: number, max: number) => (
    <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
      <div className="h-full rounded-full bg-chart" style={{ width: `${Math.max(1, Math.min(100, (v / max) * 100))}%` }} />
    </div>
  );

  return (
    <section className="card p-5">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr] gap-6 items-start">
        <div>
          <div className="text-[13px] text-muted">Seus dados</div>
          <div className="text-sm mt-0.5 tabular-nums">{uso ? `${mb(uso.dados ?? uso.banco)} de 500 MB` : "…"}</div>
          {uso && (
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden flex">
              {/* parte fixa do Supabase (cinza claro) + seus dados */}
              <div className="h-full bg-faint/50" style={{ width: `${Math.min(100, ((uso.banco - (uso.dados ?? 0)) / LIMITE_BANCO) * 100)}%` }} />
              <div className="h-full bg-chart" style={{ width: `${Math.max(1, Math.min(100, ((uso.dados ?? uso.banco) / LIMITE_BANCO) * 100))}%` }} />
            </div>
          )}
          {uso?.dados !== undefined && (
            <div className="text-xs text-faint mt-1">+ {mb(uso.banco - uso.dados)} fixos do Supabase, que não crescem com o uso</div>
          )}
        </div>
        <div>
          <div className="text-[13px] text-muted">Arquivos</div>
          <div className="text-sm mt-0.5 tabular-nums">{uso ? `${mb(uso.arquivos)} de 1 GB` : "…"}</div>
          {uso && barra(uso.arquivos, LIMITE_ARQUIVOS)}
          {uso && <div className="text-xs text-faint mt-1">{uso.qtd_arquivos} arquivos</div>}
        </div>
        <div>
          <div className="text-[13px] text-muted">Cópia de segurança</div>
          <div className="text-sm mt-0.5">
            {dias === null ? "nenhuma cópia ainda" : dias === 0 ? "feita hoje" : `última há ${dias} ${dias === 1 ? "dia" : "dias"}`}
            {dias !== null && dias > 30 && <span className="text-critical"> · faça uma nova</span>}
          </div>
          <button className="btn mt-2" disabled={rodando} onClick={copiar}><Download size={15} /> {rodando ? "Copiando…" : "Baixar cópia de tudo"}</button>
          {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
        </div>
      </div>
    </section>
  );
}
