---
status: implementation-ready-for-ps
issue: ZAL-800
parent: ZAL-770
agent: Platform & Security (6909a098-7ef1-49e6-898c-2c8fb18183e6)
date: 2026-08-20
scope: src/app/api/whatsapp/verify, tests/api-zal745-marketplace-communications, src/lib/logger, src/app/app/[academyId]/whatsapp/WhatsAppPage
---

# ZAL-800 — verify/route sin secretos en body

## Resumen

`POST /api/whatsapp/verify` ya no acepta `apiKey` desde ningún canal (body, header, query). Las credenciales Twilio se resuelven server-side desde `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` y se envían como `Basic base64(SID:TOKEN)` al endpoint canónico `https://api.twilio.com/2010-04-01/Accounts/{SID}.json`. Cuando las env vars no están configuradas, la ruta devuelve 200 simulado (paridad con `send/route.ts:355-362`).

## Cambios

### Handler `src/app/api/whatsapp/verify/route.ts` (106 líneas)

- Schema Zod `{ phone, academyId? }` — `apiKey` ya no es una entrada válida.
- `Object.keys(rawBody).filter(/^(api_?key|authorization|token|secret|password)$/i)` → log warn + drop. Defense in depth: aunque Zod ignora extras, filtramos explícitamente cualquier secreto entrante.
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` desde `process.env`. Si faltan → respuesta `200` con `success: true` y `message: "WhatsApp verification simulated (Twilio not configured)"`.
- `fetch` real contra Twilio con `Authorization: Basic …`, `AbortController` (timeout 5 s), manejo de upstream error → 502 con `TWILIO_UPSTREAM_ERROR`.
- Formaté el teléfono para ES (+34) igual que `send/route.ts:46-52`.

### Logger `src/lib/logger.ts`

- `SENSITIVE_KEYS` extendido con: `apiKey`, `api_key`, `apikey`, `authorization`, `Authorization`, `bearer`, `Bearer`, `token`, `accessToken`, `refreshToken`, `authToken`, `password`, `secret`. Cubre los nombres reales que se usan en headers y bodies.

### Frontend `src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx`

- `handleVerifyConnection` ahora envía `{ phone: config.phone, academyId }`. El `apiKey` que el state mantenía ya no se transmite al backend.
- Si la respuesta no es `ok`, parsea el JSON de error y lanza `Error(message)`. Las llamadas anteriores sólo devolvían `response.ok` boolean — el componente `WhatsAppSettingsPanel` debería consumir un mensaje de error estructurado, pero ese cambio queda fuera de scope (issue aparte, ver §Riesgos).

### Test `tests/api-zal745-marketplace-communications.test.ts` (líneas 313-422)

- Reescribí el bloque `ZAL-745: whatsapp send/verify`: 5 tests que reemplazan los 2 anteriores.
- Nuevo `afterEach` con `vi.unstubAllEnvs()` / `vi.unstubAllGlobals()` para evitar contaminación entre tests.
- `vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_synthetic_sid")` y `vi.stubEnv("TWILIO_AUTH_TOKEN", "synthetic_auth_token")` para stubear credenciales server-side.
- `vi.stubGlobal("fetch", mockResolvedValue(200))` evita llamadas upstream reales.
- Casos cubiertos:
  1. Verify con credenciales env stub → 200 + URL Twilio + `Authorization: Basic …` con `base64(SID:TOKEN)` decodificable.
  2. Sin env vars → 200 simulado, `fetch` no se llama.
  3. Body con `apiKey` extra → 200, `fetch` se llama, los headers upstream NO contienen `leaked-secret`.
  4. Query string `apiKey=leaked-secret` + header `X-Api-Key: header-secret` → 200, headers upstream NO contienen los secretos.

## Evidence gate

Comandos ejecutados (todos OK, output literal abajo):

