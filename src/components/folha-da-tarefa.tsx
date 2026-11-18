"use client";
/**
 * A folha de uma tarefa de escrever, dentro das Tarefas: o texto fica guardado na própria tarefa.
 * Conta como escrita (palavras e tempo ativo vão para as sessões de escrita, ligadas à tarefa),
 * do mesmo jeito que a sala de Escrita: apagar não desconta, corrigir não conta em dobro e colar
 * um bloco grande não conta como escrito; o cronômetro pausa quando você para.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Feather, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { contarPalavras } from "@/lib/escrita";
import { dayKey, fmtClock, nf } from "@/lib/dates";
import { useTimerEstado } from "./timer-context";
import type { Tarefa } from "@/lib/tarefas";

const OCIOSO_S = 60;

export function FolhaDaTarefa({ tarefa, onFechar }: {
  tarefa: Tarefa;
  /** devolve o texto e as palavras para a lista atualizar */
  onFechar: (escrito: string, palavras: number) => void;
}) {
  const timer = useTimerEstado();
  const [texto, setTexto] = useState(tarefa.escrito ?? "");
  const [salvo, setSalvo] = useState<"salvo" | "pendente" | "salvando">("salvo");
  const [relogio, setRelogio] = useState({ ativo: 0, parado: true, escritas: 0 });
  const [verDescricao, setVerDescricao] = useState(true);
  const area = useRef<HTMLTextAreaElement>(null);
  const atual = useRef(texto);
  atual.current = texto;
  const tSalvar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sess = useRef({ ativo: 0, ocioso: 0, ultimaAtividade: 0, inicio: "", id: "", studyId: "", escritas: 0, iniciada: false });
  /** maior contagem já alcançada nesta sessão: apagar e redigitar não conta duas vezes */
  const teto = useRef(contarPalavras(tarefa.escrito ?? ""));
  const timerRodando = useRef(false);
  timerRodando.current = timer.running;

  const salvarTexto = useCallback(async () => {
    if (tSalvar.current) clearTimeout(tSalvar.current);
    tSalvar.current = null;
    setSalvo("salvando");
    const v = atual.current;
    const { error } = await supabase().from("estudo_tarefas").update({ escrito: v, escrito_palavras: contarPalavras(v) }).eq("id", tarefa.id);
    setSalvo(error ? "pendente" : atual.current === v ? "salvo" : "pendente");
  }, [tarefa.id]);

  const salvarSessao = useCallback(async () => {
    const s = sess.current;
    if (!s.iniciada) return;
    const sb = supabase();
    const dados = { segundos: Math.round(s.ativo), ocioso: Math.round(s.ocioso), palavras: Math.round(s.escritas) };
    if (!s.id) {
      const { data } = await sb.from("escrita_sessoes").insert({ projeto_id: null, tarefa_id: tarefa.id, dia: dayKey(), inicio: s.inicio, ...dados }).select("id").single();
      if (data) s.id = (data as { id: string }).id;
    } else await sb.from("escrita_sessoes").update(dados).eq("id", s.id);
    // o tempo vai para o Dashboard, somado na tarefa (se o Timer estiver ligado, ele já conta)
    if (dados.segundos >= 30 && !timerRodando.current) {
      const st = { day: dayKey(new Date(s.inicio)), started_at: s.inicio, seconds: dados.segundos, category: "Escrita", label: `Escrita · ${tarefa.texto}`, tarefa_id: tarefa.id };
      if (!s.studyId) {
        const { data } = await sb.from("study_sessions").insert(st).select("id").single();
        if (data) s.studyId = (data as { id: string }).id;
      } else await sb.from("study_sessions").update(st).eq("id", s.studyId);
    }
  }, [tarefa.id, tarefa.texto]);

  function escrever(v: string) {
    const s = sess.current;
    if (!s.iniciada) { s.iniciada = true; s.inicio = new Date().toISOString(); }
    s.ultimaAtividade = Date.now();
    const n = contarPalavras(v);
    if (n > teto.current) {
      if (n - teto.current <= 150) s.escritas += n - teto.current; // colar um bloco grande não conta como escrito
      teto.current = n;
    } else if (teto.current - n >= 5) teto.current = n;
    setTexto(v);
    setSalvo("pendente");
    if (tSalvar.current) clearTimeout(tSalvar.current);
    tSalvar.current = setTimeout(() => void salvarTexto(), 900);
  }

  // cronômetro que pausa quando você para de escrever (ou sai da aba)
  useEffect(() => {
    let ult = Date.now();
    const t = setInterval(() => {
      const agora = Date.now();
      const dt = (agora - ult) / 1000;
      ult = agora;
      const s = sess.current;
      if (!s.iniciada) return;
      const parado = agora - s.ultimaAtividade > OCIOSO_S * 1000 || document.hidden;
      if (parado) s.ocioso += dt; else s.ativo += dt;
      setRelogio({ ativo: s.ativo, parado, escritas: s.escritas });
    }, 1000);
    const g = setInterval(() => void salvarSessao(), 30000);
    const vis = () => { if (document.hidden) { void salvarTexto(); void salvarSessao(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); clearInterval(g); document.removeEventListener("visibilitychange", vis); };
  }, [salvarSessao, salvarTexto]);

  useEffect(() => { setTimeout(() => { const a = area.current; if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length); } }, 50); }, []);

  async function fechar() {
    await Promise.all([salvarTexto(), salvarSessao()]);
    onFechar(atual.current, contarPalavras(atual.current));
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") void fechar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const palavras = contarPalavras(texto);
  return (
    <div className="fixed inset-0 z-[70] bg-[var(--bg)] flex flex-col">
      <header className="flex items-center gap-3 px-4 md:px-8 py-3 border-b border-line">
        <Feather size={16} className="text-icon shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted">Tarefa de escrever</div>
          <div className="font-medium truncate">{tarefa.texto}</div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted tabular-nums">
          <span title="Palavras no texto"><b className="text-ink font-medium">{nf.format(palavras)}</b> palavras</span>
          <span title="Palavras escritas agora (apagar não desconta; colar não conta)">+{nf.format(Math.round(relogio.escritas))} escritas</span>
          <span title="Tempo escrevendo (pausa quando você para por 1 minuto)" className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: relogio.parado ? "var(--faint)" : "var(--good)" }} />{fmtClock(relogio.ativo)}
          </span>
          <span>{salvo === "salvo" ? "salvo" : salvo === "salvando" ? "salvando…" : "…"}</span>
        </div>
        <button className="btn" onClick={() => void fechar()} title="Salvar e voltar às tarefas (Esc)"><X size={15} /> Fechar</button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[44rem] px-5 md:px-8 py-6 md:py-10">
          {tarefa.descricao?.trim() && (
            <div className="mb-6 rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">
              <button className="text-[11px] uppercase tracking-wider hover:text-ink" onClick={() => setVerDescricao((v) => !v)}>
                O que a tarefa pede {verDescricao ? "▴" : "▾"}
              </button>
              {verDescricao && <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{tarefa.descricao.trim()}</p>}
            </div>
          )}
          <textarea ref={area} value={texto} onChange={(e) => escrever(e.target.value)} spellCheck
            placeholder="Escreva aqui. Tudo o que você escreve conta como escrita do dia."
            className="w-full min-h-[60vh] resize-none bg-transparent outline-none font-serif text-[1.15rem] leading-[1.8] placeholder:text-faint"
            style={{ fieldSizing: "content" } as React.CSSProperties} />
        </div>
      </div>
      <div className="sm:hidden flex justify-between px-4 py-2 border-t border-line text-xs text-muted tabular-nums">
        <span>{nf.format(palavras)} palavras · +{nf.format(Math.round(relogio.escritas))}</span>
        <span>{fmtClock(relogio.ativo)} · {salvo === "salvo" ? "salvo" : "…"}</span>
      </div>
    </div>
  );
}
