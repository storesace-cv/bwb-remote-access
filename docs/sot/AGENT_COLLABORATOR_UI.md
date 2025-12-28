# Agent-Collaborator Model UI Implementation

**Source of Truth Reference:** `docs/sot/rustdesk-agent-collaborator-model.md`  
**Last Updated:** 21 December 2025

## 📱 Overview

Complete frontend implementation of the Agent-Collaborator Model with three integrated dashboard pages for managing collaborators, groups, and permissions.

## 🎯 UI Components

### 1. Collaborators Management (`/dashboard/collaborators`)

**Purpose:** Create and manage collaborators within an agent's tenant.

**Key Features:**
- ✅ Create new collaborators with email, password, and mesh_username
- ✅ List all collaborators with permission and device counts
- ✅ View last login and creation timestamps
- ✅ Delete collaborators with confirmation dialog
- ✅ Direct navigation to permissions page per collaborator
- ✅ Real-time stats (permission count, device count)

**User Flow:**
1. Agent clicks "Criar Colaborador" button
2. Fills form: email (required), password (min 6 chars), display name (optional), mesh_username (required)
3. System creates auth user + mesh_users entry with `user_type='collaborator'`
4. Collaborator appears in table with zero permissions
5. Agent can click "Permissões" to grant access or "Apagar" to remove

**Access Control:**
- Only visible to agents (`user_type='agent'`)
- Canonical admin (`9ebfa3dd-392c-489d-882f-8a1762cb36e8`) always has access
- Collaborators cannot access this page

**API Endpoints Used:**
- `POST /functions/v1/admin-create-collaborator` - Create new collaborator
- `GET /functions/v1/admin-list-collaborators` - List all tenant collaborators
- `POST /functions/v1/admin-delete-auth-user` - Delete collaborator

### 2. Groups Management (`/dashboard/groups`)

**Purpose:** Organize devices into hierarchical groups for permission management.

**Key Features:**
- ✅ Hierarchical tree visualization with expand/collapse
- ✅ Create root groups and nested subgroups
- ✅ View device count and permission count per group
- ✅ Display full group path (e.g., "Escritório / Lisboa / Sala 1")
- ✅ Create subgroups directly from parent group
- ✅ Color-coded indicators (devices in blue, permissions in green)

**User Flow:**
1. Agent views hierarchical tree of all groups
2. Clicks "Criar Grupo Raiz" or "Subgrupo" button on existing group
3. Enters name (required) and description (optional)
4. System creates group with automatic path computation
5. Group appears in tree with device/permission counts
6. Can create unlimited nested subgroups

**Access Control:**
- Visible to agents and collaborators
- Agents see all groups in their tenant
- Collaborators see only permitted groups via RLS
- Groups filtered server-side by `agent_id`

**API Endpoints Used:**
- `GET /functions/v1/admin-list-groups` - List all groups (permission-aware)
- `POST /functions/v1/admin-create-group` - Create new group

**Hierarchical Organization:**
```
Escritório Lisboa (root)
├── Departamento TI (subgroup)
│   ├── Sala Servidores (subgroup)
│   └── Helpdesk (subgroup)
└── Receção (subgroup)
```

### 3. Permissions Management (`/dashboard/permissions`)

**Purpose:** Grant and revoke group access permissions to collaborators.

**Key Features:**
- ✅ Matrix view: collaborators × groups with visual indicators
- ✅ Grant permission with dropdown selectors
- ✅ Revoke permission with single click + confirmation
- ✅ Permission audit trail with history modal
- ✅ Filter by specific collaborator (via URL parameter `?user=<id>`)
- ✅ Real-time permission status display
- ✅ Green badges for granted access, "—" for no access

**User Flow:**
1. Agent views matrix of collaborators and groups
2. Clicks "Conceder Permissão" to grant new access
3. Selects collaborator and group from dropdowns
4. System creates permission entry with audit log
5. Green badge appears in matrix cell
6. To revoke: clicks green badge, confirms, permission soft-deleted
7. View history: clicks "Histórico" to see audit trail

**Access Control:**
- Only visible to agents (`user_type='agent'`)
- All permission changes are audited
- Collaborators cannot manage permissions

**API Endpoints Used:**
- `GET /functions/v1/admin-list-collaborators` - List collaborators
- `GET /functions/v1/admin-list-groups` - List groups
- `GET /rest/v1/mesh_group_permissions?revoked_at=is.null` - Active permissions
- `POST /functions/v1/admin-grant-permission` - Grant access
- `POST /functions/v1/admin-revoke-permission` - Revoke access (soft delete)
- `GET /rest/v1/mesh_permission_audit?order=performed_at.desc` - Audit trail

