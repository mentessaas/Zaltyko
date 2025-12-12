# Guía de Migración: console.log → logger

Esta guía explica cómo migrar de `console.log` a nuestro sistema de logging estructurado con integración de Sentry.

## ¿Por qué migrar?

1. **Logging estructurado**: Los logs tienen formato consistente con timestamps y contexto
2. **Error tracking**: Los errores se envían automáticamente a Sentry en producción
3. **Niveles de log**: Diferentes niveles (debug, info, warn, error) para mejor organización
4. **Contexto**: Puedes agregar contexto adicional a cada log
5. **Producción-ready**: Los logs se filtran y optimizan para producción

## Sistema de Logger

El logger está en `src/lib/logger.ts` y tiene los siguientes métodos:

- `logger.debug(message, context?)` - Solo en desarrollo
- `logger.info(message, context?)` - Información general
- `logger.warn(message, context?)` - Advertencias (se envían a Sentry en producción)
- `logger.error(message, error?, context?)` - Errores (se envían a Sentry en producción)
- `logger.apiError(endpoint, method, error, context?)` - Errores de API
- `logger.dbOperation(operation, table, duration?, context?)` - Operaciones de DB
- `logger.externalService(service, operation, success, duration?, error?, context?)` - Servicios externos

## Mapeo de Migración

| Console Original | Logger Nuevo | Notas |
|-----------------|--------------|-------|
| `console.log(...)` | `logger.info(...)` | Información general |
| `console.error(...)` | `logger.error(...)` | Errores (se envían a Sentry) |
| `console.warn(...)` | `logger.warn(...)` | Advertencias (se envían a Sentry) |
| `console.debug(...)` | `logger.debug(...)` | Solo en desarrollo |

## Ejemplos de Migración

### Ejemplo 1: Log simple

**Antes:**
```typescript
console.log("User logged in");
```

**Después:**
```typescript
logger.info("User logged in");
```

### Ejemplo 2: Log con contexto

**Antes:**
```typescript
console.log("User logged in", { userId: user.id, email: user.email });
```

**Después:**
```typescript
logger.info("User logged in", { userId: user.id, email: user.email });
```

### Ejemplo 3: Error con contexto

**Antes:**
```typescript
console.error("Error fetching user:", error);
```

**Después:**
```typescript
logger.error("Error fetching user", error, { userId });
```

### Ejemplo 4: Error de API

**Antes:**
```typescript
try {
  // ...
} catch (error) {
  console.error("API Error:", error);
}
```

**Después:**
```typescript
import { logger } from "@/lib/logger";

try {
  // ...
} catch (error) {
  logger.apiError("/api/users", "GET", error, { userId });
}
```

## Script de Migración Automática

Hemos creado un script para ayudar con la migración:

```bash
# Ver qué archivos se modificarían (dry-run)
pnpm tsx scripts/migrate-console-to-logger.ts --dry-run

# Migrar todos los archivos
pnpm tsx scripts/migrate-console-to-logger.ts

# Migrar un archivo específico
pnpm tsx scripts/migrate-console-to-logger.ts --file src/app/api/users/route.ts
```

## Proceso de Migración Gradual

### Fase 1: Archivos Críticos (Completado ✅)
- [x] API routes (`src/app/api/**`)
- [x] Error boundaries (`src/app/error.tsx`)
- [x] Cron jobs (`src/app/api/cron/**`)

### Fase 2: Componentes del Servidor
- [ ] Server components (`src/app/**/page.tsx`)
- [ ] Server actions (`src/app/actions/**`)
- [ ] Layouts (`src/app/**/layout.tsx`)

### Fase 3: Componentes del Cliente
- [ ] Client components (`src/components/**`)
- [ ] Hooks (`src/hooks/**`)
- [ ] Utilities (`src/lib/**`)

### Fase 4: Limpieza Final
- [ ] Verificar que no queden `console.log` en producción
- [ ] Agregar ESLint rule para prevenir nuevos `console.log`

## Reglas de ESLint

Para prevenir nuevos `console.log`, agrega esta regla a `.eslintrc.json`:

```json
{
  "rules": {
    "no-console": ["warn", { 
      "allow": ["warn", "error"] 
    }]
  }
}
```

## Buenas Prácticas

### ✅ Hacer

```typescript
// Agregar contexto útil
logger.error("Failed to create user", error, { 
  email: userData.email,
  tenantId,
  academyId 
});

// Usar niveles apropiados
logger.debug("Cache hit", { key });
logger.info("User created", { userId });
logger.warn("Rate limit approaching", { userId, requests: 95 });
logger.error("Database connection failed", error, { host });
```

### ❌ Evitar

```typescript
// No usar console.log en producción
console.log("Debug info"); // ❌

// No exponer información sensible
logger.info("User logged in", { password: user.password }); // ❌

// No usar console.error sin logger
console.error("Error:", error); // ❌
```

## Verificación

Después de migrar, verifica:

1. **Build pasa**: `pnpm build`
2. **No hay errores**: Revisa logs de build
3. **Funciona en desarrollo**: Los logs aparecen en consola
4. **Funciona en producción**: Los errores se envían a Sentry

## Recursos

- [Documentación del Logger](./src/lib/logger.ts)
- [Documentación de Sentry](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Script de Migración](./scripts/migrate-console-to-logger.ts)

