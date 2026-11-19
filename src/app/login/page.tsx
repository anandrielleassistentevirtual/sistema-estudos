"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabase();
    const { error } =
      mode === "entrar"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "criar") {
      const { data } = await sb.auth.getSession();
      if (!data.session) return setMsg("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.");
    }
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-sm p-7 space-y-4">
        {/* a mesma marca do menu e da tela de início: o ícone do app, o nome e o lema */}
        <div className="text-center pb-1">
          <img src="/icons/icon-192.png" alt="" width={56} height={56} className="w-14 h-14 mx-auto rounded-[14px] ring-1 ring-black/10 dark:ring-white/10 shadow-sm" />
          <h1 className="text-xl font-semibold tracking-tight mt-4">Sistema de Estudos</h1>
          <p className="text-[11px] text-faint mt-1">studium · lectio · memoria</p>
          <p className="text-sm text-muted mt-3">
            {mode === "entrar" ? "Entre para continuar seus estudos." : "Crie sua conta (só você terá acesso aos dados)."}
          </p>
        </div>
        <label className="block space-y-1">
          <span className="label">E-mail</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="label">Senha</span>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {msg && <p className="text-sm text-critical">{msg}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          className="text-sm text-muted hover:text-ink underline underline-offset-2 w-full"
          onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
        >
          {mode === "entrar" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}
