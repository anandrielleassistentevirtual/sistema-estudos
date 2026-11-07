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
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Sistema de Estudos</h1>
          <p className="text-sm text-muted mt-1">
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
          className="text-sm text-muted underline w-full"
          onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")}
        >
          {mode === "entrar" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}
