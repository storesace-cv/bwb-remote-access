"use client";

/**
 * Create User Form Component
 * 
 * Client-side form for creating users via the admin API.
 * Uses mesh_users table structure.
 */

import { useState } from "react";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
type UserType = "agent" | "colaborador" | "candidato";

interface CreateUserFormProps {
  allowedDomains: ValidDomain[];
  onClose: () => void;
  onSuccess: () => void;
}

interface CreateUserResponse {
  success: boolean;
  user_id: string;
  email: string;
  domain: ValidDomain;
  user_type: string;
  is_new_user: boolean;
  message: string;
  error?: string;
}

const USER_TYPE_OPTIONS: { value: UserType; label: string }[] = [
  { value: "agent", label: "Agente" },
  { value: "colaborador", label: "Colaborador" },
  { value: "candidato", label: "Candidato" },
];

export default function CreateUserForm({ allowedDomains, onClose, onSuccess }: CreateUserFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateUserResponse | null>(null);
  
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [domain, setDomain] = useState<ValidDomain>(allowedDomains[0] || "mesh");
  const [userType, setUserType] = useState<UserType>("colaborador");

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
          user_type: userType,
          display_name: displayName.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Falha ao criar utilizador");
        return;
      }

      setSuccess(data);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch {
      setError("Erro de comunicação com o servidor");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Criar Utilizador</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* Email */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading || !!success}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              placeholder="email@exemplo.com"
            />
            <p className="text-xs text-slate-500 mt-1">
              Deve corresponder ao email no MeshCentral
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Nome de Exibição
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isLoading || !!success}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              placeholder="Nome completo"
            />
          </div>

          {/* Domain */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Domínio <span className="text-red-400">*</span>
            </label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as ValidDomain)}
              disabled={isLoading || !!success || allowedDomains.length === 1}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              {allowedDomains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* User Type */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Tipo <span className="text-red-400">*</span>
            </label>
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value as UserType)}
              disabled={isLoading || !!success}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              {USER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-md transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !!success}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-md transition disabled:opacity-50"
            >
              {isLoading ? "A criar..." : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
