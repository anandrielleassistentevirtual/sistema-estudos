"use client";
import { useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";

export function CampoSenha({ valor, onMudar, placeholder, autoFocus }: { valor: string; onMudar: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
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

const vermelho = { color: "var(--bad, #d33)" };

export function CriarSenha({ onCriar }: { onCriar: (s: string) => Promise<void> }) {
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
      {erro && <p className="text-sm" style={vermelho}>{erro}</p>}
      <button className="btn btn-primary w-full" disabled={!ok || indo}>{indo ? "Preparando…" : "Criar senha e começar"}</button>
    </form>
  );
}

export function Destrancar({ onAbrir, onApagarTudo }: { onAbrir: (s: string) => Promise<string | null>; onApagarTudo: () => Promise<void> }) {
  const [s, setS] = useState("");
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  const [esqueci, setEsqueci] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");

  if (esqueci) {
    // apagar o exame é para sempre: pede para digitar a palavra, não basta um toque
    return (
      <form className="card p-6 max-w-md space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (confirmacao.trim().toUpperCase() !== "APAGAR") return;
        setIndo(true);
        await onApagarTudo();
      }}>
        <h2 className="font-medium">Esqueci a senha</h2>
        <p className="text-sm text-muted">
          Sem a senha, ninguém consegue abrir o exame em andamento — nem o sistema. A única saída é <b className="text-ink">apagá-lo</b> e criar uma senha nova.
          Se você só não lembra agora, tente com calma antes: as letras maiúsculas e minúsculas contam.
        </p>
        <label className="block"><span className="label">Para apagar, digite APAGAR</span>
          <input className="input mt-1" value={confirmacao} autoFocus onChange={(e) => setConfirmacao(e.target.value)} /></label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => { setEsqueci(false); setConfirmacao(""); }}>Voltar</button>
          <button className="btn" style={vermelho} disabled={confirmacao.trim().toUpperCase() !== "APAGAR" || indo}>Apagar o exame</button>
        </div>
      </form>
    );
  }
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
      {erro && <p className="text-sm" style={vermelho}>{erro}</p>}
      <button className="btn btn-primary w-full" disabled={!s || indo}>{indo ? "Abrindo…" : "Abrir"}</button>
      <button type="button" className="text-xs text-faint hover:text-ink" onClick={() => setEsqueci(true)}>Esqueci a senha</button>
    </form>
  );
}