**Permission Matrix Example:**
```
                     │ Escritório Lisboa │ Dep. TI │ Receção
────────────────────┼───────────────────┼─────────┼─────────
João Silva          │   ✓ Acesso        │    —    │    —
Maria Santos        │   ✓ Acesso        │ ✓ Acesso│    —
Pedro Oliveira      │       —           │ ✓ Acesso│ ✓ Acesso
```

## 🎨 Design System

### Color Palette
- **Background:** `slate-950` (main), `slate-900/70` (cards)
- **Borders:** `slate-700`
- **Text:** `white` (primary), `slate-400` (secondary), `slate-500` (tertiary)
- **Accent:** `emerald-600` (primary actions), `emerald-500` (hover)
- **Success:** `emerald-600/20` (backgrounds), `emerald-300` (text)
- **Warning:** `amber-600/20` (backgrounds), `amber-300` (text)
- **Error:** `red-600` (buttons), `red-950/40` (backgrounds)
- **Info:** `sky-600/20` (backgrounds), `sky-300` (text)

### Typography
- **Headings:** `text-xl font-semibold` (page titles)
- **Subheadings:** `text-lg font-medium`
- **Body:** `text-sm` (standard), `text-xs` (compact)
- **Monospace:** `font-mono text-[11px]` (IDs, usernames)

### Icons
- Using `lucide-react` library
- Standard size: `w-4 h-4` (16px) or `w-6 h-6` (24px) for page headers
- Key icons:
  - Users (collaborators page)
  - FolderTree (groups page)
  - Shield (permissions page)
  - Plus (create actions)
  - Trash2 (delete actions)
  - History (audit trail)
  - Eye (view details)

### Component Patterns

**Modal Structure:**
```tsx
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
  <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-white">Modal Title</h3>
      <button onClick={closeModal}>✕</button>
    </div>
    
    {/* Content */}
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  </div>
</div>
```

**Table Structure:**
```tsx
<table className="min-w-full text-xs text-left text-slate-200">
  <thead>
    <tr className="border-b border-slate-700 text-slate-400">
      <th className="px-2 py-1.5 font-medium">Column</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-slate-800 last:border-0">
      <td className="px-2 py-2 align-top">Data</td>
    </tr>
  </tbody>
</table>
```

**Button Patterns:**
```tsx
{/* Primary Action */}
<button className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">
  Action
</button>

{/* Secondary Action */}
<button className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-white">
  Cancel
</button>

{/* Danger Action */}
<button className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 text-white">
  Delete
</button>
```

## 🔐 Security & Access Control

### Authentication
- JWT token stored in `localStorage` under key `rustdesk_jwt`
- Token validated on mount, redirect to `/` if invalid
- User ID extracted from JWT payload (`sub` claim)

### Authorization
- User type checked via `mesh_users.user_type` column
- Canonical admin always has agent privileges
- Server-side enforcement via RLS policies
- UI hides/shows features based on role, but RLS prevents unauthorized access

### Data Validation
- Required fields marked with red asterisk `*`
- Email validation (HTML5 type="email")
- Password minimum length: 6 characters
- Mesh username format: lowercase letters, numbers, dots
- Confirmation dialogs for destructive actions

## 📊 State Management

### Local State (per page)
```tsx
// Authentication
const [jwt, setJwt] = useState<string | null>(null);
const [authUserId, setAuthUserId] = useState<string | null>(null);
const [isAgent, setIsAgent] = useState(false);

// Data
const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
const [groups, setGroups] = useState<Group[]>([]);
const [permissions, setPermissions] = useState<Permission[]>([]);

// UI State
const [loading, setLoading] = useState(false);
const [errorMsg, setErrorMsg] = useState<string | null>(null);
const [modalOpen, setModalOpen] = useState(false);
```

### Data Fetching Pattern
```tsx
const fetchData = useCallback(async () => {
  if (!jwt || !isAgent) return;
  
  setLoading(true);
  setErrorMsg(null);
  
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: anonKey,
      },
    });
    
    if (!res.ok) throw new Error("Failed to fetch");
    
    const data = await res.json();
    setData(data);
  } catch (err) {
    setErrorMsg(err.message);
  } finally {
    setLoading(false);
  }
}, [jwt, isAgent]);
```

## 🚀 Integration with Main Dashboard

### Navigation Updates
The main dashboard (`/dashboard/page.tsx`) includes:

