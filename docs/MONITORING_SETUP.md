# Configuración de Monitoreo y Observabilidad

Esta guía explica cómo configurar Sentry para error tracking y Vercel Analytics para métricas de performance.

## 🎯 Sentry - Error Tracking

Sentry está integrado para capturar y rastrear errores en producción.

### Configuración Inicial

1. **Crear cuenta en Sentry**
   - Ve a [sentry.io](https://sentry.io) y crea una cuenta
   - Crea un nuevo proyecto para Next.js

2. **Obtener DSN**
   - En el dashboard de Sentry, ve a **Settings** → **Projects** → Tu proyecto
   - Copia el **DSN** (Data Source Name)

3. **Configurar Variables de Entorno**

Agrega en Vercel Environment Variables:

```env
# DSN público (puede estar en el cliente)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# DSN privado (solo servidor, opcional)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Para source maps (opcional pero recomendado)
SENTRY_ORG=your-org-name
SENTRY_PROJECT=zaltyko
SENTRY_AUTH_TOKEN=your-auth-token
```

### Obtener Auth Token

1. Ve a [Sentry Account Settings](https://sentry.io/settings/account/api/auth-tokens/)
2. Crea un nuevo token con permisos:
   - `project:read`
   - `project:releases`
   - `org:read`
3. Copia el token y agrégalo como `SENTRY_AUTH_TOKEN`

### Archivos de Configuración

Los archivos de configuración ya están creados:

- `sentry.client.config.ts` - Configuración para el cliente (browser)
- `sentry.server.config.ts` - Configuración para el servidor (Node.js)
- `sentry.edge.config.ts` - Configuración para edge functions

### Integración con Logger

El logger está integrado con Sentry. Los errores se envían automáticamente:

```typescript
import { logger } from "@/lib/logger";

// Esto se enviará a Sentry en producción
logger.error("Error message", error, { context: "value" });
```

### Verificación

1. **En desarrollo**: Los errores NO se envían a Sentry (configurado en `beforeSend`)
2. **En producción**: Los errores se envían automáticamente
3. **Verifica en Sentry Dashboard**: Deberías ver errores después de que ocurran

## 📊 Vercel Analytics

Vercel Analytics está configurado para métricas de performance.

### Configuración

Ya está integrado en `src/app/layout.tsx`:

```typescript
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
```

### Métricas Disponibles

- **Web Vitals**: Core Web Vitals (LCP, FID, CLS, etc.)
- **Performance**: Tiempo de carga, TTFB, etc.
- **Speed Insights**: Análisis de velocidad de página

### Acceso a Métricas

1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com/dashboard)
2. Navega a **Analytics** → **Web Vitals**
3. Verás métricas en tiempo real

### Deshabilitar Analytics

Si necesitas deshabilitar analytics temporalmente:

```env
NEXT_PUBLIC_DISABLE_ANALYTICS=true
```

## 🔍 Logger Mejorado

El logger ahora incluye:

### Integración con Sentry

- Errores (`logger.error`) se envían a Sentry automáticamente
- Warnings (`logger.warn`) se envían a Sentry en producción
- Info y debug NO se envían (para evitar ruido)

### Métodos Disponibles

```typescript
// Logging básico
logger.debug("Debug message", { context });
logger.info("Info message", { context });
logger.warn("Warning message", { context });
logger.error("Error message", error, { context });

// Logging especializado
logger.apiError("/api/users", "GET", error, { userId });
logger.dbOperation("SELECT", "users", 150, { userId });
logger.externalService("Stripe", "createCustomer", true, 200, undefined, { userId });
```

## 📈 Métricas y Alertas

### Configurar Alertas en Sentry

1. Ve a **Alerts** en Sentry Dashboard
2. Crea alertas para:
   - Errores críticos (nivel: error)
   - Errores frecuentes (más de X en Y minutos)
   - Nuevos errores

### Configurar Alertas en Vercel

1. Ve a **Settings** → **Notifications** en Vercel
2. Configura alertas para:
   - Build failures
   - Deployment failures
   - Function errors

## 🛠️ Troubleshooting

### Sentry no captura errores

1. Verifica que `NEXT_PUBLIC_SENTRY_DSN` esté configurado
2. Verifica que estés en producción (`NODE_ENV=production`)
3. Revisa la consola del navegador para errores de Sentry
4. Verifica que `beforeSend` no esté filtrando el error

### Vercel Analytics no muestra datos

1. Verifica que el proyecto esté desplegado en Vercel
2. Espera unos minutos después del deploy
3. Verifica que no esté deshabilitado con `NEXT_PUBLIC_DISABLE_ANALYTICS`

### Logger no funciona

1. Verifica que el import sea correcto: `import { logger } from "@/lib/logger"`
2. Verifica que no haya errores de TypeScript
3. Revisa la consola para ver los logs

## 📚 Recursos

- [Documentación de Sentry](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Documentación de Vercel Analytics](https://vercel.com/docs/analytics)
- [Documentación del Logger](./MIGRATION_CONSOLE_TO_LOGGER.md)

