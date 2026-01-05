/**
 * Login Form Component
 * 
 * Credentials form with domain dropdown, email, password.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Server } from "lucide-react";
import { type ValidDomain, VALID_DOMAINS, DOMAIN_LABELS, getDefaultDomainFromHostname } from "@/lib/domain";

export function LoginForm() {
  const router = useRouter();

  const [domain, setDomain] = useState<ValidDomain>("mesh");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Set default domain based on hostname on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const defaultDomain = getDefaultDomainFromHostname(window.location.hostname);
      setDomain(defaultDomain);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, domain }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Autenticação falhou");
        setLoading(false);
        return;
      }

      // Store JWT in localStorage for edge functions
      if (data.token && typeof window !== "undefined") {
        window.localStorage.setItem("rustdesk_jwt", data.token);
      }

      // Redirect to dashboard
      router.push("/dashboard");
    } catch {
      setError("Falha ao conectar ao servidor");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600/20 rounded-2xl mb-4">
            <Server className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            BWB Remote Access
          </h1>
          <p className="text-slate-400">
            Introduza as suas credenciais
          </p>
        </div>

        {/* Credentials Form */}
        <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 border border-slate-700/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Domain Dropdown */}
            <div>
              <label htmlFor="domain" className="block text-sm font-medium text-slate-300 mb-2">
                Domínio
              </label>
              <select
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value as ValidDomain)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent appearance-none cursor-pointer"
                disabled={loading}
                data-testid="login-domain-select"
              >
                {VALID_DOMAINS.map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="seu.email@exemplo.com"
                disabled={loading}
                autoComplete="email"
                data-testid="login-email-input"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="••••••••"
                disabled={loading}
                autoComplete="current-password"
                data-testid="login-password-input"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              data-testid="login-submit-button"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  A entrar...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              Autenticação via MeshCentral
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
