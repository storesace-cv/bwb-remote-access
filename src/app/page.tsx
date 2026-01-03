/**
 * Root Landing Page - Auth0 Only
 * 
 * This page is the entry point for all users.
 * - If not logged in via Auth0: Shows login button (redirects to Auth0)
 * - If logged in via Auth0: Redirects to dashboard
 * 
 * NO local email/password authentication is provided.
 * Auth0 is the ONLY authentication authority.
 */

import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "2.0.0";

export default async function HomePage() {
  // Check Auth0 session
  const session = await auth0.getSession();

  // If already logged in, redirect to dashboard
  if (session?.user) {
    redirect("/dashboard/profile");
  }

  // Not logged in - show Auth0 login page
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md space-y-6">
        <div className="w-full bg-slate-900/70 border border-slate-700 rounded-2xl p-8 shadow-xl backdrop-blur-sm">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600/20 rounded-full mb-4">
              <svg
                className="w-8 h-8 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-white">
              BWB | Suporte Android
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Gestão de Dispositivos & Controlo Remoto
            </p>
          </div>

          {/* Auth0 Login Button - MUST use <a> for full page navigation */}
          {/* Next.js <Link> uses client-side navigation (RSC/fetch) which causes CORS errors with Auth0 */}
          <div className="space-y-4">
            <a
              href="/auth/login"
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors text-center"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                />
              </svg>
              Entrar com Auth0
            </Link>

            <p className="text-xs text-slate-500 text-center">
              Autenticação segura via Auth0
            </p>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-slate-700"></div>

          {/* Info Section */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <svg
                className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <div>
                <p className="text-slate-300">Autenticação Centralizada</p>
                <p className="text-slate-500 text-xs">
                  Single Sign-On com gestão de identidade Auth0
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <svg
                className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <div>
                <p className="text-slate-300">Controlo por Domínio</p>
                <p className="text-slate-500 text-xs">
                  Acesso restrito à organização atribuída
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm">
              <svg
                className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
              <div>
                <p className="text-slate-300">MeshCentral Integrado</p>
                <p className="text-slate-500 text-xs">
                  Sessões remotas sem login adicional
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-slate-700 text-center">
            <p className="text-xs text-slate-500">
              Versão {APP_VERSION} · © Jorge Peixinho - Business with Brains
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
