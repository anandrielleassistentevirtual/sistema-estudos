"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, KeyRound, Lock, Plus, ScrollText, ShieldCheck, Trash2, X } from "lucide-react";
import { Page } from "@/components/page";
import { OracaoTabs } from "@/components/oracao-tabs";
import { supabase } from "@/lib/supabase/client";
import {
  ANTES_DO_EXAME, ATO_DE_CONTRICAO, CONTRICAO_PERFEITA, ITERACOES, MANDAMENTOS, PRAZO_CONFISSAO, QUANTIDADES,
  cifrar, decifrar, derivarChave, diasDesde, exameTemAlgo, exameVazio, listaParaConfissao, novoSal, quantidadeValida, semQuantidade, senhaConfere,
  tempoDesde, verificadorNovo, type ExameDados,
} from "@/lib/exame";
import { corrigirUltimaConfissao, dataBr, hojeIso, registrarConfissao, ultimaConfissao } from "@/lib/confissao";

interface Cofre { sal: string; iteracoes: number; verificador: string; conteudo: string | null }
const TRANCAR_APOS = 10 * 60_000; // 10 min sem mexer

export default function ExameDeConsciencia() {
  const [cofre, setCofre] = useState<Cofre | null | undefined>(undefined); // undefined = carregando; null = sem senha ainda
  const [chave, setChave] = useState<CryptoKey | null>(null);
  const [dados, setDados] = useState<ExameDados>(exameVazio);
  const [ultima, setUltima] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<"" | "salvando" | "salvo">("");
  const [vendoLista, setVendoLista] = useState(false);
  const [confessando, setConfessando] = useState(false);

  useEffect(() => {
    void supabase().from("exame_cofre").select("sal,iteracoes,verificador,conteudo").maybeSingle()
      .then(({ data }) => setCofre((data as Cofre | null) ?? null));
    void ultimaConfissao().then(setUltima);
  }, []);

  // ---- gravação (cifrada) com espera curta depois de cada mudança ----
  const pendente = useRef<ExameDados | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravar = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const d = pendente.current;
    if (!d || !chave) return;
    pendente.current = null;
    setSalvo("salvando");
    const conteudo = exameTemAlgo(d) ? await cifrar(chave, JSON.stringify(d)) : null;
    await supabase().from("exame_cofre").update({ conteudo, atualizado_em: new Date().toISOString() }).not("user_id", "is", null);
    setSalvo("salvo");
  }, [chave]);
  function mudar(f: (d: ExameDados) => ExameDados) {
    setDados((d) => {
      const n = f(d);
      pendente.current = n;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void gravar(), 700);
      return n;
    });
  }

  // ---- trancar: botão, 10 min parado ou ao sair da página ----
  const trancar = useCallback(async () => {
    await gravar();
    setChave(null);
    setDados(exameVazio());
    setVendoLista(false);
    setConfessando(false);
    setSalvo("");
  }, [gravar]);
  useEffect(() => {
    if (!chave) return;
    let ultimoMovimento = Date.now();
    const mexeu = () => { ultimoMovimento = Date.now(); };
    const eventos = ["pointerdown", "keydown", "scroll", "touchstart"];
    eventos.forEach((e) => window.addEventListener(e, mexeu, { passive: true }));
    const t = setInterval(() => { if (Date.now() - ultimoMovimento > TRANCAR_APOS) void trancar(); }, 20_000);
    const sair = () => { if (pendente.current) void gravar(); };
    window.addEventListener("pagehide", sair);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, mexeu));
      clearInterval(t);
      window.removeEventListener("pagehide", sair);
      if (pendente.current) void gravar();
    };
  }, [chave, trancar, gravar]);

  async function abrir(senha: string): Promise<string | null> {
    // sempre a versão guardada agora (pode ter mudado desde que a página abriu, ou em outro aparelho)
    const { data } = await supabase().from("exame_cofre").select("sal,iteracoes,verificador,conteudo").maybeSingle();
    const atual = data as Cofre | null;
    if (!atual) { setCofre(null); return "O exame foi apagado. Crie uma senha nova."; }
    setCofre(atual);
    const k = await derivarChave(senha, atual.sal, atual.iteracoes);
    if (!(await senhaConfere(k, atual.verificador))) return "Senha incorreta.";
    let d = exameVazio();
    if (atual.conteudo) {
      try { d = { ...exameVazio(), ...JSON.parse(await decifrar(k, atual.conteudo)) }; } catch { return "Não foi possível abrir o exame."; }
    }
    setDados(d);
    setChave(k);
    return null;
  }

  async function criar(senha: string) {
    const sal = novoSal();
    const k = await derivarChave(senha, sal);
    const verificador = await verificadorNovo(k);
    const novo = { sal, iteracoes: ITERACOES, verificador, conteudo: null };
    const { error } = await supabase().from("exame_cofre").upsert(novo);
    if (error) throw new Error(error.message);
    setCofre(novo);
    setDados(exameVazio());
    setChave(k);
  }

  async function esqueci() {
    if (!confirm("Sem a senha, o exame em andamento não pode ser aberto por ninguém. Apagar o exame em andamento e criar uma senha nova?")) return;
    await supabase().from("exame_cofre").delete().not("user_id", "is", null);
    setCofre(null);
  }

  const total = Object.keys(dados.marcas).length + dados.outros.filter((o) => o.texto.trim()).length;
  const faltam = semQuantidade(dados);
  const [cobrar, setCobrar] = useState(false); // depois de tentar abrir a lista, destaca o que está sem quantidade
  function paraOSacerdote() {
    if (faltam.length) {
      setCobrar(true);
      document.getElementById(`p-${faltam[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setVendoLista(true);
  }

  if (cofre === undefined) return <Page tabs={<OracaoTabs className="mb-6 -mt-2" />} title="Exame de consciência">{null}</Page>;

  if (!chave) {
    return (
      <Page tabs={<OracaoTabs className="mb-6 -mt-2" />} title="Exame de consciência">
        {cofre === null ? <CriarSenha onCriar={criar} /> : <Destrancar onAbrir={abrir} onEsqueci={esqueci} />}
      </Page>
    );
  }

  const dias = ultima ? diasDesde(ultima) : null;
  return (
    <Page tabs={<OracaoTabs className="mb-6 -mt-2" />} title="Exame de consciência"
      subtitle="Sem ansiedade nem escrúpulo: a espécie e o número dos pecados."
      actions={
        <>
          <span className="text-xs text-faint flex items-center gap-1" title="Só abre com a sua senha">
            <ShieldCheck size={13} /> {salvo === "salvando" ? "Salvando…" : salvo === "salvo" ? "Salvo e cifrado" : "Cifrado"}
          </span>
          <button className="btn" onClick={() => void trancar()}><Lock size={15} /> Trancar</button>
        </>
      }>
      <div className="max-w-3xl space-y-6 pb-24 md:pb-8">
        {/* Antes do exame */}
        <details className="card p-5 group" open={total === 0}>
          <summary className="cursor-pointer list-none flex items-center justify-between font-medium">
            Antes do exame de consciência <ChevronDown size={16} className="text-muted group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
            {ANTES_DO_EXAME.introducao.map((p, i) => <p key={i} className="text-muted">{p}</p>)}
            <blockquote className="border-l-2 border-line pl-4 italic">“{ANTES_DO_EXAME.citacao.texto}” <span className="not-italic text-muted text-sm">({ANTES_DO_EXAME.citacao.ref})</span></blockquote>
            <p>{ANTES_DO_EXAME.convite}</p>
            <div className="rounded-xl bg-surface-2 p-4">
              <div className="label mb-2">Oração antes do exame</div>
              <p className="font-serif text-[17px] leading-relaxed">{ANTES_DO_EXAME.oracao}</p>
            </div>
            <div>
              <div className="label mb-2">Para fazer uma boa confissão é preciso</div>
              <ol className="space-y-1.5">
                {ANTES_DO_EXAME.passos.map(([t, d], i) => (
                  <li key={t} className="flex gap-3"><span className="text-faint tabular-nums w-4 shrink-0">{i + 1}.</span><span><b className="font-medium">{t}:</b> {d}</span></li>
                ))}
              </ol>
            </div>
          </div>
        </details>

        {/* Confissão precedente (data e pecado escondido) e os mandamentos, na ordem do folheto */}
        {MANDAMENTOS.map((m) => {
          const marcados = m.itens.filter((i) => dados.marcas[i.id]).length + dados.outros.filter((o) => o.mand === m.id && o.texto.trim()).length;
          return (
            <details key={m.id} className="card group" open>
              <summary className="cursor-pointer list-none p-5 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{m.titulo}</h2>
                  {m.tema && <p className="text-sm text-muted mt-0.5">{m.tema}</p>}
                </div>
                <span className="flex items-center gap-2 shrink-0">
                  {marcados > 0 && <span className="text-xs rounded-full bg-surface-2 px-2 py-0.5 tabular-nums">{marcados}</span>}
                  <ChevronDown size={16} className="text-muted group-open:rotate-180 transition-transform" />
                </span>
              </summary>
              {m.id === "cp" && (
                <div className="px-5 pb-4 -mt-2">
                  <UltimaConfissao ultima={ultima} onMudar={async (d) => { await corrigirUltimaConfissao(d); setUltima(d); }} />
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
                <li className="px-5 py-2.5">
                  <button className="text-sm text-muted hover:text-ink flex items-center gap-1.5"
                    onClick={() => mudar((d) => ({ ...d, outros: [...d.outros, { id: crypto.randomUUID(), mand: m.id, texto: "", qtd: "" }] }))}>
                    <Plus size={14} /> Acrescentar outro pecado
                  </button>
                </li>
              </ul>
            </details>
          );
        })}

        <Contricao />

        {/* barra de ações: acompanha a rolagem (no celular, fica acima do botão do Timer) */}
        <div className="sticky bottom-[76px] md:bottom-4 z-20">
          <div className="card shadow-xl px-4 py-3 flex items-center gap-2 flex-wrap justify-between">
            <span className="text-sm tabular-nums">
              {cobrar && faltam.length
                ? <span style={{ color: "var(--bad, #d33)" }}>Falta a quantidade em {faltam.length} {faltam.length === 1 ? "pecado" : "pecados"}</span>
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
          onConfirmar={async (d) => {
            if (timer.current) clearTimeout(timer.current);
            pendente.current = null;
            await registrarConfissao(d);
            setDados(exameVazio());
            setUltima(d);
            setConfessando(false);
            setSalvo("");
          }} />
      )}
    </Page>
  );
}

function Quantidade({ valor, dica, nota, cobrar, onMudar, onNota }: {
  valor: string; dica?: string; nota?: string; cobrar?: boolean; onMudar: (v: string) => void; onNota?: (v: string) => void;
}) {
  const falta = !quantidadeValida(valor);
  return (
    <div className="mt-2 ml-8 space-y-1.5">
      <div className="text-xs text-muted">Quantas vezes?</div>
      <div className={`flex flex-wrap gap-1.5 rounded-lg ${falta && cobrar ? "ring-2 ring-offset-2 ring-offset-surface p-0.5" : ""}`}
        style={falta && cobrar ? { ["--tw-ring-color" as string]: "var(--bad, #d33)" } : undefined}>
        {QUANTIDADES.map((q) => (
          <button key={q} type="button" onClick={() => onMudar(q)}
            className={`text-sm rounded-full px-3 py-1 border transition-colors ${valor === q ? "bg-chart border-chart text-bg font-medium" : "border-line text-muted hover:text-ink"}`}>{q}</button>
        ))}
      </div>
      {falta && cobrar && <p className="text-xs" style={{ color: "var(--bad, #d33)" }}>Escolha quantas vezes.</p>}
      {dica && onNota && (
        <input className="input py-1.5 text-sm" value={nota ?? ""} placeholder={dica} onChange={(e) => onNota(e.target.value)} />
      )}
    </div>
  );
}

function UltimaConfissao({ ultima, onMudar }: { ultima: string | null; onMudar: (d: string) => void }) {
  const [editando, setEditando] = useState(!ultima);
  const [d, setD] = useState(ultima ?? "");
  if (!editando && ultima) {
    const dias = diasDesde(ultima);
    return (
      <p className="mt-1 text-sm text-muted">
        Quando foi a minha última confissão? <span className="text-ink">{dataBr(ultima)}</span> ({tempoDesde(dias)}).{" "}
        <button className="underline hover:text-ink" onClick={() => setEditando(true)}>corrigir</button>
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Quando foi a minha última confissão?</span>
      <input type="date" className="input py-1 w-auto" max={hojeIso()} value={d} onChange={(e) => setD(e.target.value)} />
      <button className="btn" disabled={!d} onClick={() => { onMudar(d); setEditando(false); }}>Salvar</button>
    </div>
  );
}

function Contricao() {
  return (
    <section className="card p-5 space-y-4">
      <div>
        <h2 className="font-medium mb-2">Ato de Contrição</h2>
        <p className="font-serif text-[17px] leading-relaxed">{ATO_DE_CONTRICAO}</p>
      </div>
      <details className="group">
        <summary className="cursor-pointer list-none text-sm text-muted hover:text-ink flex items-center gap-1">
          Quando não for possível se confessar: a contrição perfeita <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
          {CONTRICAO_PERFEITA.map((b, i) => (
            <div key={i} className="space-y-2">
              {b.titulo && <h3 className="font-medium">{b.titulo}</h3>}
              {b.paragrafos.map((p, j) => <p key={j}>{p}</p>)}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function ListaParaSacerdote({ dados, ultima, onClose, onConfessei }: { dados: ExameDados; ultima: string | null; onClose: () => void; onConfessei: () => void }) {
  const lista = useMemo(() => listaParaConfissao(dados), [dados]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto pt-safe pb-safe">
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="sticky top-0 -mx-5 px-5 py-3 mb-4 bg-bg/95 backdrop-blur flex items-center justify-between gap-2 z-10">
          <span className="label min-w-0">Para o sacerdote</span>
          <span className="flex items-center gap-1 shrink-0">
            <button className="btn text-sm whitespace-nowrap" onClick={() => document.getElementById("ato-de-contricao")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              Ato de Contrição
            </button>
            <button className="btn btn-ghost px-2" onClick={onClose} title="Fechar"><X size={18} /></button>
          </span>
        </div>
        {ultima && <p className="text-lg mb-6">Minha última confissão foi {tempoDesde(diasDesde(ultima))}.</p>}
        {!lista.length && <p className="text-muted mb-6">Nenhum pecado marcado no exame.</p>}
        <div className="space-y-7">
          {lista.map(({ mandamento: m, pecados }) => (
            <section key={m.id}>
              <h2 className="text-sm text-muted mb-2">{m.titulo}{m.tema ? ` — ${m.tema}` : ""}</h2>
              <ul className="space-y-2.5">
                {pecados.map((p, i) => (
                  <li key={i} className="text-[19px] leading-snug flex gap-3">
                    <span className="text-faint">•</span>
                    <span>{p.texto.replace(/\.$/, "")}{p.nota ? ` (${p.nota})` : ""} <span className="text-muted">— {p.qtd}</span>.</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div id="ato-de-contricao" className="mt-10 rounded-xl bg-surface-2 p-5 scroll-mt-20">
          <div className="label mb-2">Ato de Contrição</div>
          <p className="font-serif text-[20px] leading-relaxed">{ATO_DE_CONTRICAO}</p>
        </div>
        <div className="mt-8 mb-20 flex justify-start">
          <button className="btn btn-primary" onClick={onConfessei}>Fiz a confissão</button>
        </div>
      </div>
    </div>
  );
}

function FizAConfissao({ total, onClose, onConfirmar }: { total: number; onClose: () => void; onConfirmar: (data: string) => Promise<void> }) {
  const [d, setD] = useState(hojeIso());
  const [indo, setIndo] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg">Fiz a confissão</h2>
        <label className="block"><span className="label">Quando?</span>
          <input type="date" className="input mt-1" max={hojeIso()} value={d} onChange={(e) => setD(e.target.value)} /></label>
        <p className="text-sm text-muted">
          {total
            ? <>Os {total === 1 ? "pecado marcado será apagado" : `${total} pecados marcados serão apagados`} <b className="text-ink">para sempre</b>, sem cópia. Fica guardada só a data da confissão.</>
            : "Fica guardada só a data da confissão."}
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!d || indo} onClick={async () => { setIndo(true); await onConfirmar(d); }}>
            {indo ? "Apagando…" : total ? "Confirmar e apagar" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoSenha({ valor, onMudar, placeholder, autoFocus }: { valor: string; onMudar: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <label className="input flex items-center gap-2 py-2">
      <KeyRound size={15} className="text-faint shrink-0" />
      <input type={ver ? "text" : "password"} autoComplete="off" autoFocus={autoFocus} className="bg-transparent outline-none flex-1 min-w-0"
        value={valor} placeholder={placeholder} onChange={(e) => onMudar(e.target.value)} />
      <button type="button" className="text-faint hover:text-ink" onClick={() => setVer(!ver)} title={ver ? "Esconder" : "Mostrar"}>
        {ver ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </label>
  );
}

function CriarSenha({ onCriar }: { onCriar: (s: string) => Promise<void> }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState("");
  const ok = a.length >= 4 && a === b;
  return (
    <form className="card p-6 max-w-md space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!ok) return;
      setIndo(true);
      try { await onCriar(a); } catch (x) { setErro((x as Error).message); setIndo(false); }
    }}>
      <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-icon" /><h2 className="font-medium">Crie uma senha para o exame</h2></div>
      <p className="text-sm text-muted">
        O exame é cifrado no seu aparelho com esta senha antes de ser guardado. Ninguém consegue lê-lo sem ela:
        nem o sistema, nem quem tiver acesso ao banco de dados.
      </p>
      <CampoSenha valor={a} onMudar={setA} placeholder="Senha (mínimo 4 caracteres)" autoFocus />
      <CampoSenha valor={b} onMudar={setB} placeholder="Repita a senha" />
      {b && a !== b && <p className="text-xs text-muted">As senhas não são iguais.</p>}
      <p className="text-xs text-faint">Guarde bem: se esquecer a senha, o exame em andamento não pode ser recuperado (só apagado para recomeçar).</p>
      {erro && <p className="text-sm" style={{ color: "var(--bad, #d33)" }}>{erro}</p>}
      <button className="btn btn-primary w-full" disabled={!ok || indo}>{indo ? "Preparando…" : "Criar senha e começar"}</button>
    </form>
  );
}

function Destrancar({ onAbrir, onEsqueci }: { onAbrir: (s: string) => Promise<string | null>; onEsqueci: () => void }) {
  const [s, setS] = useState("");
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  return (
    <form className="card p-6 max-w-md space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!s) return;
      setIndo(true); setErro("");
      const r = await onAbrir(s);
      if (r) { setErro(r); setIndo(false); setS(""); }
    }}>
      <div className="flex items-center gap-2"><Lock size={18} className="text-icon" /><h2 className="font-medium">Exame trancado</h2></div>
      <p className="text-sm text-muted">Digite a sua senha para abrir.</p>
      <CampoSenha valor={s} onMudar={setS} placeholder="Senha" autoFocus />
      {erro && <p className="text-sm" style={{ color: "var(--bad, #d33)" }}>{erro}</p>}
      <button className="btn btn-primary w-full" disabled={!s || indo}>{indo ? "Abrindo…" : "Abrir"}</button>
      <button type="button" className="text-xs text-faint hover:text-ink" onClick={onEsqueci}>Esqueci a senha</button>
    </form>
  );
}
