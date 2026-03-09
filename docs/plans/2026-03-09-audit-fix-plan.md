# Auditoría Técnica - Plan de Implementación Completo

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Corregir todos los 72+ issues encontrados en la auditoría técnica del proyecto Zaltyko, priorizados por severidad.

**Architecture:** Se abordarán los issues en orden de severidad (CRITICAL → HIGH → MEDIUM → LOW), comenzando por los de seguridad más críticos.

**Tech Stack:** Next.js 14, Drizzle ORM, Supabase, TypeScript, Tailwind CSS

---

## Fase 1: CRITICAL - Seguridad Inmediata

### Task 1: Corregir PUT /athletes/[id] - Validación de body

**Files:**
- Modify: `src/app/api/athletes/[athleteId]/route.ts`

**Step 1: Leer el archivo actual**
Run: Read `src/app/api/athletes/[athleteId]/route.ts`

**Step 2: Agregar validación Zod schema**

```typescript
import { z } from "zod";
import { athleteStatusOptions } from "@/db/schema/athletes";

const UpdateAthleteSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  dob: z.string().optional().nullable(),
  level: z.string().max(120).nullable().optional(),
  status: z.enum(athleteStatusOptions).optional(),
  groupId: z.string().uuid().nullable().optional(),
  age: z.number().int().min(0).max(120).optional(),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().optional().nullable(),
  emergencyContact: z.string().max(255).optional().nullable(),
  emergencyPhone: z.string().max(20).optional().nullable(),
});

// Reemplazar la propagación directa del body
const validated = UpdateAthleteSchema.parse(body);
const updates = {
  ...(validated.name !== undefined && { name: validated.name }),
  ...(validated.dob !== undefined && { dob: validated.dob }),
  ...(validated.level !== undefined && { level: validated.level }),
  ...(validated.status !== undefined && { status: validated.status }),
  ...(validated.groupId !== undefined && { groupId: validated.groupId }),
  ...(validated.age !== undefined && { age: validated.age }),
  ...(validated.phone !== undefined && { phone: validated.phone }),
  ...(validated.address !== undefined && { address: validated.address }),
  ...(validated.notes !== undefined && { notes: validated.notes }),
  ...(validated.emergencyContact !== undefined && { emergencyContact: validated.emergencyContact }),
  ...(validated.emergencyPhone !== undefined && { emergencyPhone: validated.emergencyPhone }),
  updatedAt: new Date(),
};
```

**Step 3: Commit**
Run: git add src/app/api/athletes/\[athleteId\]/route.ts && git commit -m "fix(security): add Zod validation to PUT athletes endpoint"

---

### Task 2: Corregir rate limiting fallback

**Files:**
- Modify: `src/lib/rate-limit.ts`

**Step 1: Leer el archivo actual**
Run: Read `src/lib/rate-limit.ts`

**Step 2: Modificar el catch para fail-closed en producción**

```typescript
} catch (error) {
  console.error("Rate limit error:", error);

  // En producción, denegar requests si el sistema de rate limiting falla
  // para prevenir ataques DDoS cuando Redis no está disponible
  if (process.env.NODE_ENV === "production") {
    return {
      success: false,
      limit: 0,
      remaining: 0,
      reset: now + window,
    };
  }

  // Solo en desarrollo permitir fallback
  return {
    success: true,
    limit: 100,
    remaining: 100,
    reset: now + window,
  };
}
```

**Step 3: Commit**
Run: git add src/lib/rate-limit.ts && git commit -m "fix(security): implement fail-closed rate limiting in production"

---

### Task 3: Corregir JWT verificación en middleware

**Files:**
- Modify: `src/middleware.ts`

**Step 1: Leer el archivo actual**
Run: Read `src/middleware.ts`

**Step 2: Usar Supabase JWT verify en lugar de decodificación manual**

