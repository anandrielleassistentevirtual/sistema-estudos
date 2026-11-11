"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, CircleCheck, CloudOff, Lock, Plus, ScrollText, ShieldCheck, Trash2, X } from "lucide-react";
import { Page } from "@/components/page";
import { OracaoTabs } from "@/components/oracao-tabs";
import { CriarSenha, Destrancar } from "@/components/exame/senha";
import { AntesDoExame, Contricao, Quantidade, UltimaConfissao } from "@/components/exame/partes";
import { ListaParaSacerdote } from "@/components/exame/lista-sacerdote";
import { FizAConfissao } from "@/components/exame/fiz-a-confissao";
import { useCofre } from "@/lib/exame-cofre";
import { MANDAMENTOS, PRAZO_CONFISSAO, diasDesde, semQuantidade } from "@/lib/exame";
import { corrigirUltimaConfissao, dataBr, ultimaConfissao } from "@/lib/confissao";

const TRANCAR_PARADO = 10 * 60_000;    // 10 min sem mexer
const TRANCAR_FORA = 60_000;           // 1 min com o app em segundo plano
const ROTULO: Record<string, string> = { cp: "Anterior", m1: "1º", m2: "2º", m3: "3º", m4: "4º", m5: "5º", m6: "6º/9º", m7: "7º/10º", m8: "8º" };
const vermelho = { color: "var(--bad, #d33)" };

