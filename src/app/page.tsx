"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";

const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";
const APP_BUILD =
  process.env.NEXT_PUBLIC_APP_BUILD ||
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
  "dev";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const buildLabel = useMemo(() => APP_BUILD.slice(0, 7), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    const params = new URLSearchParams(hash.slice(1));
    const type = params.get("type");

    if (type !== "recovery") return;

    (async () => {
      try {
        await supabase.auth.getSession();
      } catch (err) {
        console.error(
          "Erro ao inicializar sessão de recuperação Supabase:",
          err
        );
      } finally {
        window.history.replaceState(null, "", window.location.pathname);
        router.replace("/auth/confirm-reset");
      }
    })();
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.localStorage.getItem("rustdesk_jwt");
    if (existing && existing.trim().length > 0) {
      router.push("/dashboard");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();

      if (!trimmedEmail || !trimmedPassword) {
        setError("Correio electrónico e palavra‑passe são obrigatórios.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password: trimmedPassword,
        }),
      });

      let data: { token?: string; message?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const errorMessage =
          data.message ||
          data.error ||
          (res.status === 401
            ? "Credenciais inválidas ou utilizador não existe."
            : res.status === 504
            ? "Tempo limite excedido. Tenta de novo."
            : "Falha no início de sessão. Tenta de novo.");

        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (
        !data.token ||
        typeof data.token !== "string" ||
        data.token.trim().length === 0
      ) {
        setError("Resposta sem token válido.");
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("rustdesk_jwt", data.token);
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      console.error("Login error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível estabelecer comunicação com o servidor. Tenta de novo.";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md space-y-6">
        <div className="w-full bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <h1 className="text-2xl font-semibold mb-6 text-center text-white">
            BWB | Suporte Android
          </h1>

          <p className="text-xs text-slate-400 text-center mb-6">
            Versão {APP_VERSION} · Compilação {buildLabel}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1 text-slate-200">
                Correio electrónico
              </label>
              <input
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-500"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm mb-1 text-slate-200">
                Palavra‑passe
              </label>
              <input
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-500"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium transition text-white"
            >
              {loading ? "A entrar..." : "Entrar"}
            </button>

            <div className="mt-4 text-center">
              <Link
                href="/auth/reset-password"
                className="inline-block px-4 py-2 text-sm text-slate-300 hover:text-emerald-400 transition font-medium"
              >
                🔑 Esqueceste‑te da palavra‑passe?
              </Link>
            </div>

            <div className="mt-2 text-right">
              <p className="text-xs text-slate-500">
                © jorge peixinho - Business with Brains
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}