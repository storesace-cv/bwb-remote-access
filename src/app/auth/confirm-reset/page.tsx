"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";

function ConfirmResetContent() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    // Check if we have a valid token/session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError("Link inválido ou expirado. Solicita um novo link de recuperação.");
        setValidating(false);
        return;
      }

      setValidating(false);
    };

    checkSession();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!password || !confirmPassword) {
        setError("Todos os campos são obrigatórios.");
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        setError("A password deve ter pelo menos 6 caracteres.");
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setError("As passwords não coincidem.");
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        setError(updateError.message || "Erro ao actualizar password.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (err: unknown) {
      console.error("Password update error:", err);
      const message = err instanceof Error
        ? err.message
        : "Erro ao actualizar password. Tenta novamente.";
      setError(message);
      setLoading(false);
    }
  }

  if (validating) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="w-full max-w-md bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-600 border-t-emerald-500 mb-4"></div>
            <p className="text-slate-400">A validar link...</p>
          </div>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="w-full max-w-md bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold mb-4 text-white">
              Password Actualizada
            </h1>
            <p className="text-slate-300 mb-6">
              A tua password foi actualizada com sucesso!
            </p>
            <p className="text-sm text-slate-400 mb-6">
              A redirecionar para o login...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
        <h1 className="text-2xl font-semibold mb-2 text-center text-white">
          Nova Password
        </h1>
        <p className="text-sm text-slate-400 text-center mb-6">
          Introduz a tua nova password
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-slate-200">Nova Password</label>
            <input
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-500"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div>
            <label className="block text-sm mb-1 text-slate-200">Confirmar Password</label>
            <input
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-white placeholder-slate-500"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
              placeholder="Repetir password"
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
            {loading ? "A actualizar..." : "Actualizar Password"}
          </button>

          <div className="text-center">
            <Link
              href="/"
              className="text-sm text-slate-400 hover:text-slate-300 transition"
            >
              ← Voltar ao Login
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function ConfirmResetPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="w-full max-w-md bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-600 border-t-emerald-500 mb-4"></div>
            <p className="text-slate-400">A carregar...</p>
          </div>
        </div>
      </main>
    }>
      <ConfirmResetContent />
    </Suspense>
  );
}