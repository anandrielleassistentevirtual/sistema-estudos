"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, ListChecks } from "lucide-react";
import { dataBr, haExamePendente, hojeIso, registrarConfissao, ultimaConfissao } from "@/lib/confissao";
import { PRAZO_CONFISSAO, diasDesde, tempoDesde } from "@/lib/exame";

/** Dashboard: quando foi a última confissão; depois de 30 dias, avisa que está na hora. */
export function ConfissaoAviso() {
  const [ultima, setUltima] = useState<string | null | undefined>(undefined);
  const [marcando, setMarcando] = useState(false);
  const [d, setD] = useState(hojeIso());

  useEffect(() => { void ultimaConfissao().then(setUltima); }, []);
  if (ultima === undefined) return null;

  async function salvar() {
    if (await haExamePendente()) {
      if (!confirm("Há um exame de consciência em andamento. Registrar a confissão apaga para sempre os pecados marcados nele. Continuar?")) return;
    }
    await registrarConfissao(d);
    setUltima(d);
    setMarcando(false);
  }

  const dias = ultima ? diasDesde(ultima) : null;
  const atrasada = dias !== null && dias > PRAZO_CONFISSAO;
  return (
    <section className={`card mt-4 px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2 ${atrasada ? "border-[color-mix(in_srgb,#c98a1a_55%,transparent)]" : ""}`}
      style={atrasada ? { background: "color-mix(in srgb, #c98a1a 9%, var(--surface))" } : undefined}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {atrasada ? <BellRing size={17} className="shrink-0" style={{ color: "#c98a1a" }} /> : <ListChecks size={17} className="text-icon shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {ultima === null ? "Quando foi a sua última confissão?" : atrasada ? "Está na hora da confissão" : "Confissão em dia"}
          </div>
          {ultima && (
            <div className="text-xs text-muted">
              Última confissão em {dataBr(ultima)}, {tempoDesde(dias!)}{atrasada ? ` (mais de ${PRAZO_CONFISSAO} dias)` : ""}.
            </div>
          )}
        </div>
      </div>
      {marcando || ultima === null ? (
        <div className="flex items-center gap-2">
          <input type="date" className="input py-1 w-auto text-sm" max={hojeIso()} value={d} onChange={(e) => setD(e.target.value)} />
          <button className="btn" disabled={!d} onClick={salvar}>Salvar</button>
          {ultima !== null && <button className="btn btn-ghost" onClick={() => setMarcando(false)}>Cancelar</button>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href="/oracao/exame" className="btn btn-ghost text-sm">Exame de consciência</Link>
          <button className="btn text-sm" onClick={() => { setD(hojeIso()); setMarcando(true); }}>Me confessei</button>
        </div>
      )}
    </section>
  );
}
