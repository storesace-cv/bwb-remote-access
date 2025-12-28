# System Architecture

**Version:** 2.0.0  
**Last Updated:** December 2025

## Overview

RustDesk device management portal with Supabase backend. Manages Android devices running RustDesk, supporting user-based device ownership and hierarchical grouping.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 18, TypeScript 5 |
| Backend | Supabase Edge Functions (Deno) |
| Database | PostgreSQL (Supabase-hosted) |
| Auth | Supabase Auth (JWT) |
| Styling | Tailwind CSS |

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Pages     │  │   Hooks     │  │    Components       │  │
│  │ (dashboard) │──│ (useDevices)│──│ (DeviceList, etc.)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                │                                   │
│         └────────────────┴────────────────┐                  │
│                                           │                  │
│  ┌───────────────────────────────────────┐│                  │
│  │          apiClient.ts                 ││                  │
│  │   (Centralized API communication)     ││                  │
│  └───────────────────────────────────────┘│                  │
└────────────────────────────────────────────┼─────────────────┘
                                             │
                                             │ HTTPS
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Edge Functions                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 _shared/auth.ts                       │   │
│  │  (JWT validation, input validation, structured logs)  │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                                                    │
│  ┌──────┴──────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │ get-devices │  │register-device│  │ admin-* funcs    │   │
│  └─────────────┘  └───────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                                             │
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     PostgreSQL (RLS)                         │
│  ┌─────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │ auth.users  │  │ android_devices│  │   mesh_users     │   │
│  └─────────────┘  └───────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Directories

```
/app
├── src/
│   ├── app/dashboard/page.tsx    # Main page (orchestrator)
│   ├── components/dashboard/     # UI components
│   ├── hooks/                    # Business logic hooks
│   ├── lib/apiClient.ts          # API communication
│   └── types/                    # DTOs
├── supabase/functions/
│   ├── _shared/auth.ts           # Security module
│   ├── register-device/          # Device registration
│   ├── get-devices/              # Device listing
│   └── admin-*/                  # Admin operations
└── docs/                         # Documentation
```

## Data Flow

### Authentication

1. User submits credentials to `/api/login`
2. Next.js route calls Supabase Auth
3. JWT returned and stored in `localStorage`
4. JWT sent with all subsequent API requests

### Device Operations

1. Frontend calls Edge Function via `apiClient.ts`
2. Edge Function validates JWT using `_shared/auth.ts`
3. Function queries/modifies PostgreSQL
4. Response returned through `apiClient.ts`
5. Hooks update React state
6. Components re-render

## Security Model

| Control | Implementation |
|---------|----------------|
| Authentication | JWT (Supabase Auth) |
| Authorization | User roles (admin, agent, user) |
| Data Isolation | Row Level Security (RLS) |
| Input Validation | Centralized validators in `_shared/auth.ts` |
| Logging | Structured JSON with correlation IDs |

## Related Documentation

- [Edge Functions](./edge-functions.md) - Backend security and API
- [Frontend Structure](./frontend-structure.md) - Component architecture
- [QR Hybrid Adoption](./qr-hybrid-adoption.md) - Device registration flow
- [Operations](./operations.md) - Deployment and maintenance
