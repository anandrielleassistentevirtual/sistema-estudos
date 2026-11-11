"use client";
import { useState } from "react";
import { hojeIso } from "@/lib/confissao";

/** Registrar a confissão: a data, a penitência (opcional, para não esquecer) e o aviso de que os pecados somem. */
export function FizAConfissao({ total, onClose, onConfirmar }: {
  total: number; onClose: () => void; onConfirmar: (data: string, penitencia: string) => Promise<void>;
}) {
  const [d, setD] = useState(hojeIso());
  const [penitencia, setPenitencia] = useState("");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState("");
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg">Fiz a confissão</h2>
        <label className="block"><span className="label">Quando?</span>
          <input type="date" className="input mt-1" max={hojeIso()} value={d} onChange={(e) => setD(e.target.value)} /></label>
        <label className="block"><span className="label">Penitência (opcional, para não esquecer)</span>
          <textarea className="input mt-1 min-h-[64px]" value={penitencia} placeholder="ex.: rezar um terço; ler o Salmo 50"
            onChange={(e) => setPenitencia(e.target.value)} /></label>
        <p className="text-sm text-muted">
          {total
            ? <>Os {total === 1 ? "pecado marcado será apagado" : `${total} pecados marcados serão apagados`} <b className="text-ink">para sempre</b>, sem cópia. Ficam guardadas só a data e, cifrada, a penitência até você marcá-la como cumprida.</>
            : "Ficam guardadas só a data e, cifrada, a penitência até você marcá-la como cumprida."}
        </p>
        {erro && <p className="text-sm" style={{ color: "var(--bad, #d33)" }}>{erro}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!d || indo} onClick={async () => {
            setIndo(true); setErro("");
            try { await onConfirmar(d, penitencia); } catch (e) { setErro(`Não foi possível registrar agora (${(e as Error).message}). Nada foi apagado; tente de novo.`); setIndo(false); }
          }}>
            {indo ? "Registrando…" : total ? "Confirmar e apagar" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
