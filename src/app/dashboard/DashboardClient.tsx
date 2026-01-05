"use client";

/**
 * Dashboard Client Component
 * 
 * This is the original dashboard code adapted to receive auth data as props
 * instead of reading from localStorage. All UI and functionality is preserved.
 */

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import QRCode from "react-qr-code";

import { GroupableDevice, groupDevices } from "@/lib/grouping";
import { logError } from "@/lib/debugLogger";

const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const buildRustdeskUrl = (device: GroupableDevice): string => {
  const base = `rustdesk://connection/new/${encodeURIComponent(device.device_id)}`;
  const password = device.rustdesk_password?.trim();
  if (password && password.length > 0) {
    return `${base}?password=${encodeURIComponent(password)}`;
  }
  return base;
};

interface RegistrationSession {
  session_id: string;
  expires_at: string;
  expires_in_seconds: number;
}

type SortOption = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "id_asc" | "id_desc";
type FilterStatus = "all" | "adopted" | "unadopted";

interface MeshUserOption {
  id: string;
  mesh_username: string | null;
  display_name: string | null;
}

interface AdoptFormData {
  friendly_name: string;
  group_id: string;
  subgroup_id?: string;
  rustdesk_password: string;
  observations: string;
}

interface CanonicalGroup {
  id: string;
  name: string;
  description: string | null;
  parent_group_id: string | null;
  path: string;
  level: number;
  device_count?: number;
}

interface DashboardClientProps {
  meshUserId: string | null;
  authUserId: string | null;
  userEmail: string;
  isAgent: boolean;
  isMinisiteadmin: boolean;
  isSiteadmin: boolean;
  userDomain: string;
  userDisplayName: string;
}

const ADOPTED_PAGE_SIZE = 20;

export default function DashboardClient({
  meshUserId,
  authUserId,
  userEmail,
  isAgent: isAgentProp,
  isMinisiteadmin: isMinisiteadminProp,
  isSiteadmin: isSiteadminProp,
  userDomain: userDomainProp,
  userDisplayName: userDisplayNameProp,
}: DashboardClientProps) {
  const router = useRouter();
  
  // Auth state from props
  const isAgent = isAgentProp;
  const isMinisiteadmin = isMinisiteadminProp;
  const isSiteadmin = isSiteadminProp;
  const userDomain = userDomainProp;
  const userDisplayName = userDisplayNameProp;
  const isAdmin = isAgent || isMinisiteadmin || isSiteadmin;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [devices, setDevices] = useState<GroupableDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [showFilters, setShowFilters] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationSession, setRegistrationSession] = useState<RegistrationSession | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [registrationStatus, setRegistrationStatus] = useState<"awaiting" | "completed" | "expired">("awaiting");
  const [matchedDevice, setMatchedDevice] = useState<{ device_id: string; friendly_name?: string } | null>(null);
  const [checkingDevice, setCheckingDevice] = useState(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [hybridDeviceIdInput, setHybridDeviceIdInput] = useState<string>("");
  const [hybridSubmitLoading, setHybridSubmitLoading] = useState<boolean>(false);
  const [hybridSubmitError, setHybridSubmitError] = useState<string | null>(null);
  const [hybridSubmitSuccess, setHybridSubmitSuccess] = useState<string | null>(null);

  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [adoptingDevice, setAdoptingDevice] = useState<GroupableDevice | null>(null);
  const [adoptFormData, setAdoptFormData] = useState<AdoptFormData>({
    friendly_name: "",
    group_id: "",
    rustdesk_password: "",
    observations: "",
  });
  const [adoptLoading, setAdoptLoading] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);

  // Canonical groups state
  const [canonicalGroups, setCanonicalGroups] = useState<CanonicalGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [showAdminReassignModal, setShowAdminReassignModal] = useState(false);
  const [adminDeviceToManage, setAdminDeviceToManage] = useState<GroupableDevice | null>(null);
  const [adminReassignForm, setAdminReassignForm] = useState<{ mesh_username: string }>({
    mesh_username: "",
  });
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [meshUsersLoading, setMeshUsersLoading] = useState(false);
  const [meshUsers, setMeshUsers] = useState<MeshUserOption[]>([]);

  const [selectedRustdeskAbi, setSelectedRustdeskAbi] = useState<"arm64" | "armeabi" | "x86_64" | null>(null);
  const [currentAdoptedPage, setCurrentAdoptedPage] = useState<number>(1);
  const [adoptedPageSize, setAdoptedPageSize] = useState<number>(ADOPTED_PAGE_SIZE);

  const RUSTDESK_APK_URLS = {
    arm64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a",
    armeabi: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=armeabi-v7a",
    x86_64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=x86_64",
  };
