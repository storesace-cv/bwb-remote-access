"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type OsPreference = "windows" | "macos";

// Auth0 session info for admin button
interface Auth0SessionInfo {
  authenticated: boolean;
  canManageUsers: boolean;
  roleLabel?: string | null;
  email?: string;
  org?: string;
  globalRoles?: string[];
  orgRoles?: Record<string, string[]>;
}

interface MeshUser {
  id: string;
  mesh_username: string;
  auth_user_id: string;
  created_at: string;
}

interface SimpleUser {
  id: string;
  email: string | null;
  created_at: string;
  email_confirmed_at: string | null;
}

const RUSTDESK_WINGET_INSTALL = "winget install --id RustDesk.RustDesk -e";
const RUSTDESK_WINGET_UPGRADE = "winget upgrade --id RustDesk.RustDesk -e";

export default function ProfilePage() {
  const router = useRouter();
  const [jwt, setJwt] = useState<string | null>(null);
  const [user, setUser] = useState<SimpleUser | null>(null);
  const [meshUser, setMeshUser] = useState<MeshUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // OS preference state
  const [osPreference, setOsPreference] = useState<OsPreference | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // Auth0 admin access state
  const [auth0Info, setAuth0Info] = useState<Auth0SessionInfo | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("rustdesk_jwt");
    if (!token || token.trim().length === 0) {
      router.push("/");
      return;
    }
    setJwt(token);
  }, [router]);

  // Fetch Auth0 session info for admin button
  useEffect(() => {
    async function checkAuth0Session() {
      try {
        const res = await fetch("/api/auth0/me");
        if (res.ok) {
          const data = await res.json();
          setAuth0Info(data);
        }
      } catch {
        // Auth0 not configured or error - ignore
        setAuth0Info({ authenticated: false, canManageUsers: false });
      }
    }
    checkAuth0Session();
  }, []);

  useEffect(() => {
    if (!jwt) return;

    async function loadUserProfile() {
      setLoading(true);
      setError(null);

      try {
        const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
          },
        });

        if (!authResponse.ok) {
          setError("Sessão expirada. Faz login novamente.");
          router.push("/");
          return;
        }

        const authUser = await authResponse.json() as {
          id: string;
          email: string | null;
          created_at: string;
          email_confirmed_at: string | null;
        };

        const simpleUser: SimpleUser = {
          id: authUser.id,
          email: authUser.email,
          created_at: authUser.created_at,
          email_confirmed_at: authUser.email_confirmed_at,
        };
        setUser(simpleUser);

        // Carregar preferência de OS do localStorage (por utilizador)
        if (typeof window !== "undefined") {
          const osKey = `rustdesk_os_preference_${authUser.id}`;
          const stored = window.localStorage.getItem(osKey);
          if (stored === "windows" || stored === "macos") {
            setOsPreference(stored);
          } else {
            setOsPreference(null);
          }
        }

        const meshResponse = await fetch(
          `${supabaseUrl}/rest/v1/mesh_users?select=id,mesh_username,auth_user_id,created_at&auth_user_id=eq.${encodeURIComponent(
            authUser.id,
          )}`,
          {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${jwt}`,
            },
          },
        );

        if (!meshResponse.ok) {
          console.error(
            "Erro ao carregar mesh_user para perfil:",
            await meshResponse.text(),
          );
        } else {
          const meshData = (await meshResponse.json()) as MeshUser[] | null;
          if (Array.isArray(meshData) && meshData.length > 0) {
            setMeshUser(meshData[0]);
          }
        }
      } catch (err: unknown) {
        console.error("Error loading profile:", err);
        setError("Erro ao carregar perfil.");
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, [jwt, router]);

  const handlePasswordChange = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    setPasswordLoading(true);

    try {
      if (!currentPassword || !newPassword || !confirmPassword) {
        setPasswordError("Todos os campos são obrigatórios.");
        setPasswordLoading(false);
        return;
      }

      if (newPassword.length < 6) {
        setPasswordError("A nova password deve ter pelo menos 6 caracteres.");
        setPasswordLoading(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        setPasswordError("As passwords não coincidem.");
        setPasswordLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword
      });

      if (signInError) {
        setPasswordError("Password actual incorrecta.");
        setPasswordLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        setPasswordError(updateError.message || "Erro ao actualizar password.");
        setPasswordLoading(false);
        return;
      }

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      setTimeout(() => {
        setShowPasswordChange(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err: unknown) {
      console.error("Password change error:", err);
      setPasswordError("Erro ao actualizar password.");
    } finally {
      setPasswordLoading(false);
    }
  }, [currentPassword, newPassword, confirmPassword, user?.email]);

  const handleOsPreferenceChange = useCallback((pref: OsPreference) => {
    if (!user) return;
    setOsPreference(pref);
    if (typeof window !== "undefined") {
      const osKey = `rustdesk_os_preference_${user.id}`;
      window.localStorage.setItem(osKey, pref);
    }
  }, [user]);

  const copyCommand = useCallback(async (command: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(command);
      } else if (typeof window !== "undefined") {
        window.prompt("Copia o comando manualmente:", command);
      }
      setCopyMessage("Comando copiado para a clipboard.");
      setTimeout(() => setCopyMessage(null), 2000);
    } catch {
      setCopyMessage("Não foi possível copiar automaticamente. Copia manualmente.");
      setTimeout(() => setCopyMessage(null), 4000);
    }
  }, []);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("pt-PT", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-6 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-emerald-500 mb-4"></div>
          <p className="text-slate-400">A carregar perfil...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 flex flex-col items-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-4xl">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Perfil de Utilizador</h1>
            <p className="text-sm text-slate-400">Gestão de conta e informações</p>
          </div>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
          >
            ← Voltar
          </Link>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-900 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* User Information Card */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white">Informações da Conta</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Email</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                  {user?.email || "N/A"}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">UUID (Auth)</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 font-mono">
                  {user?.id || "N/A"}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Conta criada em</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                  {user?.created_at ? formatDate(user.created_at) : "N/A"}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Email confirmado</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm">
                  {user?.email_confirmed_at ? (
                    <span className="text-emerald-500">✓ Confirmado</span>
                  ) : (
                    <span className="text-amber-500">⚠ Não confirmado</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MeshCentral Integration Card */}
        {meshUser && (
          <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <h2 className="text-lg font-medium mb-4 text-white">Integração MeshCentral</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Username MeshCentral</label>
                  <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                    {meshUser.mesh_username}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Mesh User UUID</label>
                  <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 font-mono">
                    {meshUser.id}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Correlação criada em</label>
                  <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                    {formatDate(meshUser.created_at)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Auth User ID</label>
                  <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 font-mono">
                    {meshUser.auth_user_id}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Admin Section - Only visible if Auth0 session has admin access */}
        {auth0Info?.authenticated && auth0Info?.canManageUsers && (
          <section className="bg-slate-900/70 border border-amber-700/50 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <h2 className="text-lg font-medium mb-4 text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Área de Administração
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-300 mb-1">
                    Tens acesso de administrador como{" "}
                    <span className="text-amber-400 font-medium">{auth0Info.roleLabel}</span>
                  </p>
                  {auth0Info.org && (
                    <p className="text-xs text-slate-500">
                      Organização: {auth0Info.org}
                    </p>
                  )}
                </div>
                <Link
                  href="/admin/users"
                  className="px-5 py-2.5 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-500 transition text-white flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Gestão de Utilizadores
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Password Management + OS Preference */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white">Segurança</h2>

          {!showPasswordChange ? (
            <button
              onClick={() => setShowPasswordChange(true)}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
            >
              Alterar Password
            </button>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 text-slate-200">Password Actual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                  disabled={passwordLoading}
                  autoComplete="current-password"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 text-slate-200">Nova Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                  disabled={passwordLoading}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div>
                <label className="block text-sm mb-1 text-slate-200">Confirmar Nova Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                  disabled={passwordLoading}
                  autoComplete="new-password"
                  placeholder="Repetir nova password"
                />
              </div>

              {passwordError && (
                <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2">
                  ✓ Password actualizada com sucesso!
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                >
                  {passwordLoading ? "A actualizar..." : "Actualizar Password"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordChange(false);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  disabled={passwordLoading}
                  className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed transition text-white"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 border-t border-slate-700 pt-4">
            <h3 className="text-sm font-medium text-white mb-2">Ambiente RustDesk</h3>
            <p className="text-sm text-slate-400 mb-3">
              Indica o sistema operativo principal onde usas o RustDesk. Isto é usado para mostrar comandos de instalação/atualização adequados (não altera dados no servidor).
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleOsPreferenceChange("windows")}
                  className={`px-4 py-2 text-sm rounded-md border ${
                    osPreference === "windows"
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Windows
                </button>
                <button
                  type="button"
                  onClick={() => handleOsPreferenceChange("macos")}
                  className={`px-4 py-2 text-sm rounded-md border ${
                    osPreference === "macos"
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  macOS
                </button>
              </div>

              {osPreference === "windows" && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-400">
                    Comandos para instalar/actualizar o RustDesk via <span className="font-mono">winget</span>:
                  </p>
                  <div className="flex flex-col md:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => copyCommand(RUSTDESK_WINGET_INSTALL)}
                      className="px-4 py-2 text-xs rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
                    >
                      Copiar comando de instalação (winget install)
                    </button>
                    <button
                      type="button"
                      onClick={() => copyCommand(RUSTDESK_WINGET_UPGRADE)}
                      className="px-4 py-2 text-xs rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
                    >
                      Copiar comando de atualização (winget upgrade)
                    </button>
                  </div>
                </div>
              )}

              {copyMessage && (
                <p className="text-xs text-emerald-400 mt-1">{copyMessage}</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}