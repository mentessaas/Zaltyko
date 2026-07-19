# Sparklines de KPIs del Dashboard

Mini-gráficos de tendencia embebidos en las tarjetas KPI del dashboard de academia
(Atletas, Entrenadores, Grupos, Asistencia). Muestran cómo ha evolucionado cada
métrica en los últimos días.

## Principio clave: datos reales, no inventados

Las series **no se fabrican**. Cada punto se deriva de timestamps que ya existen
en la base de datos. No se añadió ninguna tabla nueva ni ningún proceso programado
(cron): el histórico se calcula bajo demanda a partir de los datos existentes.

| KPI | Cómo se calcula cada punto del día |
|-----|------------------------------------|
| **Atletas** | Conteo acumulado de atletas vigentes: `createdAt <= día` y no eliminados a esa fecha (`deletedAt` nulo o posterior). |
| **Entrenadores** | Conteo acumulado de altas (`createdAt <= día`). La tabla `coaches` no tiene `deletedAt`. |
| **Grupos** | Conteo acumulado de grupos vigentes (igual que atletas, usando `groups.deletedAt`). |
| **Asistencia** | % real por día: registros `present` / total de `attendance_records`, unidos a `class_sessions` por fecha de sesión. `0` si ese día no hubo registros. |

Por defecto la ventana es de **14 días** (configurable vía query param `days`, entre 2 y 90).

## Arquitectura

```
KPISection (cliente)
  └─ fetch GET /api/dashboard/kpi-trends?academyId=…&days=14
        └─ withTenant  →  getKpiTrends(academyId, tenantId, days)
              └─ consultas a athletes / coaches / groups / attendance_records
        ↩ { ok: true, data: { athletes:[], coaches:[], groups:[], attendance:[] } }
  └─ pasa cada serie a DashboardCard.trendData
        └─ <Sparkline data={…} color={hexDeMarca} />  (recharts AreaChart)
```

### Ficheros

| Fichero | Rol |
|---------|-----|
| [`src/lib/dashboard/kpi-trends.ts`](../src/lib/dashboard/kpi-trends.ts) | Lógica de cálculo del histórico. Exporta `getKpiTrends()`, el tipo `KpiTrends` y `EMPTY_TRENDS`. |
| [`src/app/api/dashboard/kpi-trends/route.ts`](../src/app/api/dashboard/kpi-trends/route.ts) | Endpoint `GET` protegido con `withTenant`. Valida con Zod y responde con `apiSuccess`. |
| [`src/components/dashboard/Sparkline.tsx`](../src/components/dashboard/Sparkline.tsx) | Componente de presentación (recharts `AreaChart` sin ejes ni tooltip). |
| [`src/components/dashboard/DashboardCard.tsx`](../src/components/dashboard/DashboardCard.tsx) | Acepta `trendData?: number[]` y renderiza el sparkline con el color del acento. |
| [`src/components/dashboard/KPISection.tsx`](../src/components/dashboard/KPISection.tsx) | Pide las series al endpoint (cliente) y las reparte a cada tarjeta. |

## API

### `GET /api/dashboard/kpi-trends`

Query params:

| Param | Tipo | Requerido | Notas |
|-------|------|-----------|-------|
| `academyId` | UUID | sí | Academia a consultar. |
| `days` | entero 2–90 | no | Tamaño de la ventana. Por defecto `14`. |

Respuesta `200` (envoltura estándar `apiSuccess`):

```json
{
  "ok": true,
  "data": {
    "athletes":   [38, 38, 39, 40, 40, 41, 42, ...],
    "coaches":    [5, 5, 5, 6, 6, 6, 6, ...],
    "groups":     [8, 8, 8, 8, 9, 9, 9, ...],
    "attendance": [0, 92, 88, 0, 95, 90, 100, ...]
  }
}
```

Cada array tiene `days` elementos en orden cronológico (más antiguo primero, hoy al final).

Errores: `400 TENANT_REQUIRED` (sin tenant), `400 INVALID_PARAMS` (params inválidos).
Ante un error interno, devuelve `200` con series vacías para no romper el dashboard.

## Seguridad (multi-tenant)

- El endpoint usa `withTenant`, igual que el resto de la API del proyecto.
- `getKpiTrends` filtra por `academyId` **y** por `tenantId` (defensa en profundidad):
  un usuario no puede leer series de una academia de otro tenant.

## Rendimiento

- `getKpiTrends` ejecuta 4 consultas en paralelo (`Promise.all`).
- Atletas/entrenadores/grupos: se traen los timestamps y el acumulado por día se
  computa en memoria (volumen típico de una academia: decenas/cientos de filas).
- Asistencia: se agrupa por día en memoria sobre la ventana acotada (14 días).
- Las series se cargan en el cliente tras el render inicial; si el fetch falla, las
  tarjetas se muestran sin gráfico (degradación elegante, sin bloquear el dashboard).

## Detalles de diseño visual

- El color del trazo se alinea al acento de cada tarjeta: Atletas/Asistencia teal
  (`#00796B`), Entrenadores indigo (`#2B2E83`), Grupos coral (`#FF6B57`).
- El sparkline no renderiza si hay menos de 2 puntos.
- Sin animación (`isAnimationActive={false}`) para evitar parpadeos al recargar.

## Verificación manual

1. `pnpm dev` y entrar a `/app/<academyId>/dashboard` con un usuario owner/admin.
2. Las 4 tarjetas KPI deben mostrar una curva de tendencia bajo el subtítulo.
3. Probar el endpoint directamente (autenticado):
   `GET /api/dashboard/kpi-trends?academyId=<uuid>&days=14`.
4. En una academia recién creada con pocos datos, las curvas serán planas o la de
   asistencia mayormente en 0 — es el comportamiento correcto (refleja datos reales).
