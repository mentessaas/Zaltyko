# Super Admin Panel

## Overview

System administration panel for managing all academies, users, and system-wide settings.

## Key Files

### Pages
```
src/app/(super-admin)/super-admin/
├── dashboard/             # System overview
├── academies/
│   ├── page.tsx          # List all academies
│   ├── [academyId]/      # Academy detail
│   └── public/           # Public academies management
├── users/                # All users
│   └── [profileId]/      # User detail
├── billing/              # Global billing view
├── logs/                 # System logs
├── support/              # Support tickets
│   └── [ticketId]/       # Ticket detail
└── settings/             # System settings
```

## Services

```typescript
// src/lib/super-admin.ts      - Helper functions
// src/lib/superAdminService.ts - Full admin service
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/super-admin/academies` | List all academies |
| GET | `/api/super-admin/academies/[id]` | Academy details |
| PUT | `/api/super-admin/academies/[id]/public` | Toggle public status |
| GET | `/api/super-admin/users` | List all users |
| GET | `/api/super-admin/users/[id]` | User details |
| POST | `/api/super-admin/users/[id]/send-message` | Send message |
| GET | `/api/super-admin/logs` | System logs |
| GET | `/api/super-admin/metrics` | System metrics |
| POST | `/api/super-admin/athletes/sync-users` | Sync athlete users |

## Components

```
src/components/admin/
├── PublicAcademiesTable.tsx  # Public academies list
├── InviteUserForm.tsx        # Invite user form
└── TogglePublicVisibility.tsx # Toggle academy visibility

src/components/audit/
└── AuditLogsViewer.tsx       # Audit log viewer
```

## Access Control

Only users with `role: 'super_admin'` can access super-admin routes.

```typescript
// Example route protection
export const GET = withSuperAdmin(async (request: Request) => {
  // Only super admins reach here
});
```

## Features

- View all academies and their stats
- Manage academy visibility (public/private)
- Access all user data across academies
- View system-wide billing
- Access audit logs
- Manage support tickets
- System configuration