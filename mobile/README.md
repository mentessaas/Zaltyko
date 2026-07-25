# Zaltyko Mobile

App nativa iOS + Android para Zaltyko. Stack: **Expo SDK 53 + React Native 0.79 + TypeScript + Expo Router**. Reutiliza el backend Next.js existente (Supabase Auth bearer → `withBearerTenant`).

## Setup local

```bash
cd mobile
npm install                # el proyecto usa npm (package-lock.json), no pnpm
cp .env.example .env       # rellenar EXPO_PUBLIC_* con valores reales
eas init                   # solo la primera vez, asigna EAS_PROJECT_ID
npx expo prebuild          # genera ios/ y android/
npm run ios                # simulador iOS
npm run android             # emulador Android
```

Para device físico o TestFlight/Play Internal:

```bash
npm run build:dev             # development build (incluye dev-client)
npm run build:preview         # build interno (TestFlight / Play internal)
npm run build:prod            # build de producción
```

## Verificación

```bash
npm run typecheck    # tsc --noEmit
npm run lint          # eslint (flat config en eslint.config.mjs)
npm test             # vitest — solo lógica pura (cliente API, auth, role routing)
```

Los tests con vitest cubren `lib/api/client.ts` (adjuntar Bearer, retry en 401,
propagación de errores de red) y `lib/auth/role-router.ts` (qué tabs ve cada
rol). No cubren componentes `.tsx` — eso requeriría jest-expo/RN Testing
Library, fuera de alcance por ahora.

## Arquitectura

```
mobile/
├── app/                  ← Expo Router (file-based)
├── lib/
│   ├── api/              ← cliente HTTP tipado (Bearer + 401→refresh+retry)
│   ├── auth/             ← Supabase client + SecureStore + useSession
│   ├── push/             ← Expo Push registration + handler
│   ├── query/            ← TanStack Query
│   └── theme.ts          ← tokens de diseño Zaltyko
├── components/
├── assets/
└── app.json
```

Toda mutación pasa por el backend Next.js en `/api/*` con `Authorization: Bearer <supabase_jwt>`. Stripe y webhooks nunca tocan la app.

## Convenciones

- TypeScript estricto (`noUncheckedIndexedAccess`).
- Componentes memoizados (`memo(...)`) cuando se renderizan en listas largas.
- Cero código server-only (Drizzle, server actions, env de servidor).
- Respuestas de la API se desestructuran como `{ data }` — viene envuelto en `apiSuccess`.
- Zod para validar inputs antes de enviar al backend.

## Más info

Plan completo en `/Users/elvisvaldesinerarte/.claude/plans/nesecito-crrear-una-app-linked-catmull.md`.