```typescript
import { createServerClient } from "@supabase/ssr";
import { type CookieOptions } from "supabase";

// En la función que decodifica JWT, reemplazar:
/* ANTES (inseguro):
const payload = JSON.parse(atob(token.split('.')[1]));
*/

/* DESPUÉS (seguro):
import { supabase } from "@/lib/supabase/server";
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) {
  return { error: "INVALID_TOKEN" };
}
*/
```

**Step 3: Commit**
Run: git add src/middleware.ts && git commit -m "fix(security): use Supabase JWT verification instead of manual decode"

---

### Task 4: Añadir .env* a .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Leer el archivo actual**
Run: Read `.gitignore`

**Step 2: Añadir patrones de env**
Añadir al final:
```
# Environment files
.env
.env.local
.env.development
.env.production
.env.vercel
!.env.example
```

**Step 3: Commit**
Run: git add .gitignore && git commit -m "fix(security): add env files to gitignore"

---

## Fase 2: HIGH - Frontend/UI

### Task 5: Crear componente unificado StatsCard

**Files:**
- Modify: `src/components/ui/stats-card.tsx`
- Delete: `src/components/dashboard/DashboardCard.tsx`
- Delete: `src/components/dashboard/BusinessStatsCard.tsx`
- Modify: Archivos que usen los componentes eliminados

**Step 1: Leer archivos existentes**
Run: Read `src/components/ui/stats-card.tsx`, `src/components/dashboard/DashboardCard.tsx`

**Step 2: Expandir stats-card.tsx para soportar variantes**

```typescript
// Añadir variantes adicionales a stats-card.tsx
const variantStyles = {
  default: "bg-card border-border",
  success: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950",
  warning: "bg-amber-50 border-amber-200 dark:bg-amber-950",
  danger: "bg-red-50 border-red-200 dark:bg-red-950",
  info: "bg-sky-50 border-sky-200 dark:bg-sky-950",
  purple: "bg-violet-50 border-violet-200 dark:bg-violet-950",
} as const;

const iconVariantStyles = {
  default: "text-foreground",
  success: "text-emerald-500",
  warning: "text-amber-500",
  danger: "text-red-500",
  info: "text-sky-500",
  purple: "text-violet-500",
} as const;
```

**Step 3: Actualizar imports en archivos que usen DashboardCard/BusinessStatsCard**
Run: Grep "DashboardCard" --files_with_matches

**Step 4: Commit**
Run: git add src/components/ui/stats-card.tsx && git commit -m "refactor: consolidate StatsCard variants, remove duplicates"

---

### Task 6: Extraer estilos de formulario a componente Input

**Files:**
- Modify: `src/components/ui/input.tsx`

**Step 1: Leer input.tsx actual**
Run: Read `src/components/ui/input.tsx`

**Step 2: Mejorar los estilos para que coincidan con el patrón usado**

```typescript
// Asegurar que los estilos son consistentes
const inputStyles = "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
```

**Step 3: Commit**
Run: git add src/components/ui/input.tsx && git commit -m "refactor: standardize input styles"

---

### Task 7: Añadir loading states (Suspense boundaries)

**Files:**
- Create: `src/app/dashboard/loading.tsx`
- Create: `src/app/dashboard/athletes/loading.tsx`
- Create: `src/app/dashboard/academies/loading.tsx`
- Create: `src/app/dashboard/coaches/loading.tsx`
- Create: `src/app/dashboard/events/loading.tsx`
- Create: `src/app/dashboard/calendar/loading.tsx`

**Step 1: Crear componente de loading skeleton**
Run: Write `src/components/ui/skeletons/DashboardSkeleton.tsx`

```typescript
"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
```

**Step 2: Crear cada loading.tsx**
Run: Write `src/app/dashboard/loading.tsx`

```typescript
import { DashboardSkeleton } from "@/components/ui/skeletons/DashboardSkeleton";

export default function Loading() {
  return <DashboardSkeleton />;
}
```

