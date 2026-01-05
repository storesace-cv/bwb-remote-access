/**
 * Login Gateway Page
 * 
 * First step of login flow - welcome screen with "Entrar" button.
 * Navigates to /login/credentials for actual authentication.
 */

"use client";

import { useRouter } from "next/navigation";
import { Shield, Lock, Server } from "lucide-react";

export default function LoginGatewayPage() {
  const router = useRouter();

  const handleEnter = () => {
    router.push("/login/credentials");
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
          <p className="text-slate-400 text-lg">
            Portal de Suporte Android
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 border border-slate-700/50">
          {/* Info bullets */}
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-slate-300 text-sm">
                  Use as suas credenciais MeshCentral
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                <Lock className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-slate-300 text-sm">
                  Sessão segura e encriptada
                </p>
              </div>
            </div>
          </div>

          {/* Enter Button */}
          <button
            onClick={handleEnter}
            className="w-full py-4 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
            data-testid="login-enter-button"
          >
            Entrar
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            © 2026 BWB Remote Access
          </p>
        </div>
      </div>
    </main>
  );
}