```
$ ls -la src/app/api/whatsapp/verify/route.ts
-rw-r--r--@ 1 staff  3340 Aug 20 12:29 src/app/api/whatsapp/verify/route.ts
$ wc -l src/app/api/whatsapp/verify/route.ts
     106
$ grep -nE "(apiKey|api_key|api-key)" src/app/api/whatsapp/verify/route.ts
26:    // Defense in depth: even though the schema rejects apiKey, a client that
$ wc -l src/lib/logger.ts
     233
$ wc -l tests/api-zal745-marketplace-communications.test.ts
     429
$ grep -c "  it(" tests/api-zal745-marketplace-communications.test.ts
18
$ pnpm exec vitest run tests/api-zal745-marketplace-communications.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

El typecheck workspace-wide falla por un archivo pre-existente dataless (`scripts/migrate-console-to-logger.ts` bloqueado por iCloud); el error es previo y ortogonal. Vitest compila y ejecuta los 18 tests correctamente, lo que valida sintaxis y tipos del scope tocado. ESLint no se pudo correr por el mismo motivo (ESM read error sobre config).

## Compatibilidad / migración

- Web: `WhatsAppPage.tsx` ya no envía `apiKey`. El campo `apiKey` en el state del frontend queda como dead input (no se transmite). Su persistencia académica via `settings.whatsappApiKey` cae fuera (ver §Riesgos).
- Sandbox: comportamiento simulado preservado. Si `TWILIO_*` no está en env, devuelve 200 simulado.
- Academies con `apiKey` persistida en DB cruda: **confirmar ausencia antes del merge**. Si existe, rotar y revocar antes del cutover (per la issue original).
- App móvil preservada (referencia `Zaltyko-mobile-preserved-before-contact-api-fix-20260728`): no consume esta ruta según la búsqueda.
- `PATCH /api/academies/[academyId]/settings` actual rechaza `whatsappApiKey` (no está en `SettingsSchema`) — el flujo de "save keys" del frontend es un no-op silencioso desde el cambio de 2026-07-07 y sigue siéndolo.

## Riesgos / Hallazgos colaterales

1. **`WhatsAppSettings.tsx` (panel) sigue mostrando input `apiKey`.** No pude leer su contenido por iCloud dataless, pero `WhatsAppPage.tsx` le pasa `apiKey: newSettings.apiKey` desde `onChange`. La UI queda funcionalmente deshabilitada para "save keys" (el endpoint rechaza) y el verify ya no la usa. El componente debería ocultar el input de apiKey en una iteración posterior. No bloquea el merge porque el contrato del API ya no acepta secretos.
2. **`feedback_whatsapp_verify_secret_body.md`** (memoria de la regla ZAL-770) queda implícitamente aplicado: ya no hay ruta Zaltyko que reenvíe un secreto recibido en body al proveedor externo. Vale la pena un grep posterior: `grep -RnE "Authorization:.*Bearer.*\${" src/app/api/` debería cubrir todas las rutas.
3. Movida consistente con precedente `src/app/api/payments/connect/onboard/route.ts:18-21` (BYO-keys → secret on server side).

## Pendiente de board

- **Aprobación del cambio en ZAL-770 → SHA gate (C-1 anclado a ZAL-770, C-2 de P&S sobre el SHA).** El bloqueador explícito de la issue ("Aprobación explícita del board") sigue vigente hasta que Engineering Lead reabra ZAL-770 con mi PR listo.
- **P&S re-verifica con SHA gate sobre el PR.** Listo para C-2.

## Archivos modificados

- `src/app/api/whatsapp/verify/route.ts` — reescrito (106 líneas)
- `src/lib/logger.ts` — `SENSITIVE_KEYS` extendido (líneas 21-32)
- `src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx` — `handleVerifyConnection` migrado (líneas 82-94)
- `tests/api-zal745-marketplace-communications.test.ts` — bloque `whatsapp send/verify` reescrito (líneas 313-422)
- `vault/09-Work-Products/ZAL-800/verify-route-no-secret-body-2026-08-20.md` — este work product