**Step 3: Commit**
Run: git add src/app/dashboard/loading.tsx src/app/dashboard/athletes/loading.tsx src/app/dashboard/academies/loading.tsx src/app/dashboard/coaches/loading.tsx src/app/dashboard/events/loading.tsx src/app/dashboard/calendar/loading.tsx && git commit -m "feat: add Suspense loading states to dashboard routes"

---

### Task 8: Añadir error boundaries

**Files:**
- Create: `src/app/dashboard/error.tsx`
- Create: `src/app/(super-admin)/super-admin/error.tsx`

**Step 1: Crear error boundary para dashboard**
Run: Write `src/app/dashboard/error.tsx`

```typescript
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex h-[450px] shrink-0 items-center justify-center rounded-md border border-dashed">
      <div className="flex flex-col items-center gap-4 text-center">
        <h3 className="text-2xl font-bold tracking-tight">Algo salió mal</h3>
        <p className="text-sm text-muted-foreground">
          {error.message || "Ha ocurrido un error inesperado."}
        </p>
        <Button onClick={reset}>Intentar de nuevo</Button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
Run: git add src/app/dashboard/error.tsx && git commit -m "feat: add error boundaries to dashboard routes"

---

### Task 9: Corregir prop drilling en CreateAthleteDialog

**Files:**
- Modify: `src/components/athletes/CreateAthleteDialog.tsx`

**Step 1: Leer el archivo**
Run: Read `src/components/athletes/CreateAthleteDialog.tsx`

**Step 2: Extraer hook para estado del formulario**

```typescript
// Crear nuevo hook
// src/hooks/use-athlete-form.ts

import { useState, useCallback } from "react";

interface AthleteFormState {
  name: string;
  dob: string;
  level: string;
  status: string;
  groupId: string;
  phone: string;
  address: string;
  notes: string;
  emergencyContact: string;
  emergencyPhone: string;
}

export function useAthleteForm() {
  const [formData, setFormData] = useState<AthleteFormState>({
    name: "",
    dob: "",
    level: "",
    status: "active",
    groupId: "",
    phone: "",
    address: "",
    notes: "",
    emergencyContact: "",
    emergencyPhone: "",
  });

  const updateField = useCallback((field: keyof AthleteFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      name: "",
      dob: "",
      level: "",
      status: "active",
      groupId: "",
      phone: "",
      address: "",
      notes: "",
      emergencyContact: "",
      emergencyPhone: "",
    });
  }, []);

  return { formData, updateField, resetForm };
}
```

**Step 3: Commit**
Run: git add src/hooks/use-athlete-form.ts && git commit -m "refactor: extract useAthleteForm hook to reduce prop drilling"

---

## Fase 3: HIGH - Backend/API

### Task 10: Implementar paginación a nivel DB

**Files:**
- Modify: `src/app/api/athletes/route.ts`
- Modify: `src/app/api/academies/route.ts`

**Step 1: Leer athletes/route.ts**
Run: Read `src/app/api/athletes/route.ts:296-322`

**Step 2: Cambiar paginación a nivel de base de datos**

```typescript
// ANTES (en memoria):
const rows = await db.select(...).from(athletes).where(whereClause).groupBy(...);
const paginatedItems = rows.slice(offset, offset + pageSize);

// DESPUÉS (en DB):
const rows = await db
  .select(...)
  .from(athletes)
  .where(whereClause)
  .groupBy(...)
  .orderBy(asc(athletes.name))
  .limit(pageSize)
  .offset(offset);

// Para obtener total, usar count:
const [{ count }] = await db
  .select({ count: count() })
  .from(athletes)
  .where(whereClause);
```

**Step 3: Commit**
Run: git add src/app/api/athletes/route.ts src/app/api/academies/route.ts && git commit -m "perf: implement database-level pagination instead of in-memory"

---

### Task 11: Habilitar ESLint y TypeScript en build

**Files:**
- Modify: `next.config.mjs`

**Step 1: Leer next.config.mjs**
Run: Read `next.config.mjs`

**Step 2: Habilitar ESLint y TypeScript**

```typescript
// ANTES:
eslint: {
  ignoreDuringBuilds: true,
},
typescript: {
  ignoreBuildErrors: true,
},

