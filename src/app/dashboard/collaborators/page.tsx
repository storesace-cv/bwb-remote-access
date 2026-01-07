"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Esta página foi consolidada com /dashboard/users
 * Redireciona automaticamente para a página unificada de gestão de utilizadores.
 */
export default function CollaboratorsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/users");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <p className="text-sm text-slate-400">A redirecionar para Gestão de Utilizadores...</p>
    </main>
  );
}
