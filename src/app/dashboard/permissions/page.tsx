"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PermissionsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to groups page - permissions are now managed there
    router.replace("/dashboard/groups");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-600 border-t-emerald-500 mb-3"></div>
        <p className="text-sm text-slate-400">A redirecionar para Gestão de Grupos...</p>
      </div>
    </main>
  );
}