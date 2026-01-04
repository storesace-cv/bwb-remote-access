"use client";

/**
 * Create User Form Component
 * 
 * Client-side form for creating users via the admin API.
 */

import { useState } from "react";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
type ValidRole = "DOMAIN_ADMIN" | "AGENT";

interface CreateUserFormProps {
  allowedDomains: ValidDomain[];
  onSuccess: () => void;
}

interface CreateUserResponse {
  success: boolean;
  user_id: string;
  email: string;
  domain: ValidDomain;
  role: string;
  is_new_user: boolean;
  message: string;
  error?: string;
}

export default function CreateUserForm({ allowedDomains, onSuccess }: CreateUserFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateUserResponse | null>(null);
  
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [domain, setDomain] = useState<ValidDomain>(allowedDomains[0] || "mesh");
  const [role, setRole] = useState<ValidRole>("AGENT");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          domain,
          role,
          display_name: displayName.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      setSuccess(data);
      setEmail("");
      setDisplayName("");
      setRole("AGENT");
      
      // Notify parent to refresh list
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
    setSuccess(null);
    setEmail("");
    setDisplayName("");
    setRole("AGENT");
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Criar Utilizador
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Criar Novo Utilizador</h3>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              placeholder="utilizador@exemplo.com"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Nome (opcional)
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isLoading}
              placeholder="Nome do utilizador"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          {/* Domain */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Domínio <span className="text-red-400">*</span>
            </label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as ValidDomain)}
              disabled={isLoading || allowedDomains.length === 1}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {allowedDomains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {allowedDomains.length === 1 && (
              <p className="text-xs text-slate-500 mt-1">
                Domain Admin pode criar utilizadores apenas no seu domínio.
              </p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Role <span className="text-red-400">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ValidRole)}
              disabled={isLoading}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              <option value="AGENT">AGENT</option>
              <option value="DOMAIN_ADMIN">DOMAIN_ADMIN</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              DOMAIN_ADMIN inclui automaticamente permissões de AGENT.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-900 rounded-md text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-900 rounded-md text-sm text-emerald-400 space-y-2">
              <p>{success.message}</p>
              <p className="text-xs text-slate-400">
                O utilizador poderá entrar com as suas credenciais MeshCentral.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isLoading || !email}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition text-white"
            >
              {isLoading ? "A criar..." : "Criar Utilizador"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition text-white"
            >
              {success ? "Fechar" : "Cancelar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