export default function ExameDeConsciencia() {
  const { cofre, chave, dados, gravacao, aviso, setAviso, mudar, abrir, criar, apagarTudo, trancar, confessar } = useCofre();
  const [ultima, setUltima] = useState<string | null>(null);
  const [vendoLista, setVendoLista] = useState(false);
  const [confessando, setConfessando] = useState(false);
  const [cobrar, setCobrar] = useState(false); // depois de tentar abrir a lista, destaca o que está sem quantidade
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [oculto, setOculto] = useState(false); // app em segundo plano: o conteúdo fica borrado

  useEffect(() => { void ultimaConfissao().then(setUltima); }, []);

  // ao abrir o exame, os mandamentos ainda não examinados ficam abertos
  useEffect(() => {
    if (!chave) return;
    const feitos = new Set(dados.revisados ?? []);
    setAbertos(new Set(MANDAMENTOS.filter((m) => !feitos.has(m.id)).map((m) => m.id)));
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = useCallback(async () => { setVendoLista(false); setConfessando(false); setCobrar(false); await trancar(); }, [trancar]);

  // tranca sozinho: 10 min sem mexer, ou 1 min com o app em segundo plano (e borra a tela enquanto isso)
  useEffect(() => {
    if (!chave) return;
    let ultimoMovimento = Date.now();
    let saiuEm = 0;
    const mexeu = () => { ultimoMovimento = Date.now(); };
    const eventos = ["pointerdown", "keydown", "scroll", "touchstart"];
    eventos.forEach((e) => window.addEventListener(e, mexeu, { passive: true }));
    const visibilidade = () => {
      if (document.visibilityState === "hidden") { saiuEm = Date.now(); setOculto(true); return; }
      if (saiuEm && Date.now() - saiuEm > TRANCAR_FORA) void fechar();
      saiuEm = 0;
      setOculto(false);
      ultimoMovimento = Date.now();
    };
    document.addEventListener("visibilitychange", visibilidade);
    const t = setInterval(() => { if (Date.now() - ultimoMovimento > TRANCAR_PARADO) void fechar(); }, 20_000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, mexeu));
      document.removeEventListener("visibilitychange", visibilidade);
      clearInterval(t);
    };
  }, [chave, fechar]);

  const total = Object.keys(dados.marcas).length + dados.outros.filter((o) => o.texto.trim()).length;
  const faltam = semQuantidade(dados);
  const revisados = new Set(dados.revisados ?? []);

  function paraOSacerdote() {
    if (faltam.length) {
      setCobrar(true);
      const item = MANDAMENTOS.find((m) => m.itens.some((i) => i.id === faltam[0]) || dados.outros.some((o) => o.id === faltam[0] && o.mand === m.id));
      if (item) setAbertos((s) => new Set(s).add(item.id));
      setTimeout(() => document.getElementById(`p-${faltam[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    setVendoLista(true);
  }
  const irPara = (id: string) => {
    setAbertos((s) => new Set(s).add(id));
    setTimeout(() => document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  function examinei(id: string) {
    const ja = revisados.has(id);
    mudar((d) => ({ ...d, revisados: ja ? (d.revisados ?? []).filter((x) => x !== id) : [...(d.revisados ?? []), id] }));
    if (ja) return;
    // fecha este e segue para o próximo ainda não examinado
    const prox = MANDAMENTOS.slice(MANDAMENTOS.findIndex((m) => m.id === id) + 1).find((m) => !revisados.has(m.id));
    setAbertos((s) => { const n = new Set(s); n.delete(id); if (prox) n.add(prox.id); return n; });
    setTimeout(() => document.getElementById(`m-${prox?.id ?? "contricao"}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  const abas = <OracaoTabs className="mb-6 -mt-2" />;
  if (cofre === undefined) return <Page tabs={abas} title="Exame de consciência">{null}</Page>;
  if (!chave) {
    return (
      <Page tabs={abas} title="Exame de consciência">
        {cofre === null ? <CriarSenha onCriar={criar} /> : <Destrancar onAbrir={abrir} onApagarTudo={apagarTudo} />}
      </Page>
    );
  }

  const dias = ultima ? diasDesde(ultima) : null;
  return (
    <Page tabs={abas} title="Exame de consciência"
      subtitle="Sem ansiedade nem escrúpulo: a espécie e o número dos pecados."
      actions={
        <>
          {gravacao === "sem-conexao" ? (
            <span className="text-xs flex items-center gap-1" style={{ color: "#c98a1a" }} title="As mudanças estão guardadas, cifradas, neste aparelho; o envio é tentado de novo sozinho">
              <CloudOff size={13} /> Sem conexão: guardado neste aparelho
            </span>
          ) : (
            <span className="text-xs text-faint flex items-center gap-1" title="Só abre com a sua senha">
              <ShieldCheck size={13} /> {gravacao === "salvando" ? "Salvando…" : gravacao === "salvo" ? "Salvo e cifrado" : "Cifrado"}
            </span>
          )}
          <button className="btn" onClick={() => void fechar()}><Lock size={15} /> Trancar</button>
        </>
      }>
      <div className={`max-w-3xl space-y-6 pb-24 md:pb-8 transition-[filter] ${oculto ? "blur-xl" : ""}`}>
        {aviso && (
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm flex items-start gap-3">
            <span className="flex-1">{aviso}</span>
            <button className="text-faint hover:text-ink" onClick={() => setAviso(null)} title="Fechar"><X size={15} /></button>
          </div>
        )}

        {dados.penitencia && (
          <section className="card p-5 flex flex-wrap items-start gap-3 justify-between" style={{ borderColor: "color-mix(in srgb, #c98a1a 50%, transparent)" }}>
            <div className="min-w-0">
              <div className="label">Penitência a cumprir · confissão de {dataBr(dados.penitencia.desde)}</div>
              <p className="mt-1 whitespace-pre-wrap">{dados.penitencia.texto}</p>
            </div>
            <button className="btn" onClick={() => mudar((d) => ({ ...d, penitencia: null }))}><CircleCheck size={15} /> Cumprida</button>
          </section>
        )}

        <AntesDoExame aberto={total === 0 && revisados.size === 0} />

        {/* o caminho do exame: onde você está e o que falta */}
        <nav className="card p-4">
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="label">Caminho do exame</span>
            <span className="text-xs text-muted tabular-nums">{revisados.size} de {MANDAMENTOS.length} examinados</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MANDAMENTOS.map((m) => {
              const n = m.itens.filter((i) => dados.marcas[i.id]).length + dados.outros.filter((o) => o.mand === m.id && o.texto.trim()).length;
              const feito = revisados.has(m.id);
              return (
                <button key={m.id} onClick={() => irPara(m.id)} title={m.titulo}
                  className={`text-sm rounded-full px-3 py-1 border flex items-center gap-1.5 transition-colors ${feito ? "bg-surface-2 border-line text-muted" : "border-line hover:border-faint"}`}>
                  {feito && <Check size={12} strokeWidth={3} />}{ROTULO[m.id]}
                  {n > 0 && <span className="text-xs tabular-nums rounded-full bg-chart text-bg px-1.5 leading-4">{n}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Confissão precedente (data e pecado escondido) e os mandamentos, na ordem do folheto */}
        {MANDAMENTOS.map((m) => {
          const marcados = m.itens.filter((i) => dados.marcas[i.id]).length + dados.outros.filter((o) => o.mand === m.id && o.texto.trim()).length;
          const feito = revisados.has(m.id);
          return (
            <details key={m.id} id={`m-${m.id}`} className="card group scroll-mt-4" open={abertos.has(m.id)}
              onToggle={(e) => {
                const aberto = (e.currentTarget as HTMLDetailsElement).open;
                setAbertos((s) => { if (s.has(m.id) === aberto) return s; const n = new Set(s); if (aberto) n.add(m.id); else n.delete(m.id); return n; });
              }}>
              <summary className="cursor-pointer list-none p-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium flex items-center gap-2">
                    {m.titulo}
                    {feito && <span className="text-xs font-normal text-muted inline-flex items-center gap-1"><CircleCheck size={13} /> examinado</span>}
                  </h2>
                  {m.tema && <p className="text-sm text-muted mt-0.5">{m.tema}</p>}
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  {marcados > 0 && <span className="text-xs rounded-full bg-surface-2 px-2 py-0.5 tabular-nums">{marcados}</span>}
                  <ChevronDown size={16} className="text-muted group-open:rotate-180 transition-transform" />
                </span>
              </summary>
              {m.id === "cp" && (
                <div className="px-5 pb-4 -mt-2">
                  <UltimaConfissao key={ultima ?? "nenhuma"} ultima={ultima} onMudar={async (d) => { await corrigirUltimaConfissao(d); setUltima(d); }} />
                  {dias !== null && dias > PRAZO_CONFISSAO && (
                    <p className="mt-2 text-sm" style={{ color: "#c98a1a" }}>Já passou de {PRAZO_CONFISSAO} dias: está na hora da confissão.</p>
                  )}
                </div>
              )}
              <ul className="divide-y divide-line border-t border-line">
                {m.itens.map((i) => {
                  const marca = dados.marcas[i.id];
                  return (
                    <li key={i.id} id={`p-${i.id}`} className="px-5 py-3 scroll-mt-24">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="sr-only" checked={!!marca}
                          onChange={(e) => mudar((d) => {
                            const marcas = { ...d.marcas };
                            if (e.target.checked) marcas[i.id] = { qtd: "" }; else delete marcas[i.id];
                            return { ...d, marcas };
                          })} />
                        <span className={`mt-0.5 w-5 h-5 rounded-md border grid place-items-center shrink-0 transition-colors ${marca ? "bg-chart border-chart text-bg" : "border-faint"}`}>
                          {marca && <Check size={13} strokeWidth={3} />}
                        </span>
                        <span className="text-[15px] leading-snug">{i.q}</span>
                      </label>
                      {marca && (
                        <Quantidade valor={marca.qtd} cobrar={cobrar} dica={i.obs} nota={marca.nota ?? ""}
                          onMudar={(qtd) => mudar((d) => ({ ...d, marcas: { ...d.marcas, [i.id]: { ...d.marcas[i.id], qtd } } }))}
                          onNota={(nota) => mudar((d) => ({ ...d, marcas: { ...d.marcas, [i.id]: { ...d.marcas[i.id], nota } } }))} />
                      )}
                    </li>
                  );
                })}
                {dados.outros.filter((o) => o.mand === m.id).map((o) => (
                  <li key={o.id} id={`p-${o.id}`} className="px-5 py-3 scroll-mt-24">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-md border bg-chart border-chart text-bg grid place-items-center shrink-0"><Check size={13} strokeWidth={3} /></span>
                      <input className="flex-1 bg-transparent outline-none text-[15px] border-b border-line focus:border-muted pb-0.5" value={o.texto} placeholder="Descreva o pecado"
                        onChange={(e) => mudar((d) => ({ ...d, outros: d.outros.map((x) => (x.id === o.id ? { ...x, texto: e.target.value } : x)) }))} />
                      <button className="text-faint hover:text-ink" title="Tirar" onClick={() => mudar((d) => ({ ...d, outros: d.outros.filter((x) => x.id !== o.id) }))}><Trash2 size={15} /></button>
                    </div>
                    <Quantidade valor={o.qtd} cobrar={cobrar && !!o.texto.trim()} onMudar={(qtd) => mudar((d) => ({ ...d, outros: d.outros.map((x) => (x.id === o.id ? { ...x, qtd } : x)) }))} />
                  </li>
                ))}
                <li className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <button className="text-sm text-muted hover:text-ink flex items-center gap-1.5"
                    onClick={() => mudar((d) => ({ ...d, outros: [...d.outros, { id: crypto.randomUUID(), mand: m.id, texto: "", qtd: "" }] }))}>
                    <Plus size={14} /> Acrescentar outro pecado
                  </button>
                  <button className={`btn text-sm ${feito ? "btn-ghost" : ""}`} onClick={() => examinei(m.id)}>
                    {feito ? "Desmarcar “examinado”" : <><CircleCheck size={15} /> Examinei este mandamento</>}
                  </button>
                </li>
              </ul>
            </details>
          );
        })}

        <div id="m-contricao" className="scroll-mt-4"><Contricao /></div>

        {/* barra de ações: acompanha a rolagem (no celular, fica acima do botão do Timer) */}
        <div className="sticky bottom-[76px] md:bottom-4 z-20">
          <div className="card shadow-xl px-4 py-3 flex items-center gap-2 flex-wrap justify-between">
            <span className="text-sm tabular-nums">
              {cobrar && faltam.length
                ? <span style={vermelho}>Falta a quantidade em {faltam.length} {faltam.length === 1 ? "pecado" : "pecados"}</span>
                : <span className="text-muted">{total ? `${total} ${total === 1 ? "pecado marcado" : "pecados marcados"}` : "Nada marcado"}</span>}
            </span>
            <span className="flex gap-2">
              <button className="btn" onClick={paraOSacerdote}><ScrollText size={15} /> Para o sacerdote</button>
              <button className="btn btn-primary" onClick={() => setConfessando(true)}>Fiz a confissão</button>
            </span>
          </div>
        </div>
      </div>

      {vendoLista && <ListaParaSacerdote dados={dados} ultima={ultima} onClose={() => setVendoLista(false)} onConfessei={() => { setVendoLista(false); setConfessando(true); }} />}
      {confessando && (
        <FizAConfissao total={total} onClose={() => setConfessando(false)}
          onConfirmar={async (d, penitencia) => {
            await confessar(d, penitencia);
            setUltima(d);
            setConfessando(false);
            setCobrar(false);
            setAbertos(new Set(MANDAMENTOS.map((m) => m.id))); // um exame novo começa com tudo aberto
          }} />
      )}
    </Page>
  );
}
