/**
 * Root Landing Page
 * 
 * Public landing page with login button.
 * Authentication via MeshCentral credentials.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/mesh-auth";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "2.0.0";

export default async function HomePage() {
  // Check if already logged in
  const session = await getSession();
  
  if (session?.authenticated) {
    redirect("/dashboard");
  }
  
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo/Header */}
        <div className="text-center">
          <div className="mx-auto w-20 h-20 bg-emerald-600/20 rounded-2xl flex items-center justify-center mb-6">
            <svg className="w-12 h-12 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-2">
            BWB Remote Access
          </h1>
          
          <p className="text-slate-400 text-sm">
            Portal de Suporte Android
          </p>
          
          <span className="inline-block mt-2 px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-500">
            v{APP_VERSION}
          </span>
        </div>
        
        {/* Login Card */}
        <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 border border-slate-700/50">
          {/* Login Button */}
          <div className="space-y-4">
            <a
              href="/login"
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors text-center"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Entrar
            </a>
            
            <p className="text-xs text-slate-500 text-center">
              Autenticação via MeshCentral
            </p>
          </div>
          
          {/* Divider */}
          <div className="my-6 border-t border-slate-700"></div>
          
          {/* Info */}
          <div className="space-y-3 text-sm text-slate-400">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Use as suas credenciais MeshCentral</span>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Sessão segura e encriptada</span>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="text-center text-xs text-slate-600">
          BWB Informática © {new Date().getFullYear()}
        </div>
      </div>
    </main>
  );
}
