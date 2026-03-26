# Estándares de Tipos TypeScript - Zaltyko

## Estado Actual

### Archivos de Tipos Existentes

- `src/types/index.ts` - Tipos principales (UserRole, AcademyStatus, AthleteStatus, etc.)
- `src/types/billing.ts` - Tipos de facturación
- `src/types/events.ts` - Tipos de eventos
- `src/types/event-form.ts` - Tipos de formulario de eventos
- `src/types/athlete-edit.ts` - Tipos de edición de atletas
- `src/types/onboarding.ts` - Tipos de onboarding
- `src/types/config.ts` - Configuraciones

### Problemas Identificados

#### 1. Tipos Duplicados o Inconsistentes

| Tipo | Ubicación Actual | Problema |
|------|------------------|----------|
| `AthleteStatus` | Re-exportado desde `lib/athletes/constants` | Definido en dos lugares, debería estar solo en types |
| `Group` | No existe en types | Schema tiene `groups` pero no hay tipo TypeScript |
| `Coach` | No existe en types | Schema tiene `coaches` pero no hay tipo TypeScript |
| `Class` | No existe en types | Schema tiene `classes` pero no hay tipo TypeScript |
| `Academy` | Parcialmente definido | Solo `AcademyConfig`, falta `Academy` completo |

#### 2. Tipos que Faltan (basado en schema DB)

```
Tablas del schema sin tipos correspondientes:
- academies
- athletes
- classes
- groups (parcial)
- coaches
- class-sessions
- class-enrollments
- attendance-records
- guardians
- profiles
- subscriptions
- billing-invoices
- billing-items
- charges
- discounts
- scholarships
- notifications
- support-tickets
- events
- invitations
```

#### 3. Usos de `any` (195 ocurrencias en 137 archivos)

**Patrones comunes encontrados:**

1. **Catch errors** (~80% de los casos)
   ```typescript
   } catch (err: any) {
   ```
   → Debería usar `unknown` o `Error`

2. **Datos de API response**
   ```typescript
   data: any;
   ```
   → Debería usar genéricos `ApiResponse<T>`

3. **Props de componentes**
   ```typescript
   props: any
   ```
   → Debería definir interfaz específica

4. **State management**
   ```typescript
   const [data, setData] = useState<any>([])
   ```
   → Debería tener tipo específico

---

## Recomendaciones

### Prioridad Alta

#### 1. Crear tipos base del schema

Generar tipos TypeScript desde el schema de Drizzle para las entidades principales:

```typescript
// src/types/database.ts
export type Athlete = typeof athletes.$inferSelect;
export type AthleteInsert = typeof athletes.$inferInsert;
export type Coach = typeof coaches.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Class = typeof classes.$inferSelect;
export type Academy = typeof academies.$inferSelect;
```

#### 2. Eliminar usos de `any` en errores

Cambiar:
```typescript
} catch (err: any) {
```

Por:
```typescript
} catch (err: unknown) {
  // luego validar tipo
  if (err instanceof Error) { ... }
```

#### 3. Consolidar AthleteStatus

Mover la definición de `AthleteStatus` a `src/types/index.ts` y eliminar el import desde constants.

### Prioridad Media

#### 4. Crear tipos para componentes UI

Definir tipos para props de componentes reutilizables:

```typescript
// src/types/components.ts
export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  pagination?: PaginationConfig;
}

export interface FilterBarProps {
  filters: BaseFilters;
  onFilterChange: (filters: BaseFilters) => void;
}
```

#### 5. Tipos para API routes

Los API routes deberían usar tipos genéricos consistentemente:

```typescript
// En lugar de:
export async function GET(request: Request) {
  const data = await db.query(...);
  return Response.json(data);
}

// Usar:
type GetAthletesResponse = PaginatedResponse<AthleteListItem>;
export async function GET() {
  // ...
  return Response.json({ success: true, data: response } as ApiResponse<GetAthletesResponse>);
}
```

#### 6. Tipos para estados de formulario

```typescript
// src/types/forms.ts
export interface FormState<T> {
  data: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isDirty: boolean;
}
```

### Prioridad Baja

#### 7. Utilidad de tipos

Crear utility types para casos comunes:

```typescript
// src/types/utils.ts
export type Nullable<T> = T | null;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };
```

#### 8. Tipos para eventos y callbacks

```typescript
// src/types/events.ts
export type EventCallback<T> = (data: T) => void;
export type AsyncEventCallback<T> = (data: T) => Promise<void>;
```

---

## Plan de Implementación Sugerido

### Fase 1: Fundamentos
1. Crear `src/types/database.ts` con tipos inferidos del schema
2. Mover `AthleteStatus` a `src/types/index.ts`
3. Crear `src/types/components.ts`

### Fase 2: Limpieza de `any`
1. Reemplazar `catch (err: any)` por `catch (err: unknown)`
2. Agregar tipos a estados de React useState
3. Tipar respuestas de API

### Fase 3: Mejoras avanzadas
1. Utility types
2. Tipos para formularios
3. Validación con Zod

---

## Archivos a Modificar

| Acción | Archivo |
|--------|--------|
| Crear | `src/types/database.ts` |
| Crear | `src/types/components.ts` |
| Crear | `src/types/utils.ts` |
| Modificar | `src/types/index.ts` - consolidar AthleteStatus |
| Modificar | Componentes con `any` -逐 uno替换 |
| Eliminar | Imports redundantes de `lib/athletes/constants` |

---

## Notas

- Los tipos generados desde Drizzle con `$inferSelect` son seguros pero pueden incluir campos innecesarios
- Considerar crear tipos "vista" más específicos para UI (ej: `AthleteListItem` ya existe)
- Los 195 usos de `any` son principalmente en catch blocks, lo cual es el uso más seguro pero aún así mejorable
