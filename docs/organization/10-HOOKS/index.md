# Hooks Index

## Overview

Custom React hooks for state management and utilities.

## Core Hooks

### Academy Context
```typescript
// use-academy-context.tsx
const { tenantId, academy, user } = useAcademyContext();
```

### Data Fetching
```typescript
// use-fetch-data.ts
const { data, loading, error } = useFetchData('/api/athletes');

// useDashboardData.ts
const dashboard = useDashboardData(academyId);
```

### Forms
```typescript
// use-athlete-form.ts
const { form, submit, loading } = useAthleteForm();

// use-edit-athlete.ts
const { athlete, update, saving } = useEditAthlete(athleteId);
```

### Billing
```typescript
// use-billing-data.ts
const billing = useBillingData(academyId);

// use-billing-actions.ts
const { upgrade, downgrade, cancel } = useBillingActions();
```

## Utilities

```typescript
// use-debounce.ts
const debouncedValue = useDebounce(value, 300);

// use-keyboard-shortcuts.tsx
useKeyboardShortcuts([{ key: 'k', ctrl: true, action: () => {} }]);

// use-i18n.ts
const { t, locale } = useI18n();

// use-translation.ts
const { t } = useTranslation();
```

## Notifications

```typescript
// use-push-notifications.ts
const { permission, subscribe } = usePushNotifications();

// use-realtime-notifications.ts
const { notifications } = useRealtimeNotifications();

// use-notification-sound.ts
const { playSound } = useNotificationSound();
```

## PWA

```typescript
// use-install-prompt.ts
const { isInstalled, installPrompt, install } = useInstallPrompt();

// use-offline-status.ts
const { isOffline, wasOffline } = useOfflineStatus();

// use-service-worker.ts
const { registration, update } = useServiceWorker();

// use-pull-to-refresh.tsx
const { isPulling, pullProps } = usePullToRefresh();
```

## Auth & Onboarding

```typescript
// use-onboarding-state.ts
const { step, complete, canProceed } = useOnboardingState();

// use-confirm.tsx
const { confirm } = useConfirm();
// confirm({ title: 'Delete?', }) → Promise<boolean>
```

## Search & Global

```typescript
// use-global-search.ts
const { results, search } = useGlobalSearch();

// useLogger.ts
const logger = useLogger();
```

## Super Admin

```typescript
// use-super-admin-data.ts
const { academies, loading } = useSuperAdminData();
```

## All Hooks (26 total)

| Hook | Purpose |
|------|---------|
| `use-academy-context.tsx` | Academy context |
| `use-athlete-form.ts` | Athlete form |
| `use-billing-actions.ts` | Billing actions |
| `use-billing-data.ts` | Billing data |
| `use-confirm.tsx` | Confirmation dialog |
| `use-debounce.ts` | Debounce value |
| `use-edit-athlete.ts` | Edit athlete |
| `use-fetch-data.ts` | Generic fetch |
| `use-global-search.ts` | Global search |
| `use-i18n.ts` | i18n |
| `use-keyboard-shortcuts.tsx` | Keyboard shortcuts |
| `use-notification-sound.ts` | Notification sound |
| `use-onboarding-state.ts` | Onboarding state |
| `use-push-notifications.ts` | Push notifications |
| `use-realtime-notifications.ts` | Realtime notifications |
| `use-translation.ts` | Translation |
| `useDashboardData.ts` | Dashboard data |
| `useInstallPrompt.ts` | PWA install |
| `useLogger.ts` | Logger |
| `useOfflineStatus.ts` | Offline status |
| `usePullToRefresh.tsx` | Pull to refresh |
| `useServiceWorker.ts` | Service worker |
| `useSuperAdminData.ts` | Super admin data |