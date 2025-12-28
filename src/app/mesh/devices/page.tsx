/**
 * MeshCentral Devices Page - STEP 6.1
 * 
 * Lists MeshCentral devices from Supabase mirror.
 * Requires Auth0 session with org role.
 * 
 * RBAC:
 *   - SuperAdmin: can view all domains
 *   - Domain Admin / Agent: can view only their org domain
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getClaimsFromAuth0Session, isSuperAdminAny, getAdminRoleLabel } from "@/lib/rbac";
import { listMeshDevices, listMeshGroups } from "@/lib/meshcentral-mirror";
import MeshDevicesClient from "@/components/mesh/MeshDevicesClient";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

interface PageProps {
  searchParams: Promise<{ domain?: string; group?: string }>;
}

export default async function MeshDevicesPage({ searchParams }: PageProps) {
  // Get Auth0 session
  const session = await auth0.getSession();
  if (!session?.user) {
    redirect("/auth");
  }

  const claims = getClaimsFromAuth0Session(session);
  const isSuperAdmin = isSuperAdminAny(claims);
  const roleLabel = getAdminRoleLabel(claims);

  // Check if user has any org role
  const hasOrgRole = 
    isSuperAdmin || 
    (claims.org && Object.keys(claims.orgRoles).length > 0);

  if (!hasOrgRole) {
    redirect("/auth");
  }

  // Determine domain filter
  const params = await searchParams;
  let filterDomain: ValidDomain | null = null;

  if (isSuperAdmin) {
    // SuperAdmin can filter by any domain
    if (params.domain && VALID_DOMAINS.includes(params.domain as ValidDomain)) {
      filterDomain = params.domain as ValidDomain;
    }
  } else if (claims.org && VALID_DOMAINS.includes(claims.org as ValidDomain)) {
    // Non-superadmin scoped to their org
    filterDomain = claims.org as ValidDomain;
  }

  // Fetch groups and devices
  let groups: Awaited<ReturnType<typeof listMeshGroups>>["groups"] = [];
  let devices: Awaited<ReturnType<typeof listMeshDevices>>["devices"] = [];
  let total = 0;
  let fetchError: string | null = null;

  try {
    const groupResult = await listMeshGroups({ domain: filterDomain });
    groups = groupResult.groups;

    const deviceResult = await listMeshDevices({
      domain: filterDomain,
      meshId: params.group || null,
      limit: 100,
      offset: 0,
    });
    devices = deviceResult.devices;
    total = deviceResult.total;
  } catch (err) {
    console.error("Failed to fetch devices:", err);
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  // Transform for client component
  const clientGroups = groups.map((g) => ({
    id: g.id,
    meshId: g.mesh_id,
    domain: g.domain,
    name: g.name,
  }));

  const clientDevices = devices.map((d) => ({
    id: d.id,
    nodeId: d.node_id,
    domain: d.domain,
    meshId: d.mesh_id,
    hostname: d.hostname,
    osDescription: d.os_description,
    agentVersion: d.agent_version,
    ipLocal: d.ip_local,
    ipPublic: d.ip_public,
    lastConnect: d.last_connect,
    groupName: d.group_name,
  }));

  return (
    <main className="min-h-screen px-4 py-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <svg className="w-7 h-7 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              Dispositivos MeshCentral
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isSuperAdmin ? "Todos os domínios" : `Domínio: ${claims.org || "N/A"}`}
              {roleLabel && (
                <>
                  {" · "}
                  <span className={isSuperAdmin ? "text-amber-400" : "text-emerald-400"}>
                    {roleLabel}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard/profile"
              className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
            >
              ← Perfil
            </Link>
          </div>
        </header>

        {/* Domain Filter (SuperAdmin only) */}
        {isSuperAdmin && (
          <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 mb-6 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">Filtrar por domínio:</span>
              <div className="flex gap-2">
                <Link
                  href="/mesh/devices"
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    !filterDomain
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Todos
                </Link>
                {VALID_DOMAINS.map((d) => (
                  <Link
                    key={d}
                    href={`/mesh/devices?domain=${d}`}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filterDomain === d
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {d}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Devices List (Client Component) */}
        {fetchError ? (
          <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-red-400 mb-2">Erro ao carregar dispositivos</p>
              <p className="text-sm text-slate-500">{fetchError}</p>
              <p className="text-xs text-slate-600 mt-2">
                Verifica se SUPABASE_SERVICE_ROLE_KEY está configurado e a migration foi aplicada.
              </p>
            </div>
          </section>
        ) : (
          <MeshDevicesClient
            initialGroups={clientGroups}
            initialDevices={clientDevices}
            initialTotal={total}
            filterDomain={filterDomain}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </div>
    </main>
  );
}
