# PWA - Progressive Web App

## Overview

Zaltyko se puede instalar como Progressive Web App y muestra un estado offline
claro. Las mutaciones offline y la sincronización en segundo plano están
deliberadamente desactivadas hasta cerrar la idempotencia, resolución de
conflictos y aislamiento tenant necesarios para datos de menores y cobros.

## Key Files

### Provider
```
src/app/providers.tsx          # PWA provider setup
```

### Components
```
src/components/
├── ServiceWorkerRegister.tsx  # SW registration
└── (inline in providers.tsx)
```

### Hooks
```
src/hooks/
├── useInstallPrompt.ts         # Install banner logic
├── useOfflineStatus.ts         # Offline detection
├── useServiceWorker.ts         # SW communication
└── usePullToRefresh.tsx        # Pull-to-refresh
```

### Offline Support
```
src/lib/offline/
├── db.ts                      # IndexedDB wrapper
└── operations-queue.ts        # Queue operations when offline
```

### PWA Notifications
```
src/lib/notifications/
└── sw-registration.ts         # Service worker for push
```

## Features

### Offline Support

```typescript
// hooks/useOfflineStatus.ts
const { isOffline, wasOffline } = useOfflineStatus();
// isOffline: boolean
// wasOffline: boolean (was offline at least once)
```

### Install Prompt

```typescript
// hooks/useInstallPrompt.ts
const { isInstalled, installPrompt, install } = useInstallPrompt();

// Show install button when installPrompt is available
if (installPrompt) {
  <button onClick={install}>Install App</button>
}
```

### Background Sync (pendiente)

No se encolan escrituras mientras no haya conectividad. El código de la cola se
mantiene aislado para una futura implementación, pero `queueOperation` falla
de forma explícita y segura mientras `OFFLINE_MUTATIONS_ENABLED` siga apagado:

```typescript
// src/lib/offline/operations-queue.ts
// No se ejecuta en producción todavía: requiere sync idempotente y conflictos.
```

## PWA Configuration

Configured in `next.config.js` with manifest generation.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_DISABLE_ANALYTICS` | Desactiva PostHog de forma global cuando vale `true` |

## More Info

- [Hooks](../10-HOOKS/index.md) - All custom hooks
