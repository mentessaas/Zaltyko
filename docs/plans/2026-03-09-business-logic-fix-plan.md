# Auditoría de Lógica de Negocio - Plan de Implementación

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar tarea por tarea.

**Goal:** Implementar todas las mejoras de la auditoría de lógica de negocio del SaaS.

**Tech Stack:** Next.js 14, Drizzle ORM, Supabase, TypeScript

---

## Fase 1: Alta Prioridad

### Task 1: Corregir inconsistencia de tenantId en profiles

**Files:**
- Modify: `src/db/schema/profiles.ts`

**Step 1: Leer schema actual**
Run: Read `src/db/schema/profiles.ts`

**Step 2: Hacer tenantId no nullable**
```typescript
// Cambiar:
tenantId: uuid("tenant_id")

// Por:
tenantId: uuid("tenant_id").notNull()
```

**Step 3: Commit**
Run: git add src/db/schema/profiles.ts && git commit -m "fix: make tenantId required in profiles schema"

---

### Task 2: Añadir validación de capacidad en clases

**Files:**
- Modify: `src/app/api/class-enrollments/route.ts`

**Step 1: Leer archivo**
Run: Read `src/app/api/class-enrollments/route.ts`

**Step 2: Añadir validación de capacidad antes de inscribir**
```typescript
// Añadir al POST:
const [classSession] = await db
  .select({ capacity: classSessions.capacity })
  .from(classSessions)
  .where(eq(classSessions.id, classId))
  .limit(1);

if (classSession) {
  // Contar inscripciones actuales
  const [{ count }] = await db
    .select({ count: count() })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, classId));

  if (count >= classSession.capacity) {
    return NextResponse.json({ error: "CLASS_FULL" }, { status: 400 });
  }
}
```

**Step 3: Commit**
Run: git add src/app/api/class-enrollments/route.ts && git commit -m "feat: validate class capacity before enrollment"

---

### Task 3: Consolidar groupId en athletes

**Files:**
- Modify: `src/app/api/athletes/route.ts`
- Modify: `src/db/schema/athletes.ts`

**Step 1: Leer schema**
Run: Read `src/db/schema/athletes.ts`

**Step 2: Marcar groupId como deprecated (comentario)**
```typescript
// Añadir comentario:
/**
 * @deprecated Usar groupAthletes en su lugar para la pertenencia a grupos
 */
groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
```

**Step 3: Commit**
Run: git add src/db/schema/athletes.ts && git commit -m "refactor: mark athletes.groupId as deprecated, use groupAthletes instead"

---

## Fase 2: Media Priorencia

### Task 4: Eliminar campos duplicados en eventos

**Files:**
- Modify: `src/db/schema/events.ts`

**Step 1: Leer schema**
Run: Read `src/db/schema/events.ts`

**Step 2: Comentar campos duplicados**
```typescript
// Comentar estos campos (ya migrados a countryCode, etc):
// country: varchar("country"),
// province: varchar("province"),
// city: varchar("city"),
```

**Step 3: Commit**
Run: git add src/db/schema/events.ts && git commit -m "refactor: remove duplicate location fields in events schema"

---

### Task 5: Añadir sistema de soft deletes

**Files:**
- Modify: `src/db/schema/athletes.ts`
- Modify: `src/db/schema/classes.ts`
- Modify: `src/db/schema/groups.ts`

**Step 1: Añadir deletedAt a athletes**
```typescript
// En athletes.ts:
deletedAt: timestamp("deleted_at"),
```

**Step 2: Commit**
Run: git add src/db/schema/athletes.ts && git commit -m "feat: add soft delete support to athletes"

---

### Task 6: Añadir función de verificación de capacidad

**Files:**
- Create: `src/lib/classes/class-utils.ts`

