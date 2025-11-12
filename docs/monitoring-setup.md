# Integración de Monitoring

Esta guía describe cómo integrar servicios de monitoring y error tracking en GymnaSaaS.

## Sentry (Error Tracking)

### Instalación

```bash
pnpm add @sentry/nextjs
```

### Configuración

1. Crea `sentry.client.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  beforeSend(event, hint) {
    // Filtrar errores en desarrollo
    if (process.env.NODE_ENV === "development") {
      return null;
    }
    return event;
  },
});
```

2. Crea `sentry.server.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

3. Crea `sentry.edge.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

4. Actualiza `next.config.js`:

```javascript
const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  {
    // Tu configuración de Next.js
  },
  {
    silent: true,
    org: "tu-org",
    project: "tu-proyecto",
  }
);
```

5. Envuelve tu app en `sentry.server.config.ts`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // ...
});
```

### Variables de Entorno

```
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ORG=tu-org
SENTRY_PROJECT=tu-proyecto
```

### Uso en Código

```typescript
import * as Sentry from "@sentry/nextjs";

try {
  // código que puede fallar
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      section: "api",
      endpoint: "/api/users",
    },
    extra: {
      userId: context.userId,
    },
  });
  throw error;
}
```

## LogRocket (Session Replay)

### Instalación

```bash
pnpm add logrocket
```

### Configuración

Crea `src/lib/logrocket.ts`:

```typescript
import LogRocket from "logrocket";

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_LOGROCKET_APP_ID) {
  LogRocket.init(process.env.NEXT_PUBLIC_LOGROCKET_APP_ID, {
    shouldCaptureConsole: true,
    shouldCaptureNetwork: true,
    shouldCaptureExceptions: true,
  });
}

export default LogRocket;
```

Importa en `src/app/layout.tsx`:

```typescript
import "@/lib/logrocket";
```

### Variables de Entorno

```
NEXT_PUBLIC_LOGROCKET_APP_ID=tu-app-id
```

## Vercel Analytics

### Instalación

```bash
pnpm add @vercel/analytics
```

### Configuración

En `src/app/layout.tsx`:

```typescript
import { Analytics } from "@vercel/analytics/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

## Supabase Logs

### Dashboard de Logs

Supabase proporciona logs integrados:

1. Ve a Supabase Dashboard → Logs
2. Selecciona el servicio (API, Auth, Storage, etc.)
3. Filtra por nivel, tiempo, etc.

### Query Performance

Para analizar queries lentas:

```sql
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

## Custom Monitoring

### Health Check Endpoint

Crea `src/app/api/health/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";

export async function GET() {
  try {
    // Verificar conexión a DB
    await db.execute(sql`SELECT 1`);
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "ok",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
```

### Metrics Endpoint (Solo Super Admin)

Crea `src/app/api/metrics/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/authz";
import { getGlobalStats } from "@/lib/superAdminService";

export const GET = withSuperAdmin(async () => {
  const stats = await getGlobalStats();
  
  return NextResponse.json({
    users: stats.totalUsers,
    academies: stats.totalAcademies,
    athletes: stats.totalAthletes,
    subscriptions: stats.activeSubscriptions,
  });
});
```

## Alertas

### Configurar Alertas en Sentry

1. Ve a Sentry → Alerts
2. Crea reglas para:
   - Errores críticos (> 10 en 5 min)
   - Errores nuevos
   - Performance degradado

### Configurar Alertas en Supabase

1. Ve a Supabase Dashboard → Settings → Alerts
2. Configura alertas para:
   - Uso de almacenamiento
   - Queries lentas
   - Errores de API

## Best Practices

1. **No loggear información sensible**: Evita passwords, tokens, etc.
2. **Usar niveles apropiados**: `error`, `warning`, `info`, `debug`
3. **Contexto útil**: Incluye user ID, tenant ID, request ID
4. **Sampling**: No capturees todos los eventos en producción
5. **Filtrado**: Filtra errores conocidos/no críticos

## Checklist

- [ ] Sentry configurado
- [ ] LogRocket configurado (opcional)
- [ ] Vercel Analytics configurado
- [ ] Health check endpoint creado
- [ ] Metrics endpoint creado
- [ ] Alertas configuradas
- [ ] Variables de entorno configuradas
- [ ] Documentación actualizada

## Recursos

- [Sentry Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [LogRocket Docs](https://docs.logrocket.com/)
- [Vercel Analytics](https://vercel.com/docs/analytics)

