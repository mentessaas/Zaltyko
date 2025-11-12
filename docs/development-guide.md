# Guía de Desarrollo y Contribución

Esta guía te ayudará a entender cómo contribuir al proyecto GymnaSaaS.

## Requisitos Previos

- Node.js 18+ y pnpm
- PostgreSQL 14+ o acceso a Supabase
- Cuenta de Stripe (para desarrollo de facturación)
- Cuenta de Mailgun (para envío de emails)

## Configuración del Entorno

### 1. Clonar el repositorio

```bash
git clone <repository-url>
cd ShipFree-main
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env.local` basado en `.env.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Mailgun
MAILGUN_API_KEY=tu_api_key
MAILGUN_DOMAIN=tu_dominio
MAILGUN_FROM_EMAIL=noreply@tu_dominio.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Configurar base de datos

Ejecuta las migraciones:

```bash
pnpm db:migrate
```

O si usas Supabase CLI:

```bash
supabase db reset
```

### 5. Ejecutar el servidor de desarrollo

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Estructura del Proyecto

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── (super-admin)/     # Rutas de Super Admin
│   ├── dashboard/         # Dashboard de usuarios
│   └── auth/              # Autenticación
├── components/            # Componentes React
│   ├── ui/               # Componentes base (shadcn/ui)
│   ├── athletes/         # Componentes de atletas
│   ├── navigation/       # Navegación
│   └── providers/       # Context providers
├── db/                   # Base de datos (Drizzle ORM)
│   ├── schema/          # Esquemas de tablas
│   └── migrations/      # Migraciones
├── lib/                  # Utilidades y helpers
│   ├── authz.ts         # Autorización
│   ├── limits.ts        # Límites de planes
│   └── stripe/          # Integración Stripe
├── hooks/                # Custom React hooks
└── config.ts            # Configuración global
```

## Convenciones de Código

### TypeScript

- Usa tipos explícitos en lugar de `any` cuando sea posible
- Define interfaces para props de componentes
- Usa `const` para valores inmutables, `let` solo cuando sea necesario

### React

- Usa componentes funcionales con hooks
- Prefiere `useState` y `useEffect` sobre clases
- Usa `useMemo` y `useCallback` para optimización cuando sea necesario
- Mantén componentes pequeños y enfocados

### Estilos

- Usa Tailwind CSS para estilos
- Sigue el sistema de diseño establecido
- Usa variables CSS para colores y espaciado
- Responsive-first: mobile primero

### Base de Datos

- Usa Drizzle ORM para todas las queries
- Siempre valida datos con Zod antes de insertar
- Usa transacciones para operaciones múltiples
- Respeta RLS (Row Level Security) de Supabase

## Flujo de Trabajo

### 1. Crear una rama

```bash
git checkout -b feature/nombre-de-la-feature
```

### 2. Hacer cambios

- Escribe código limpio y bien documentado
- Agrega tests para nuevas funcionalidades
- Actualiza documentación si es necesario

### 3. Ejecutar tests

```bash
pnpm test
```

### 4. Verificar linting

```bash
pnpm lint
```

### 5. Commit

Usa mensajes de commit descriptivos:

```bash
git commit -m "feat: agregar funcionalidad X"
git commit -m "fix: corregir bug Y"
git commit -m "docs: actualizar documentación"
```

### 6. Push y crear Pull Request

```bash
git push origin feature/nombre-de-la-feature
```

## Testing

### Tests Unitarios

Los tests están en la carpeta `tests/`:

```bash
pnpm test
```

### Tests E2E

Los tests E2E están en `tests/e2e-*.test.ts`:

```bash
pnpm test:e2e
```

### Coverage

```bash
pnpm test:coverage
```

## Estándares de Código

### Nombres

- **Componentes**: PascalCase (`UserProfile.tsx`)
- **Funciones**: camelCase (`getUserData`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_ATHLETES`)
- **Archivos**: kebab-case (`user-profile.tsx`)

### Imports

Orden de imports:
1. Librerías externas
2. Imports de Next.js
3. Imports internos (`@/...`)
4. Imports relativos (`./...`)

Ejemplo:
```typescript
import { useState } from "react";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { Button } from "@/components/ui/button";
import { localHelper } from "./helpers";
```

### Componentes

```typescript
"use client"; // Solo si usa hooks del cliente

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ComponentProps {
  title: string;
  onAction?: () => void;
}

export function Component({ title, onAction }: ComponentProps) {
  const [state, setState] = useState(false);

  return (
    <div>
      <h1>{title}</h1>
      <Button onClick={onAction}>Action</Button>
    </div>
  );
}
```

## Debugging

### Logs del Servidor

Los logs aparecen en la consola donde ejecutas `pnpm dev`.

### Logs del Cliente

Usa `console.log` en desarrollo, pero elimínalos antes de commit.

### Supabase Logs

Ve a Supabase Dashboard → Logs para ver logs de la base de datos.

## Performance

### Optimizaciones Comunes

1. **Imágenes**: Usa `next/image` para optimización automática
2. **Queries**: Evita N+1 queries, usa joins cuando sea posible
3. **Memoización**: Usa `useMemo` y `useCallback` para cálculos pesados
4. **Lazy Loading**: Carga componentes pesados con `dynamic`

### Profiling

```bash
pnpm build
pnpm start
```

Luego usa React DevTools Profiler para identificar componentes lentos.

## Seguridad

### Autenticación

- Siempre verifica autenticación en API routes
- Usa `withTenant` para verificar tenant del usuario
- No expongas datos sensibles en el cliente

### Validación

- Valida todos los inputs con Zod
- Sanitiza datos antes de guardar en DB
- Usa parámetros preparados para queries SQL

### RLS

- Configura políticas RLS en Supabase
- Verifica que los usuarios solo vean sus datos
- Super Admin puede ver todo, pero con cuidado

## Documentación

### Comentarios

```typescript
/**
 * Calcula la edad de un atleta basándose en su fecha de nacimiento.
 * 
 * @param dob - Fecha de nacimiento en formato Date
 * @returns Edad en años o null si la fecha es inválida
 */
function calculateAge(dob: Date | null): number | null {
  // ...
}
```

### README

Actualiza el README principal cuando agregues nuevas features importantes.

## Recursos

- [Next.js Docs](https://nextjs.org/docs)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)

## Preguntas

Si tienes preguntas:
1. Revisa la documentación existente
2. Busca en issues anteriores
3. Crea un nuevo issue con la etiqueta `question`

## Código de Conducta

- Sé respetuoso con otros contribuidores
- Acepta feedback constructivo
- Ayuda a otros cuando puedas
- Mantén el código limpio y bien documentado