// DESPUÉS:
eslint: {
  ignoreDuringBuilds: false,
},
typescript: {
  ignoreBuildErrors: false,
},
```

**Step 3: Commit**
Run: git add next.config.mjs && git commit -m "fix: enable ESLint and TypeScript validation in production builds"

---

### Task 12: Validación UUID en rutas dinámicas

**Files:**
- Modify: `src/app/api/athletes/[athleteId]/route.ts`
- Modify: `src/app/api/classes/[classId]/route.ts`
- Modify: `src/app/api/discounts/[discountId]/route.ts`

**Step 1: Crear helper de validación UUID**
Run: Write `src/lib/validators.ts`

```typescript
import { z } from "zod";

export const uuidSchema = z.string().uuid("Invalid UUID format");

export function validateUuid(id: string): { valid: boolean; error?: string } {
  const result = uuidSchema.safeParse(id);
  if (!result.success) {
    return { valid: false, error: result.error.errors[0].message };
  }
  return { valid: true };
}
```

**Step 2: Añadir validación al inicio de cada ruta dinámica**

```typescript
import { validateUuid } from "@/lib/validators";

// En el handler:
const validation = validateUuid(athleteId);
if (!validation.valid) {
  return NextResponse.json({ error: validation.error }, { status: 400 });
}
```

**Step 3: Commit**
Run: git add src/lib/validators.ts src/app/api/athletes/\[athleteId\]/route.ts && git commit -m "feat: add UUID validation to dynamic API routes"

---

## Fase 4: MEDIUM - Mejoras de Accesibilidad

### Task 13: Corregir accesibilidad del Select

**Files:**
- Modify: `src/components/ui/select.tsx`

**Step 1: Leer select.tsx**
Run: Read `src/components/ui/select.tsx`

**Step 2: Añadir atributos ARIA**

```typescript
// Añadir aria-label y aria-describedby
<select
  className={...}
  value={value}
  onChange={(e) => onValueChange(e.target.value)}
  aria-label={props["aria-label"]}
  aria-describedby={props["aria-describedby"]}
  required={props.required}
  disabled={props.disabled}
>
  {children}
</select>
```

**Step 3: Commit**
Run: git add src/components/ui/select.tsx && git commit -m "fix: add ARIA attributes to Select component"

---

### Task 14: Corregir accesibilidad del Modal

**Files:**
- Modify: `src/components/ui/modal.tsx`

**Step 1: Leer modal.tsx**
Run: Read `src/components/ui/modal.tsx`

**Step 2: Añadir focus trap y aria**

```typescript
"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

// En el componente:
const modalRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!open) return;

  // Focus inicial
  modalRef.current?.focus();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
    }
    // TODO: Implementar focus trap
  };

  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}, [open, onClose]);