```tsx
{isAgent && (
  <>
    <Link href="/dashboard/collaborators">Colaboradores</Link>
    <Link href="/dashboard/groups">Grupos</Link>
    <Link href="/dashboard/permissions">Permissões</Link>
  </>
)}
```

### Navigation Flow
```
Main Dashboard
├── Colaboradores → Create/List/Delete collaborators
├── Grupos → Create/View hierarchical groups
├── Permissões → Grant/Revoke group access
└── ← Back to Dashboard (all pages)
```

### Cross-Page Navigation
- Collaborators page → Permissions page (filtered by collaborator)
- Groups page ↔ Permissions page (complementary views)
- All pages → Dashboard (consistent back link)

## 🧪 Testing Checklist

### Functional Tests
- [ ] Create collaborator with valid data
- [ ] Create collaborator with invalid data (short password, missing fields)
- [ ] Delete collaborator with confirmation
- [ ] Create root group
- [ ] Create nested subgroup
- [ ] Expand/collapse group tree
- [ ] Grant permission to collaborator
- [ ] Revoke permission with confirmation
- [ ] View audit trail
- [ ] Filter permissions by collaborator

### UI Tests
- [ ] Responsive layout on mobile/tablet/desktop
- [ ] Modal open/close animations
- [ ] Loading states display correctly
- [ ] Error messages show and clear appropriately
- [ ] Success states provide feedback
- [ ] Navigation links work correctly
- [ ] Icons render properly

### Security Tests
- [ ] Non-agent users cannot access pages
- [ ] Invalid JWT redirects to login
- [ ] RLS prevents unauthorized data access
- [ ] Confirmation dialogs prevent accidental deletions
- [ ] Audit trail captures all permission changes

### Performance Tests
- [ ] Large lists (100+ items) render smoothly
- [ ] Table scrolling is fluid
- [ ] Modal animations don't lag
- [ ] Data fetching is optimized (no unnecessary re-fetches)

## 📱 Responsive Design

### Breakpoints
- **Mobile:** < 640px (`sm:`)
- **Tablet:** 640px - 1024px (`md:`)
- **Desktop:** > 1024px (`lg:`)

### Responsive Patterns
```tsx
{/* Mobile: Stack vertically, Desktop: Side by side */}
<div className="flex flex-col md:flex-row gap-4">
  {/* Content */}
</div>

{/* Mobile: Full width, Desktop: Fixed max width */}
<div className="w-full max-w-7xl mx-auto px-4 py-8">
  {/* Content */}
</div>

{/* Table: Horizontal scroll on mobile */}
<div className="overflow-x-auto">
  <table className="min-w-full">
    {/* Table content */}
  </table>
</div>
```

## 🔄 Future Enhancements

### Planned Features
1. **Bulk Operations**
   - Select multiple collaborators for bulk permission grants
   - Bulk group creation from CSV/JSON import

2. **Advanced Filtering**
   - Search collaborators by name/email
   - Filter groups by device count
   - Filter permissions by date range

3. **Visual Improvements**
   - Drag-and-drop group reordering
   - Color-coded group labels
   - Permission inheritance indicators

4. **Collaboration Features**
   - Real-time updates (WebSocket)
   - Conflict resolution for concurrent edits
   - Change notifications

5. **Reporting**
   - Export audit trail to CSV
   - Permission usage analytics
   - Device assignment reports

## 📚 Related Documentation

- **Backend:** `docs/sot/AGENT_COLLABORATOR_DEPLOYMENT.md`
- **SoT:** `docs/sot/rustdesk-agent-collaborator-model.md`
- **Architecture:** `docs/sot/architecture.md`
- **Data Models:** `docs/sot/data-models.md`

## 🎓 Developer Notes

### Adding New Pages
1. Create page in `src/app/dashboard/<name>/page.tsx`
2. Use "use client" directive for client components
3. Follow JWT authentication pattern
4. Implement user type checking (`isAgent`)
5. Add navigation link in main dashboard
6. Add link in related pages for cross-navigation

### Styling Guidelines
- Always use Tailwind utility classes
- Maintain slate-950/emerald-600 color scheme
- Use consistent spacing (px-3 py-1.5 for buttons)
- Follow existing modal/table patterns
- Test dark mode appearance (default theme)

### Error Handling
- Always wrap API calls in try-catch
- Set specific error messages for user feedback
- Clear errors when retrying operations
- Provide actionable error messages

### Performance
- Use `useCallback` for event handlers
- Memoize expensive computations
- Fetch data on mount, refetch on actions
- Avoid unnecessary re-renders

---

**Status:** ✅ Production-Ready  
**Last Review:** 21 December 2025  
**Maintained By:** RustDesk Mesh Integration Team