# Frontend Structure

## Architecture

The frontend follows a separation of concerns pattern:

- **Pages** - Orchestrators that compose hooks and components
- **Hooks** - Business logic and state management
- **Components** - Presentational UI elements
- **DTOs** - Type definitions for data transfer
- **apiClient** - Centralized HTTP communication

## Directory Layout

```
src/
├── app/
│   ├── page.tsx                    # Login page
│   └── dashboard/
│       └── page.tsx                # Dashboard (165 lines)
├── components/
│   └── dashboard/
│       ├── DeviceList.tsx
│       ├── DeviceCard.tsx
│       ├── FiltersBar.tsx
│       ├── RegistrationModal.tsx
│       ├── AdoptModal.tsx
│       ├── AdminReassignModal.tsx
│       ├── UnadoptedDevicesList.tsx
│       ├── AdminUnassignedDevicesList.tsx
│       ├── DashboardHeader.tsx
│       ├── AgentPanel.tsx
│       ├── AddDevicePanel.tsx
│       └── EmptyState.tsx
├── hooks/
│   ├── index.ts                    # Re-exports
│   ├── useDevices.ts
│   ├── useDeviceRegistration.ts
│   └── useMeshUsers.ts
├── lib/
│   ├── apiClient.ts
│   ├── grouping.ts
│   └── debugLogger.ts
└── types/
    ├── index.ts
    ├── DeviceDTO.ts
    ├── MeshUserDTO.ts
    └── ApiError.ts
```

## Hooks

### `useDevices`

Manages device list state and operations.

```typescript
const {
  devices,              // All devices
  groups,               // Device groups
  loading,              // Initial load state
  errorMsg,             // Error message
  fetchDevices,         // Refresh device list
  deleteDevice,         // Delete user's device
  filterStatus,         // "all" | "adopted" | "unadopted"
  setFilterStatus,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  adoptedDevices,       // Computed: devices with notes
  unadoptedDevices,     // Computed: devices without notes
} = useDevices();
```

### `useDeviceRegistration`

Manages the device registration flow (QR code + hybrid ID entry).

```typescript
const {
  showModal,
  qrImageUrl,
  qrLoading,
  timeRemaining,        // Countdown in seconds
  status,               // "awaiting" | "completed" | "expired"
  hybridDeviceIdInput,
  hybridSubmitLoading,
  hybridSubmitError,
  hybridSubmitSuccess,
  startRegistration,    // Open modal, start session
  closeModal,
  setHybridDeviceIdInput,
  submitHybridDeviceId, // Submit RustDesk ID directly
} = useDeviceRegistration(onDeviceRegistered);
```

### `useMeshUsers`

Manages user profile and admin operations.

```typescript
const {
  authUserId,
  isAdmin,              // Canonical admin check
  isAgent,
  userDomain,
  userDisplayName,
  meshUsers,            // For admin: all users
  loadMeshUsers,
  checkUserType,
  reassignDevice,       // Admin: change device owner
} = useMeshUsers();
```

## API Client

`src/lib/apiClient.ts` provides:

```typescript
// Edge Function calls
const result = await callEdgeFunction<ResponseType>("function-name", {
  method: "POST",
  body: { ... },
});

// REST API calls (direct Supabase)
const result = await callRestApi<ResponseType>("table?filter=value");

// QR image fetch
const result = await fetchQrImage();

// Token management
getStoredToken()      // From localStorage
storeToken(token)     // To localStorage
clearToken()          // Remove from localStorage
```

All functions return:
```typescript
interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: ApiError | null;
  status: number;
}
```

## DTOs

### DeviceDTO

```typescript
interface DeviceDTO {
  id: string;
  deviceId: string;
  friendlyName: string | null;
  groupId: string | null;
  notes: string | null;
  owner: string | null;
  lastSeenAt: string | null;
  // ... other fields
}
```

### MeshUserDTO

```typescript
interface MeshUserDTO {
  id: string;
  meshUsername: string | null;
  displayName: string | null;
  userType: string | null;
  domain: string | null;
}
```

## Component Patterns

### Modal Components

Accept state and callbacks as props:

```typescript
interface ModalProps {
  showModal: boolean;
  // ... data props
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}
```

### List Components

Receive filtered/sorted data from hooks:

```typescript
interface ListProps {
  devices: GroupableDevice[];
  loading: boolean;
  onEdit: (device: GroupableDevice) => void;
  onDelete: (device: GroupableDevice) => void;
}
```

## Dashboard Page Structure

```typescript
// src/app/dashboard/page.tsx (orchestrator)

export default function DashboardPage() {
  // Initialize hooks
  const { devices, ... } = useDevices();
  const { isAdmin, ... } = useMeshUsers();
  const registration = useDeviceRegistration(...);

  // Local UI state (modals)
  const [showAdoptModal, setShowAdoptModal] = useState(false);

  // Event handlers
  const handleAdoptSubmit = useCallback(async (e) => { ... }, [deps]);

  // Render composition
  return (
    <main>
      <DashboardHeader ... />
      <FiltersBar ... />
      <DeviceList ... />
      <RegistrationModal ... />
      <AdoptModal ... />
    </main>
  );
}
```
