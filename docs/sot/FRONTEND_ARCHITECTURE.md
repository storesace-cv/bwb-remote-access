# Frontend Architecture (Post-Sprint 2)

**Last Updated:** 28 December 2025  
**Status:** Implemented

---

## Overview

Sprint 2 refactored the monolithic dashboard (2373 lines) into a maintainable structure with clear separation of concerns.

---

## 1. Directory Structure

```
src/
├── app/                           # Next.js App Router pages
│   ├── page.tsx                   # Login page
│   ├── dashboard/
│   │   └── page.tsx               # Dashboard (orchestration only, ~165 lines)
│   └── api/                       # API routes
│
├── components/
│   └── dashboard/                 # Dashboard-specific components
│       ├── index.ts               # Re-exports
│       ├── DashboardHeader.tsx    # Page header with navigation
│       ├── AgentPanel.tsx         # Agent management panel
│       ├── AddDevicePanel.tsx     # Device registration options
│       ├── FiltersBar.tsx         # Search, sort, filter controls
│       ├── DeviceList.tsx         # Grouped device list with pagination
│       ├── DeviceCard.tsx         # Individual device card
│       ├── UnadoptedDevicesList.tsx
│       ├── AdminUnassignedDevicesList.tsx
│       ├── RegistrationModal.tsx  # QR code + hybrid adoption modal
│       ├── AdoptModal.tsx         # Device adopt/edit form
│       ├── AdminReassignModal.tsx # Admin reassign device modal
│       └── EmptyState.tsx         # Empty state display
│
├── hooks/                         # Custom React hooks
│   ├── index.ts                   # Re-exports
│   ├── useDevices.ts              # Device CRUD, filtering, sorting
│   ├── useDeviceRegistration.ts   # QR registration flow
│   └── useMeshUsers.ts            # User profile, permissions
│
├── types/                         # TypeScript DTOs
│   ├── index.ts                   # Re-exports
│   ├── DeviceDTO.ts               # Device types + mappers
│   ├── MeshUserDTO.ts             # User types + mappers
│   └── ApiError.ts                # Error types + helpers
│
└── lib/
    ├── apiClient.ts               # Centralized API wrapper
    ├── grouping.ts                # Device grouping logic
    └── debugLogger.ts             # Frontend logging
```

---

## 2. Component Layer

### Principles

1. **Single Responsibility** - Each component does one thing
2. **Presentational Focus** - Components receive data via props
3. **No Direct API Calls** - Data fetching happens in hooks
4. **Typed Props** - All components have explicit TypeScript interfaces

### Component Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| Layout | Page structure, headers | `DashboardHeader`, `AgentPanel` |
| Display | Render data | `DeviceCard`, `DeviceList`, `EmptyState` |
| Forms | User input | `FiltersBar`, `AdoptModal` |
| Modals | Overlay dialogs | `RegistrationModal`, `AdminReassignModal` |

### Example Component Structure

```typescript
// components/dashboard/DeviceCard.tsx

interface DeviceCardProps {
  device: GroupableDevice;          // Data from parent
  onAdopt?: (device: GroupableDevice) => void;   // Optional callbacks
  onEdit?: (device: GroupableDevice) => void;
  onDelete?: (device: GroupableDevice) => void;
  isAdmin?: boolean;                // Display flags
  isAdopted?: boolean;
}

export function DeviceCard({ device, onAdopt, ... }: DeviceCardProps) {
  // Render logic only - no API calls, no complex state
}
```

---

## 3. Hooks Layer

### Principles

1. **Business Logic Encapsulation** - Complex logic lives in hooks
2. **Data Fetching Ownership** - Hooks manage loading/error states
3. **Reusability** - Same hook can be used across pages
4. **Composition** - Hooks can use other hooks

### Hook Inventory

#### `useDevices`

**Responsibilities:**
- Fetch devices from `get-devices` endpoint
- Fetch groups from `admin-list-groups` endpoint
- Delete device via `remove-device` / `admin-delete-device`
- Refresh device list from RustDesk sync
- Filter by status (all/adopted/unadopted)
- Search by ID, name, notes
- Sort by date, name, ID

**State Exposed:**
```typescript
{
  devices: GroupableDevice[];
  groups: DeviceGroupDTO[];
  loading: boolean;
  groupsLoading: boolean;
  refreshing: boolean;
  errorMsg: string | null;
  refreshError: string | null;
  filterStatus: FilterStatus;
  searchQuery: string;
  sortBy: SortOption;
  filteredDevices: GroupableDevice[];  // Computed
  adoptedDevices: GroupableDevice[];   // Computed
  unadoptedDevices: GroupableDevice[]; // Computed
}
```

#### `useDeviceRegistration`

**Responsibilities:**
- Start registration session via `start-registration-session`
- Fetch QR image via `generate-qr-image`
- Manage countdown timer (5 minutes)
- Handle hybrid RustDesk ID submission
- Update status (awaiting/completed/expired)

**State Exposed:**
```typescript
{
  showModal: boolean;
  session: RegistrationSessionDTO | null;
  qrImageUrl: string;
  qrLoading: boolean;
  qrError: string;
  timeRemaining: number;
  status: "awaiting" | "completed" | "expired";
  matchedDevice: { device_id: string } | null;
  hybridDeviceIdInput: string;
  hybridSubmitLoading: boolean;
  hybridSubmitError: string | null;
  hybridSubmitSuccess: string | null;
}
```

#### `useMeshUsers`

**Responsibilities:**
- Extract user ID from JWT
- Determine user role (admin, agent, minisiteadmin, siteadmin)
- Fetch mesh users list (admin only)
- Reassign device to different user (admin only)

