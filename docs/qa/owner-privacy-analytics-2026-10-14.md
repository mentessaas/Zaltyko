# Gate de analytics del navegador — 2026-10-14

## Hallazgo y cambio

En la base `78d7f14f`, `PostHogProvider` iniciaba el SDK al montar y `trackPageView`/`trackEvent` del navegador podían capturar sin opt-in. El consentimiento contractual `owner_consent` es distinto y no se usa para autorizar analytics.

El cambio añade el contrato browser default-deny de PR #66 (`state.ts` + `store.ts`) y solo activa PostHog cuando el estado vigente es `granted`. `unset` y `revoked` bloquean importación, inicialización y captura. La comprobación se repite después de la importación asíncrona; revocar durante la carga evita que esta acabe inicializando o emitiendo. Tras una inicialización previa, revocar llama a `opt_out_capturing()` y nuevas capturas quedan bloqueadas; conceder de nuevo reactiva la instancia sin `init` duplicado.

La inicialización también respeta `NEXT_PUBLIC_DISABLE_ANALYTICS` usando acceso directo `process.env.NEXT_PUBLIC_DISABLE_ANALYTICS`, que Next.js puede inlinear en código browser. Con el SDK permitido, config queda explícitamente con `autocapture: false`, `capture_pageview: false`, `capture_pageleave: false` y `disable_session_recording: true`; los pageviews manuales solo se emiten con consentimiento.

El bloque server-side de `trackEvent` que persiste eventos operativos first-party vía `recordGrowthEvent` permanece sin cambios funcionales y no consulta el consentimiento browser. Esto no habilita eventos de marketing en server: conserva el camino interno ya existente.

El store sincroniza la revocación entre pestañas: el `storage` event con `key === null` de `localStorage.clear()` produce `unset`. `__resetConsentForTests()` elimina el handler nombrado para evitar callbacks duplicados. Con storage bloqueado y sin una elección explícita en memoria, el estado permanece `unset`; PostHog no se importa ni inicializa.

## Límites vigentes

- **No hay UI de consentimiento de analytics conectada.** No se añadió banner ni texto legal ni se reutilizó el consentimiento contractual. En este checkout, `writeConsent()` no tiene consumidores de producción; solo está definido en el store y usado en pruebas. Por tanto, analytics del navegador queda bloqueado hasta que una UI existente o futura llame explícitamente a `writeConsent("granted")` tras una decisión del usuario.
- `src/app/layout.tsx` conserva su `<link rel="preconnect" href="https://app.posthog.com">` fuera del ownership autorizado. No inicializa PostHog ni envía eventos, pero sí permite al navegador anticipar la conexión al host; requiere decisión separada si el objetivo futuro es impedir cualquier conexión previa al consentimiento.
- No se verificaron cookies ni requests contra un proyecto PostHog real, producción, una UI legal ni una revocación desde ajustes de usuario. Las pruebas usan mocks sintéticos.
- Vault compartida, layout, login, E2E, Stripe, migraciones y build/stack de QA quedaron intactos.

## Verificaciones

- `tests/consent-gate.test.tsx` y `tests/consent-gate-race.test.tsx`: 10/10 PASS, también con orden aleatorio (seeds 42 y 20261014). La prueba de importación diferida está aislada, no depende del orden con otros tests. Cubre unset/revoked, grant/revoke/regrant, flag disabled, captura posterior a revoke, revocación durante import, clear entre pestañas, limpieza del listener, storage bloqueado, SSR y persistencia server-side de un evento first-party.
- `pnpm typecheck`: PASS.
- ESLint focal: PASS, sin warnings.
- Prettier focal: PASS.
- `git diff --check`: PASS.

La advertencia de pnpm sobre `pnpm.overrides` preexistente no afectó los checks.

## Referencias técnicas

- [Next.js: acceso e inlineado de variables públicas](https://nextjs.org/docs/app/guides/environment-variables)
- [PostHog: desactivar autocapture y eventos automáticos de página](https://posthog.com/docs/product-analytics/cutting-costs)
- [PostHog: opt-in/opt-out del SDK browser](https://posthog.com/tutorials/cookieless-tracking)
