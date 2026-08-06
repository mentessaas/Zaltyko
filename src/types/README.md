# Types - Definiciones de Tipos

Este directorio contiene las definiciones de tipos TypeScript del proyecto.

## Tipos Principales

### Roles de Usuario
```typescript
type UserRole = "super_admin" | "admin" | "owner" | "coach" | "athlete" | "parent";
```

### Estados
```typescript
type AthleteStatus = "active" | "trial" | "inactive" | "archived";
type AttendanceStatus = "present" | "absent" | "late" | "excused";
type AcademyStatus = "active" | "suspended" | "inactive";
```

### Respuestas API
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

## Uso

```typescript
import type { UserRole, ApiResponse, PaginatedResponse } from "@/types";
```
