# Lib - Utilidades y Servicios

Este directorio contiene las utilidades y servicios del proyecto.

## Estructura

```
lib/
├── authz.ts          # Autorización y permisos
├── constants.ts      # Constantes del proyecto
├── db.ts             # Conexión a base de datos
├── env.ts            # Validación de variables de entorno
├── logger.ts         # Sistema de logging
├── rate-limit.ts     # Rate limiting con Redis
├── validators.ts      # Validadores UUID y otros
├── audit-log.ts      # Logging de auditoría
├── date-utils.ts     # Utilidades de fechas
├── supabase/        # Clientes de Supabase
├── billing/         # Servicios de facturación
├── notifications/    # Servicios de notificaciones
├── reports/         # Generación de reportes
└── search/         # Búsqueda global
```

## Uso

### Validaciones
```typescript
import { validateUuid } from "@/lib/validators";

const result = validateUuid("uuid-aqui");
if (!result.valid) {
  return { error: result.error };
}
```

### Rate Limiting
```typescript
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const result = await rateLimit({
  identifier: "user:123",
  limit: RATE_LIMITS.AUTHENTICATED.limit,
  window: RATE_LIMITS.AUTHENTICATED.window,
});
```

### Constantes
```typescript
import { ATHLETE_STATUS, USER_ROLES, ERROR_MESSAGES } from "@/lib/constants";
```

## Notas

- Todas las utilidades están tipadas con TypeScript
- Usar las constantes en lugar de valores hardcodeados
- Validar inputs con Zod antes de usar
