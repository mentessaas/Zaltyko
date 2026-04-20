# PWA - Progressive Web App

## Overview

Zaltyko supports offline access, install prompt, and background sync as a Progressive Web App.

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

### Background Sync

When offline, operations are queued in IndexedDB:

```typescript
// src/lib/offline/operations-queue.ts
// Queues: athlete:create, athlete:update, attendance:record, etc.
// When back online, syncs automatically
```

## PWA Configuration

Configured in `next.config.js` with manifest generation.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_DISABLE_ANALYTICS` | Disable PostHog when offline |

## More Info

- [Hooks](../10-HOOKS/index.md) - All custom hooks