return (
  open && (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-background/80"
        onClick={onClose}
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? "modal-description" : undefined}
        className="relative z-50 w-full max-w-lg rounded-lg bg-background p-6 shadow-lg"
      >
        <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
        {description && (
          <p id="modal-description" className="text-sm text-muted-foreground mt-1">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  )
);
```

**Step 3: Commit**
Run: git add src/components/ui/modal.tsx && git commit -m "fix: add focus management and ARIA attributes to Modal"

---

### Task 15: Corregir accesibilidad del Sidebar

**Files:**
- Modify: `src/components/dashboard/Sidebar.tsx`

**Step 1: Leer Sidebar.tsx**
Run: Read `src/components/dashboard/Sidebar.tsx`

**Step 2: Añadir aria-label al botón de logout**

```typescript
// Cambiar:
<button onClick={handleLogout} title="Cerrar sesión">

// Por:
<button
  onClick={handleLogout}
  aria-label="Cerrar sesión"
  title="Cerrar sesión"
>
```

**Step 3: Commit**
Run: git add src/components/dashboard/Sidebar.tsx && git commit -m "fix: add aria-label to Sidebar logout button"

---

## Fase 5: MEDIUM - Limpieza y Mejoras

### Task 16: useEffect con cleanup

**Files:**
- Modify: `src/components/athletes/AthletesTableView.tsx`

**Step 1: Leer el archivo**
Run: Read `src/components/athletes/AthletesTableView.tsx`

**Step 2: Añadir AbortController al useEffect**

```typescript
useEffect(() => {
  const controller = new AbortController();

  const loadAttendanceAlerts = async () => {
    if (!academyId || athletes.length === 0) return;

    try {
      const response = await fetch(
        `/api/alerts/attendance?academyId=${academyId}`,
        { signal: controller.signal }
      );
      // ... manejo de respuesta
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Error loading attendance alerts:", error);
      }
    }
  };

  loadAttendanceAlerts();

  return () => controller.abort();
}, [academyId, athletes.length]);
```

**Step 3: Commit**
Run: git add src/components/athletes/AthletesTableView.tsx && git commit -m "fix: add AbortController to useEffect for proper cleanup"

---

### Task 17: Pool dummy con mejor manejo

**Files:**
- Modify: `src/db/index.ts`

**Step 1: Leer db/index.ts**
Run: Read `src/db/index.ts`

**Step 2: Mejorar el manejo de errores de conexión**

```typescript
// En el catch de inicialización:
} catch (error) {
  console.error("Database connection error:", error);

  if (process.env.NODE_ENV === "production") {
    throw new Error("Failed to initialize database connection. Please check configuration.");
  }

  // Solo en desarrollo crear pool dummy para evitar crash
  console.warn("Using dummy database connection for development");
  // ... resto del código dummy
}
```

**Step 3: Commit**
Run: git add src/db/index.ts && git commit -m "fix: improve database connection error handling"

---

### Task 18: Añadir rate limiting a contact-academy

**Files:**
- Modify: `src/app/actions/public/contact-academy.ts`

**Step 1: Leer el archivo**
Run: Read `src/app/actions/public/contact-academy.ts`

**Step 2: Añadir rate limiting y honeypot**

```typescript
import { rateLimit } from "@/lib/rate-limit";

const HoneypotSchema = z.object({
  website: z.string().optional(), // Campo honeypot - debe estar vacío
});

export async function contactAcademy(input: ContactAcademyInput) {
  // Verificar honeypot
  const honeypot = HoneypotSchema.parse(input);
  if (honeypot.website) {
    // Silenciosamente aceptar pero no hacer nada (detectar bots)
    return { success: true };
  }

  // Rate limiting
  const { success } = await rateLimit({
    prefix: "contact-academy",
    limit: 5,
    window: 60, // 5 requests por minuto
  });

  if (!success) {
    return { error: "RATE_LIMIT_EXCEEDED" };
  }

  // Resto del código...
}
```

**Step 3: Commit**
Run: git add src/app/actions/public/contact-academy.ts && git commit -m "feat: add rate limiting and honeypot to contact-academy action"

---

### Task 19: Índices compuestos para queries frecuentes

**Files:**
- Modify: `src/db/schema/attendance-records.ts`
- Modify: `src/db/schema/class-sessions.ts`

**Step 1: Leer archivos de schema**
Run: Read `src/db/schema/attendance-records.ts`, `src/db/schema/class-sessions.ts`

**Step 2: Añadir índices compuestos**

```typescript
// En attendance-records.ts
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    // ... campos existentes
  },
  (table) => {
    return {
      // Índices existentes...
      dateTenantIdx: index("attendance_date_tenant_idx").on(table.date, table.tenantId),
      studentSessionIdx: index("attendance_student_session_idx").on(table.studentId, table.sessionId),
    };
  }
);

