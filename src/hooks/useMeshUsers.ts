"use client";

import { useState, useCallback, useEffect } from "react";
import { callEdgeFunction, callRestApi, getStoredToken, decodeJwtSubject } from "@/lib/apiClient";
import type { MeshUserDTO } from "@/types/MeshUserDTO";

const CANONICAL_ADMIN_ID = "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

interface UseMeshUsersResult {
  // User profile
  authUserId: string | null;
  isAdmin: boolean;
  isAgent: boolean;
  isMinisiteadmin: boolean;
  isSiteadmin: boolean;
  userDomain: string;
  userDisplayName: string;
  
  // Mesh users list (for admin)
  meshUsers: MeshUserDTO[];
  meshUsersLoading: boolean;
  
  // Actions
  loadMeshUsers: () => Promise<void>;
  checkUserType: () => Promise<void>;
  
  // Admin actions
  reassignDevice: (
    deviceId: string,
    targetMeshUsername: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export function useMeshUsers(): UseMeshUsersResult {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [isMinisiteadmin, setIsMinisiteadmin] = useState(false);
  const [isSiteadmin, setIsSiteadmin] = useState(false);
  const [userDomain, setUserDomain] = useState("");
  const [userDisplayName, setUserDisplayName] = useState("");
  
  const [meshUsers, setMeshUsers] = useState<MeshUserDTO[]>([]);
  const [meshUsersLoading, setMeshUsersLoading] = useState(false);

  const isAdmin = authUserId === CANONICAL_ADMIN_ID;

  // Initialize auth user ID from JWT
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      const sub = decodeJwtSubject(token);
      setAuthUserId(sub);
    }
  }, []);

  const checkUserType = useCallback(async () => {
    const jwt = getStoredToken();
    if (!jwt || !authUserId) return;

    // Canonical admin has all privileges
    if (authUserId === CANONICAL_ADMIN_ID) {
      setIsAgent(true);
      setIsMinisiteadmin(true);
      setIsSiteadmin(true);
      return;
    }

    try {
      const result = await callRestApi<
        Array<{ user_type: string | null; domain: string; display_name: string | null }>
      >(`mesh_users?select=user_type,domain,display_name&auth_user_id=eq.${authUserId}`);

      if (result.ok && result.data && result.data.length > 0) {
        const record = result.data[0];
        const role = record.user_type ?? "";

        // Reset flags
        setIsAgent(false);
        setIsMinisiteadmin(false);
        setIsSiteadmin(false);

        // Apply hierarchy
        if (role === "siteadmin") {
          setIsSiteadmin(true);
          setIsMinisiteadmin(true);
          setIsAgent(true);
        } else if (role === "minisiteadmin") {
          setIsMinisiteadmin(true);
          setIsAgent(true);
        } else if (role === "agent") {
          setIsAgent(true);
        }

        setUserDomain(record.domain || "");
        setUserDisplayName(record.display_name || "");
      }
    } catch (error) {
      console.error("Error checking user type:", error);
      setIsAgent(false);
      setIsMinisiteadmin(false);
      setIsSiteadmin(false);
    }
  }, [authUserId]);

  const loadMeshUsers = useCallback(async () => {
    const jwt = getStoredToken();
    if (!jwt) return;
    if (authUserId !== CANONICAL_ADMIN_ID) return;
    if (meshUsersLoading || meshUsers.length > 0) return;

    setMeshUsersLoading(true);

    try {
      const result = await callEdgeFunction<
        | Array<{ id: string; mesh_username?: string | null; display_name?: string | null }>
        | { users?: Array<{ id: string; mesh_username?: string | null; display_name?: string | null }> }
      >("admin-list-mesh-users");

      if (result.ok && result.data) {
        let rawUsers: Array<{ id: string; mesh_username?: string | null; display_name?: string | null }>;

        if (Array.isArray(result.data)) {
          rawUsers = result.data;
        } else if (result.data.users && Array.isArray(result.data.users)) {
          rawUsers = result.data.users;
        } else {
          rawUsers = [];
        }

        const normalized: MeshUserDTO[] = rawUsers.map((item) => ({
          id: item.id,
          meshUsername: item.mesh_username ?? null,
          displayName: item.display_name ?? null,
          email: null,
          userType: null,
          domain: null,
          authUserId: null,
        }));

        setMeshUsers(normalized);
      }
    } catch (error) {
      console.error("Error loading mesh users:", error);
    } finally {
      setMeshUsersLoading(false);
    }
  }, [authUserId, meshUsersLoading, meshUsers.length]);

  const reassignDevice = useCallback(
    async (
      deviceId: string,
      targetMeshUsername: string
    ): Promise<{ success: boolean; error?: string }> => {
      const jwt = getStoredToken();
      if (!jwt) {
        return { success: false, error: "Not authenticated" };
      }

      const result = await callEdgeFunction("admin-update-device", {
        method: "POST",
        body: {
          device_id: deviceId,
          target_mesh_username: targetMeshUsername,
        },
      });

      if (!result.ok) {
        return {
          success: false,
          error: result.error?.message || "Failed to reassign device",
        };
      }

      return { success: true };
    },
    []
  );

  return {
    authUserId,
    isAdmin,
    isAgent,
    isMinisiteadmin,
    isSiteadmin,
    userDomain,
    userDisplayName,
    meshUsers,
    meshUsersLoading,
    loadMeshUsers,
    checkUserType,
    reassignDevice,
  };
}
