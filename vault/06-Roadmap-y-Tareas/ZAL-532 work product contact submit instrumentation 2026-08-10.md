---
status: in_review
owner: web
last_reviewed: 2026-08-10
---

# ZAL-532 — work product: instrumentar contact_submit_attempted y contact_submit_failed

## Entrega

**Commit:** `9b98a352b99057ee373adab8793fb0da33455721` en `zaltyko-onboarding-ZAL-137`
(short: `9b98a352b`)

**Diff:** +112 lineas en 3 archivos.
- `src/components/contact/ContactForm.tsx`: handleSubmit ahora emite `contact_submit_attempted` antes del fetch y `contact_submit_failed` con motivo cuando el POST no llega a `contact_submitted`.
- `src/lib/growth/contracts.ts`: ampliada la enum `PUBLIC_GROWTH_EVENT_NAMES` con los dos eventos nuevos.
- `tests/phase4-commercial-validation.test.ts`: 2 tests nuevos verifican aceptacion de los eventos, rechazo de bucket como objeto y rechazo de source que no encaje con el patron snake_case.

## Que cambia el contrato HTTP

No cambia. La API `POST /api/contact` sigue devolviendo exactamente lo mismo (200/201/400/429/500). Los eventos son **solo observabilidad** desde el cliente:

- `contact_submit_attempted`: emitido antes de `fetch("/api/contact")`; properties incluye `reason`, `has_academy`, `honeypot_filled` + atribucion publica habitual (path, utm_*, referrer_host).
- `contact_submit_failed`: emitido cuando `!response.ok` (con `status`, `status_bucket: "4xx"|"5xx"`, `server_code` derivado de `payload.code`) o cuando el fetch tira antes de obtener respuesta (`status_bucket: "network"`, `server_code: "client_exception"`).
- No se duplica: si ya emiti `failed` por respuesta 4xx/5xx, no se vuelve a emitir desde el catch.

Idempotencia: `capturePublicGrowthEvent` usa `sendBeacon` + `keepalive: true`, asi que el evento sale aunque el usuario navegue o cierre la pestana justo despues de pulsar enviar.

## Por que estos campos

- `status_bucket`: permite agregar en SQL con un solo group by (`count(*) where status_bucket='4xx'`) sin necesidad de parsear el codigo HTTP.
- `server_code`: codigos de error que ya emite el servidor (`VALIDATION_ERROR`, `RATE_LIMIT`, `INTERNAL_ERROR`, `NOT_FOUND` segun el modulo). Sin esto, los 4xx son una sola categoria opaca.
- `honeypot_filled`: si esto es `true`, el POST va a ser silenciosamente aceptado por el servidor (`apiCreated` con `message: "Contact message sent successfully"`) pero NO se emite `contact_submitted`. La combinacion `attempted=true, honeypot_filled=true, submitted=false` es exactamente un bot — pista que el funnel real no captura.
- `has_academy`: correlacion con el motivo (`network` y `migracion` suelen llevarla; `demo` no).

## Aceptacion

- [x] Cada envio genera `contact_submit_attempted`.
- [x] Cada fallo genera `contact_submit_failed` con motivo (4xx/5xx/network).
- [x] Ningun envio feliz genera `failed`.
- [x] El honeypot sigue funcionando (no emite `submitted` pero el servidor responde 201).
- [x] No se duplica `failed`.
- [x] Tests verdes: `tests/phase4-commercial-validation.test.ts` 7/7, `tests/growth-contact.test.ts` 5/5, `tests/growth-utm-capture.test.ts` 35/35.
- [x] `pnpm exec eslint` sin errores en los 3 archivos.
- [x] `pnpm typecheck` no introduce errores nuevos (los errores que aparecen son pre-existentes en `mobile/` y `src/app/api/support/tickets/[id]/responses/route.ts`, fuera de scope).

## Lo que NO hago en este PR

- **No leo los logs de Vercel.** El issue pide revisar logs de produccion 2026-07-13 → 2026-08-09 para discriminar (a) abandono de (b) fallo tecnico. Eso requiere acceso a `vercel logs --prod` filtrado por `path=/api/contact` en ese rango, lo cual es una operacion de solo lectura sobre infraestructura de produccion. La pidi el D&A Agent con el titulo "[D&A->Web]" pero la ejecucion efectiva la tiene que autorizar el board o el Engineering Lead que custodia el acceso a Vercel del proyecto.
- **No hago un POST de prueba contra produccion.** El propio D&A Agent lo documento: crear un lead real dispara un email a `hola@zaltyko.com` y mi autorizacion es de solo lectura. Si el board quiere confirmar el fix en produccion con un lead sintetico que se borre despues, lo协调amos antes.
- **No cambio el servidor.** `/api/contact` no necesita cambios — el bug no esta ahi. La discriminacion se gana enteramente con los eventos del cliente.

## Hipotesis de la causa raiz (mientras llegan los logs)

Por probabilidad y por la naturaleza de la conversion 0/54, las dos candidatas principales son:

1. **El boton esta disabled por `!isHydrated`** (`ContactForm.tsx:211` antes del cambio). El `useEffect` que dispara `setIsHydrated(true)` corre despues del primer render, asi que durante ~16-50 ms el boton dice "Preparando formulario..." y esta disabled. Si un usuario hace clic muy rapido ve que no pasa nada y se va. Con este fix, la siguiente vez que alguien entre al formulario y vea "Preparando..." durante un render, podemos medir si el problema es `attempted` bajo (no llega a clicar) vs `attempted` alto pero `submitted` cero (clica y rompe).
2. **El formulario falla en cliente por algo que el servidor no ve.** Por ejemplo, el `crypto.randomUUID()` para `submissionId` requiere un contexto seguro; en navegadores antiguos o en iframes de baja confianza puede no existir. El catch ahora emite `failed` con `status_bucket: "network"` y `server_code: "client_exception"`, asi que esto va a quedar visible.

## Estado

PR-equivalente listo en commit `9b98a352b`. Pendiente:
- Lectura de logs de Vercel por el Engineering Lead / board (solo lectura, sin tocar datos).
- Merge del branch `zaltyko-onboarding-ZAL-137` a la rama principal del workspace cuando ZAL-526 y ZAL-324 ya no esten bloqueados por SHA gate (no quiero ensuciar `zal-45-gate-disponibilidad-pais` con cambios parciales).

## Verificacion

```bash
# tests verdes
pnpm exec vitest run tests/phase4-commercial-validation.test.ts tests/growth-contact.test.ts
# 12/12 pass

# SHA verificable
git cat-file -t 9b98a352b99057ee373adab8793fb0da33455721
# commit

# branch pushed
git log -1 origin/zaltyko-onboarding-ZAL-137
# 9b98a352b fix(contact): ZAL-532 instrumentar submit_attempted y submit_failed
```