// En class-sessions.ts
export const classSessions = pgTable(
  "class_sessions",
  {
    // ... campos existentes
  },
  (table) => {
    return {
      // Índices existentes...
      dateClassIdx: index("session_date_class_idx").on(table.date, table.classId),
    };
  }
);
```

**Step 3: Commit**
Run: git add src/db/schema/attendance-records.ts src/db/schema/class-sessions.ts && git commit -m "perf: add composite indexes for frequent queries"

---

## Fase 6: LOW - Mejoras Adicionales

### Task 20: Verificación de IP en webhooks

**Files:**
- Modify: `src/app/api/lemonsqueezy/webhook/route.ts`

**Step 1: Leer el archivo**
Run: Read `src/app/api/lemonsqueezy/webhook/route.ts`

**Step 2: Añadir verificación de IP**

```typescript
// IPs conocidas de Lemon Squeezy (verificar documentación actual)
const LEMON_SQUEEZY_IPS = [
  "13.239.157.155",
  "13.251.69.161",
  // ... actualizar con IPs oficiales
];

function verifySourceIP(ip: string): boolean {
  // En producción, verificar IP
  if (process.env.NODE_ENV === "production") {
    return LEMON_SQUEEZY_IPS.includes(ip);
  }
  return true; // En dev permitir todas
}
```

**Step 3: Commit**
Run: git add src/app/api/lemonsqueezy/webhook/route.ts && git commit -m "feat: add IP verification to Lemon Squeezy webhook"

---

### Task 21: API Versioning (preparación)

**Files:**
- Create: `src/app/api/v1/academies/route.ts` (ejemplo)
- Modify: `src/app/api/academies/route.ts` (redirigir a v1)

**Step 1: Crear redirect en rutas existentes**
En cada ruta API, añadir headers de deprecated:

```typescript
// En headers de respuesta:
export async function GET(request: Request) {
  // ...
  return NextResponse.json(data, {
    headers: {
      // Indicar que esta versión será deprecated
      "Deprecation": "Thu, 01 Jan 2026 00:00:00 GMT",
      "Link": '</api/v1/academies>; rel="alternate"',
    },
  });
}
```

**Step 2: Commit**
Run: git commit -m "feat: add deprecation headers to API routes for future versioning"

---

### Task 22: Audit logging para acciones admin

**Files:**
- Create: `src/lib/audit-log.ts`
- Modify: `src/app/api/admin/users/route.ts` (ejemplo)

**Step 1: Crear utilidad de audit log**
Run: Write `src/lib/audit-log.ts`

```typescript
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { eq } from "drizzle-orm";

export type AuditAction =
  | "user.create"
  | "user.update"
  | "user.delete"
  | "academy.create"
  | "academy.update"
  | "academy.delete"
  | "athlete.update"
  | "athlete.delete";

export async function createAuditLog(params: {
  tenantId: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    tenantId: params.tenantId,
    userId: params.userId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata: params.metadata,
    createdAt: new Date(),
  });
}
```

**Step 2: Commit**
Run: git add src/lib/audit-log.ts && git commit -m "feat: add audit logging utility for admin actions"

---

## Resumen de Commits

Al final de todas las tareas, ejecutar:

```bash
# Verificar estado
git status

# Si todo está bien, hacer commit final o commits individuales según sea necesario
```

---

## Orden de Ejecución Sugerido

1. **Fase 1 (Tasks 1-4):** Seguridad crítica - hacer primero
2. **Fase 2 (Tasks 5-9):** Frontend/UI - hacer segundo
3. **Fase 3 (Tasks 10-12):** Backend/API - hacer tercero
4. **Fase 4 (Tasks 13-15):** Accesibilidad - hacer cuarto
5. **Fase 5 (Tasks 16-19):** Limpieza - hacer quinto
6. **Fase 6 (Tasks 20-22):** Mejoras adicionales - hacer último
