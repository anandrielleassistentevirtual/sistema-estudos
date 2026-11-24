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
  const [emAndamento, setEmAndamento] = useState(false);

  useEffect(() => {
    void ultimaConfissao().then(setUltima);
    void haExamePendente().then(setEmAndamento);
  }, []);
  if (ultima === undefined) return null;

  async function salvar() {
    if (await haExamePendente()) {
      if (!confirm("Há um exame de consciência guardado. Registrar a confissão apaga para sempre os pecados marcados nele. Continuar?")) return;
    }
    await registrarConfissao(d);
    setUltima(d);
    setEmAndamento(false);
    setMarcando(false);
  }

  const dias = ultima ? diasDesde(ultima) : null;
  const atrasada = dias !== null && dias > PRAZO_CONFISSAO;
  return (
    // uma linha só: o aviso, quando foi a última e os botões (o exame guardado aparece como um lembrete curto)
    <section className={`card px-3.5 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${atrasada ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : ""}`}
      style={atrasada ? { background: "color-mix(in srgb, var(--warn) 8%, var(--surface))" } : undefined}>
      <div className="flex items-center gap-2 min-w-0 basis-full sm:basis-0 flex-1 text-sm">
        {atrasada ? <BellRing size={15} className="shrink-0" style={{ color: "var(--warn)" }} /> : <ListChecks size={15} className="text-icon shrink-0" />}
        <span className="font-medium shrink-0">{ultima === null ? "Quando foi a sua última confissão?" : atrasada ? "Está na hora da confissão" : "Confissão em dia"}</span>
        {ultima && <span className="text-xs text-muted truncate">· última em {dataBr(ultima)}, {tempoDesde(dias!)}{emAndamento ? " · há um exame guardado" : ""}</span>}
      </div>
      {marcando || ultima === null ? (
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input type="date" className="input py-1 flex-1 sm:flex-none sm:w-auto text-sm" max={hojeIso()} value={d} onChange={(e) => setD(e.target.value)} />
          <button className="btn" disabled={!d} onClick={salvar}>Salvar</button>
          {ultima !== null && <button className="btn btn-ghost" onClick={() => setMarcando(false)}>Cancelar</button>}
        </div>
      ) : (
        <div className="flex items-center gap-2 ml-auto">
          <Link href="/oracao/exame" className="btn btn-ghost text-xs py-1">{emAndamento ? "Abrir o exame" : "Exame de consciência"}</Link>
          <button className="btn text-xs py-1" onClick={() => { setD(hojeIso()); setMarcando(true); }}>Me confessei</button>
        </div>
      )}
    </section>
  );
}