**Step 1: Crear utilidad**
```typescript
import { db } from "@/db";
import { classSessions, attendanceRecords } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export async function checkClassCapacity(sessionId: string): Promise<{
  current: number;
  capacity: number;
  available: number;
}> {
  const [session] = await db
    .select({ capacity: classSessions.capacity })
    .from(classSessions)
    .where(eq(classSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error("Session not found");
  }

  const [{ current }] = await db
    .select({ count: count() })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, sessionId));

  return {
    current,
    capacity: session.capacity,
    available: Math.max(0, session.capacity - current),
  };
}
```

**Step 2: Commit**
Run: git add src/lib/classes/class-utils.ts && git commit -m "feat: add class capacity check utility"

---

### Task 7: Mejorar mensajes de error con códigos consistentes

**Files:**
- Modify: `src/lib/constants.ts`

**Step 1: Añadir códigos de error adicionales**
```typescript
export const API_ERROR_CODES = {
  // Autenticación
  UNAUTHORIZED: "UNAUTHORIZED",
  SESSION_EXPIRED: "SESSION_EXPIRED",

  // Recursos
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CLASS_FULL: "CLASS_FULL",
  INVALID_GROUP: "INVALID_GROUP",

  // Facturación
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PLAN_LIMIT_EXCEEDED: "PLAN_LIMIT_EXCEEDED",

  // Validación
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
} as const;
```

**Step 2: Commit**
Run: git add src/lib/constants.ts && git commit -m "feat: add API error codes constant"

---

### Task 8: Añadir índice para queries de notificaciones

**Files:**
- Modify: `src/db/schema/notifications.ts`

**Step 1: Leer schema**
Run: Read `src/db/schema/notifications.ts`

**Step 2: Añadir índice compuesto**
```typescript
// En el index:
userReadCreatedIdx: index("notifications_user_read_created_idx").on(
  table.userId,
  table.read,
  table.createdAt
),
```

**Step 3: Commit**
Run: git add src/db/schema/notifications.ts && git commit -m "perf: add composite index for notification queries"

---

### Task 9: Documentar relaciones en schema

**Files:**
- Modify: `src/db/schema/index.ts`

**Step 1: Añadir comentarios de relaciones**
```typescript
/**
 * Esquemas de Base de Datos - Zaltyko
 *
 * Relaciones principales:
 * - profiles -> memberships -> academies
 * - athletes -> groups (via groupAthletes)
 * - classes -> classSessions -> attendanceRecords
 * - academies -> charges -> billingItems
 */
```

**Step 2: Commit**
Run: git add src/db/schema/index.ts && git commit -m "docs: add relationship documentation to schema index"

---

### Task 10: Añadir validación de horario para coaches

**Files:**
- Create: `src/lib/scheduling/coach-availability.ts`

**Step 1: Crear utilidad**
```typescript
import { db } from "@/db";
import { classSessions, classCoachAssignments } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export async function checkCoachAvailability(
  coachId: string,
  date: Date,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Buscar sesiones del coach en esa fecha
  const existingSessions = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .innerJoin(classCoachAssignments, eq(classSessions.id, classCoachAssignments.sessionId))
    .where(
      and(
        eq(classCoachAssignments.coachId, coachId),
        gte(classSessions.date, dayStart),
        lte(classSessions.date, dayEnd)
      )
    );

  // Verificar conflicto de horario
  for (const session of existingSessions) {
    if (session.startTime < endTime && session.endTime > startTime) {
      return false; // Conflicto
    }
  }

  return true;
}
```

**Step 2: Commit**
Run: git add src/lib/scheduling/coach-availability.ts && git commit -m "feat: add coach availability check utility"

---

## Resumen de Ejecución

Ejecutar tareas en orden:
1. Task 1: tenantId en profiles
2. Task 2: Validación de capacidad
3. Task 3: Deprecate groupId
4. Task 4: Campos duplicados eventos
5. Task 5: Soft deletes
6. Task 6: Función capacidad
7. Task 7: Códigos de error
8. Task 8: Índice notificaciones
9. Task 9: Documentación schema
10. Task 10: Disponibilidad coaches