**State Exposed:**
```typescript
{
  authUserId: string | null;
  isAdmin: boolean;
  isAgent: boolean;
  isMinisiteadmin: boolean;
  isSiteadmin: boolean;
  userDomain: string;
  userDisplayName: string;
  meshUsers: MeshUserDTO[];
  meshUsersLoading: boolean;
}
```

---

## 4. DTO Layer

### Purpose

DTOs (Data Transfer Objects) provide:
1. **Type Safety** - Frontend code knows exact shape of data
2. **Decoupling** - Frontend doesn't depend on raw DB column names
3. **Mapping** - Conversion between API format and UI format

### DTOs vs Raw API Response

```typescript
// Raw API response (snake_case, nullable)
{
  device_id: "123456789",
  friendly_name: null,
  last_seen_at: "2025-12-28T00:00:00Z",
  from_provisioning_code: true
}

// DeviceDTO (camelCase, consistent types)
{
  deviceId: "123456789",
  friendlyName: null,
  lastSeenAt: "2025-12-28T00:00:00Z",
  fromProvisioningCode: true
}
```

### Mapping Functions

```typescript
// types/DeviceDTO.ts

export function mapToDeviceDTO(raw: Record<string, unknown>): DeviceDTO {
  return {
    id: String(raw.id ?? ""),
    deviceId: String(raw.device_id ?? ""),
    friendlyName: raw.friendly_name as string | null ?? null,
    // ... other fields
  };
}

// Used in hooks:
const devices = rawDevices.map(mapToDeviceDTO);
```

### ApiError Type

```typescript
interface ApiError {
  code: string;      // Machine-readable error code
  message: string;   // Human-readable message
  status: number;    // HTTP status
  details?: Record<string, unknown>;
}

// Helper functions:
isApiError(error: unknown): error is ApiError
createApiError(source: unknown, defaultMessage?: string): ApiError
```

---

## 5. API Client

**File:** `src/lib/apiClient.ts`

### Responsibilities

1. **Token Management** - Get/store/clear JWT from localStorage
2. **Request Headers** - Consistent Authorization, Content-Type, apikey
3. **Error Normalization** - Convert all errors to ApiError format
4. **Timeout Handling** - AbortController with configurable timeout

### Exported Functions

```typescript
// Token management
getStoredToken(): string | null
storeToken(token: string): void
clearToken(): void
decodeJwtSubject(token: string): string | null

// API calls
callEdgeFunction<T>(functionName: string, options?): Promise<ApiResponse<T>>
callRestApi<T>(path: string, options?): Promise<ApiResponse<T>>
callLocalApi<T>(path: string, options?): Promise<ApiResponse<T>>
fetchQrImage(): Promise<ApiResponse<string>>  // Returns blob URL
```

### ApiResponse Interface

```typescript
interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
  status: number;
}
```

### Usage Example

```typescript
import { callEdgeFunction } from "@/lib/apiClient";

const result = await callEdgeFunction<{ devices: Device[] }>("get-devices");

if (!result.ok) {
  console.error(result.error?.message);
  return;
}

const devices = result.data?.devices ?? [];
```

---

## 6. Dashboard Page (Orchestration)

**File:** `src/app/dashboard/page.tsx` (~165 lines)

### Responsibilities

1. **Initialize hooks** - useDevices, useDeviceRegistration, useMeshUsers
2. **Coordinate data flow** - Pass data from hooks to components
3. **Handle user actions** - Route callbacks to appropriate hooks
4. **Compose UI** - Render components in correct order

### What It Does NOT Do

- ❌ Direct API calls
- ❌ Complex business logic
- ❌ Data transformation
- ❌ Large JSX trees (delegated to components)

### Structure

```typescript
export default function DashboardPage() {
  // 1. Initialize hooks
  const { authUserId, isAdmin, ... } = useMeshUsers();
  const { devices, groups, ... } = useDevices();
  const registration = useDeviceRegistration(...);

  // 2. Local UI state (modals, forms)
  const [showAdoptModal, setShowAdoptModal] = useState(false);

  // 3. Load data on mount
  useEffect(() => {
    if (jwt) {
      void fetchDevices();
      void fetchGroups();
    }
  }, [jwt]);

  // 4. Callback handlers (thin wrappers)
  const handleLogout = useCallback(() => {
    clearToken();
    router.push("/");
  }, [router]);

  // 5. Render composed UI
  return (
    <main>
      <DashboardHeader ... />
      {isAgent && <AgentPanel ... />}
      {!isAdmin && <AddDevicePanel ... />}
      <FiltersBar ... />
      <DeviceList ... />
      <RegistrationModal ... />
    </main>
  );
}
```

---

## 7. Key Metrics

| Metric | Before Sprint 2 | After Sprint 2 |
|--------|-----------------|----------------|
| dashboard/page.tsx lines | 2373 | 165 |
| useState hooks in page | ~40 | ~10 |
| Components extracted | 0 | 12 |
| Custom hooks | 0 | 3 |
| DTO types | 0 | 3 files |

---

## 8. Import Conventions

```typescript
// Components - from barrel export
import { DeviceList, FiltersBar } from "@/components/dashboard";

// Hooks - from barrel export
import { useDevices, useMeshUsers } from "@/hooks";

// Types - from barrel export
import type { DeviceDTO, ApiError } from "@/types";

// Lib - direct import
import { callEdgeFunction, getStoredToken } from "@/lib/apiClient";
import type { GroupableDevice } from "@/lib/grouping";
```

---

**Next Review:** When new major features require additional components or hooks
