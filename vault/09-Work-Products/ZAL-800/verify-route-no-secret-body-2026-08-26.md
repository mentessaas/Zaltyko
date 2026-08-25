---
status: implementation-ready-for-ps
issue: ZAL-800
parent: ZAL-770
agent: Engineering Lead (acade097-32d5-4ce1-91f1-1415a6f2bc12)
date: 2026-08-26
scope: verify route, WhatsApp web consumer/settings, logger redaction, focal tests
---

# ZAL-800 — verificación WhatsApp sin secretos del cliente

## Resultado

La ruta `POST /api/whatsapp/verify` acepta únicamente `{ phone, academyId? }`,
rechaza payloads estrictos con claves de credenciales y bloquea claves de API en
body, query y headers antes de contactar Twilio. Las credenciales se leen solo
desde `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` en el servidor y se envían como
Basic Auth al endpoint de cuenta de Twilio. Sin credenciales server-side devuelve
una simulación 200 sin llamada externa.

La UI ya no solicita, mantiene ni envía una clave de API. El panel explica que
las credenciales se gestionan en servidor. El logger redacta credenciales en
claves estructuradas y texto libre, incluyendo Authorization/Bearer.

## Evidencia local literal

```text
$ ls -la -- src/app/api/whatsapp/verify/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3608 Aug 26 00:25 src/app/api/whatsapp/verify/route.ts
$ wc -l -- src/app/api/whatsapp/verify/route.ts
     118 src/app/api/whatsapp/verify/route.ts

$ ls -la -- src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  9875 Aug 26 00:26 src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
$ wc -l -- src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
     289 src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx

$ ls -la -- src/app/app/[academyId]/whatsapp/page.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5977 Aug 26 00:25 src/app/app/[academyId]/whatsapp/page.tsx
$ wc -l -- src/app/app/[academyId]/whatsapp/page.tsx
     206 src/app/app/[academyId]/whatsapp/page.tsx

$ ls -la -- src/components/whatsapp/WhatsAppSettings.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4622 Aug 26 00:25 src/components/whatsapp/WhatsAppSettings.tsx
$ wc -l -- src/components/whatsapp/WhatsAppSettings.tsx
     146 src/components/whatsapp/WhatsAppSettings.tsx

$ ls -la -- src/lib/logger.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6675 Aug 26 00:25 src/lib/logger.ts
$ wc -l -- src/lib/logger.ts
     239 src/lib/logger.ts

$ ls -la -- tests/api-zal745-marketplace-communications.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  16238 Aug 26 00:25 tests/api-zal745-marketplace-communications.test.ts
$ wc -l -- tests/api-zal745-marketplace-communications.test.ts
     428 tests/api-zal745-marketplace-communications.test.ts
$ grep -c "  it(" tests/api-zal745-marketplace-communications.test.ts
18

$ ls -la -- tests/lib/logger-redaction.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2555 Aug 26 00:25 tests/lib/logger-redaction.test.ts
$ wc -l -- tests/lib/logger-redaction.test.ts
      75 tests/lib/logger-redaction.test.ts
$ grep -c "  it(" tests/lib/logger-redaction.test.ts
3

$ pnpm exec vitest run tests/api-zal745-marketplace-communications.test.ts 2>&1 | tail -30
 ✓ tests/api-zal745-marketplace-communications.test.ts (18 tests) 2047ms
 Test Files  1 passed (1)
      Tests  18 passed (18)

$ pnpm exec vitest run tests/lib/logger-redaction.test.ts 2>&1 | tail -30
 ✓ tests/lib/logger-redaction.test.ts (3 tests) 19ms
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ pnpm exec tsc --noEmit --pretty false
TSC_EXIT=0

$ grep -RnE "(apiKey|api_key)" src/app/api/whatsapp/verify
$ grep -RnE "(apiKey|api_key)" src/app/api/whatsapp/verify | wc -l
       0

$ git diff --check
```

El lint focal terminó con código 0 y cinco warnings `no-explicit-any`
preexistentes en el harness de `tests/api-zal745-marketplace-communications`;
no produjo errores.

## Estado y handoff

- Evidencia: local/worktree y sandbox de Vitest únicamente.
- No se tocaron producción, secretos reales, datos reales, Stripe live,
  migraciones remotas ni publicaciones externas.
- No se declara readiness productivo ni merge.
- Siguiente acción: revisión independiente de Platform & Security sobre el SHA
  que se publique, con C-1 anclado a ZAL-770 y C-2 sobre este cambio.
