# ZAL-979 — Veredicto P&S independiente sobre ZAL-800 WhatsApp verify

Fecha: 2026-08-26  
Scope: revisión independiente del contrato `POST /api/whatsapp/verify` en el checkout actual.  
Disposición local: review completada, con veredicto adverso/no aprobado para ZAL-800. La transición remota a `done` no pudo persistirse porque el control plane estaba caído.

## Veredicto

**NO APROBADO / ADVERSE.** El checkout actual no implementa el contrato solicitado. La ruta acepta `apiKey` desde el body y lo reenvía como `Authorization: Bearer` mediante un `fetch` externo. La UI conserva y envía la credencial. Logger y tests no cubren Authorization/Bearer/Basic ni el rechazo estricto de credenciales desde body, headers o query.

El hallazgo pertenece al owner de ZAL-800. Esta review no modifica el padre ni aplica fixes.

## Hallazgos

1. **P0 — secreto de cliente aceptado y reenviado.** `src/app/api/whatsapp/verify/route.ts` desestructura `apiKey`, exige su presencia y construye un Bearer con ella. También llama directamente a `https://api.whatsapp.com/v1/credentials`. No hay credenciales exclusivamente server-side, allowlist estricta del body, guard de sandbox ni rechazo explícito de variantes sensibles.
2. **P0 — consumidor de navegador con credencial.** `WhatsAppPage.tsx` tipa `apiKey`, la conserva en estado, la envía a `/api/whatsapp/verify`, la envía como `whatsappApiKey` al guardado de settings y la entrega a `WhatsAppSettingsPanel`.
3. **P1 — redacción insuficiente.** `logger.ts` solo registra `clientSecret` y `client_secret` en `SENSITIVE_KEYS`; no aparecen `Authorization`, `Bearer` ni `Basic` en el helper ni en sus tests.
4. **P1 — suite contractual desalineada.** La suite actual tiene un positivo que espera exactamente `apiKey` sintética en el body y `Bearer synthetic-api-key` en el `fetch`. El negativo solo cubre ausencia de `apiKey`; no cubre rechazo de secretos en body/header/query, body estricto, server-side credentials ni no-call externo.

## Clasificación de evidencia

- **Local/worktree:** inspección estática y comandos ejecutados desde el alias `.../Zaltyko`, que resuelve al checkout real `.../Zaltyko-fresh`; ambos apuntan al mismo HEAD y el hash del archivo auditado coincide.
- **Test/sandbox:** Vitest ejecutó las dos suites con `fetch` simulado en la suite de comunicaciones. Verde significa que el contrato antiguo está cubierto, no que el contrato nuevo sea seguro.
- **Producción:** no usada.
- **Validación externa:** no realizada; no se contactó WhatsApp/Twilio ni se usaron secretos.
- **Validación humana:** no realizada.

## Discrepancia con evidencia previa

La evidencia histórica asociada a [ZAL-770](/ZAL/issues/ZAL-770) describía una ruta que validaba solo `phone` y rechazaba `apiKey`. La inspección literal del checkout actual contradice esa descripción: la implementación y la suite siguen aceptando y esperando `apiKey`. Por ello no se hereda ningún PASS histórico.

## Evidencia literal

### Archivos citados

```text
$ ls -la src/app/api/whatsapp/verify/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1122 Aug 26 02:17 src/app/api/whatsapp/verify/route.ts
$ wc -l src/app/api/whatsapp/verify/route.ts
      35 src/app/api/whatsapp/verify/route.ts
$ ls -la src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10047 Aug 26 02:17 src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
$ wc -l src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
     293 src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
$ ls -la src/lib/logger.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5778 Aug 26 02:17 src/lib/logger.ts
$ wc -l src/lib/logger.ts
     217 src/lib/logger.ts
$ ls -la tests/lib/logger-redaction.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2128 Aug 26 02:17 tests/lib/logger-redaction.test.ts
$ wc -l tests/lib/logger-redaction.test.ts
      64 tests/lib/logger-redaction.test.ts
$ ls -la tests/api-zal745-marketplace-communications.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  13840 Aug 26 02:17 tests/api-zal745-marketplace-communications.test.ts
$ wc -l tests/api-zal745-marketplace-communications.test.ts
     361 tests/api-zal745-marketplace-communications.test.ts
```

### Grep y conteos

```text
$ grep -RnE '(apiKey|api_key)' src/app/api/whatsapp/verify
src/app/api/whatsapp/verify/route.ts:7:    const { phone, apiKey } = await request.json();
src/app/api/whatsapp/verify/route.ts:9:    if (!phone || !apiKey) {
src/app/api/whatsapp/verify/route.ts:18:        "Authorization": `Bearer ${apiKey}`,

$ grep -c "  it(" tests/api-zal745-marketplace-communications.test.ts
16
$ grep -c "  it(" tests/lib/logger-redaction.test.ts
2
```

### Suites canónicas

```text
$ pnpm exec vitest run tests/api-zal745-marketplace-communications.test.ts
 ✓ tests/api-zal745-marketplace-communications.test.ts (16 tests) 1151ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  1.68s (transform 489ms, setup 156ms, collect 41ms, tests 1.15s, environment 0ms, prepare 169ms)

$ pnpm exec vitest run tests/lib/logger-redaction.test.ts
 ✓ tests/lib/logger-redaction.test.ts (2 tests) 11ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  508ms (transform 120ms, setup 172ms, collect 63ms, tests 11ms, environment 0ms, prepare 94ms)
```

## Próxima acción

Owner de desbloqueo/fix: owner de ZAL-800. Debe eliminar el secreto del contrato cliente, usar credenciales server-side, hacer que sandbox no llame servicios externos, añadir rechazo estricto de secretos por body/header/query, completar redacción Authorization/Bearer/Basic y reemplazar los tests heredados por positivos/negativos del contrato nuevo. Después corresponde una nueva review independiente de P&S.

## Control plane

Se intentó publicar este informe dos veces; ambos POST devolvieron `curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server`. Se intentó una vez el `PATCH` remoto a `status=done` y devolvió el mismo error. No se reintentará en este heartbeat. Owner de desbloqueo: operador/administración del control plane; acción exacta: restaurar `127.0.0.1:3100`, publicar esta nota como comentario en ZAL-979 y ejecutar el PATCH a `done` con este veredicto. Hasta entonces no se presenta el estado remoto como `done`.

Vault: creada esta nota. No se modificaron `Decisiones.md` ni `Backlog priorizado.md`: no surgió una decisión de negocio ni una deuda distinta del padre ya existente.

## Revalidación de este heartbeat

La inspección fue repetida en el checkout actual el 2026-08-26, run `f7c493ef-6158-4a62-87ba-d965b98a4888`. No se citan commits. Salida literal adicional:

```text
$ pwd -P; git rev-parse --show-toplevel; git rev-parse --short HEAD
/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
df832ab5

$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko log --oneline -1 df832ab5
df832ab5 merge(zal770-recovered): product fixes, motion, dashboard dark mode, business logic

$ pnpm exec vitest run tests/api-zal745-marketplace-communications.test.ts
 ✓ tests/api-zal745-marketplace-communications.test.ts (16 tests) 2050ms
      Tests  16 passed (16)

$ pnpm exec vitest run tests/lib/logger-redaction.test.ts
 ✓ tests/lib/logger-redaction.test.ts (2 tests) 23ms
      Tests  2 passed (2)
```

La salida literal completa de `ls -la`, `wc -l`, `grep -RnE` y `grep -c` está en la sección de evidencia anterior; sus valores fueron repetidos sin discrepancias en este heartbeat: route 35 líneas, página 293, logger 217, test logger 64 y suite contractual 361; conteos `16` y `2`; `grep` encuentra `apiKey` en la route.

## Estado de publicación

El control plane sigue inaccesible en este heartbeat:

```text
PAPERCLIP_API_URL=http://127.0.0.1:3100
control-plane GET /api/agents/me HTTP 000
curl: (7) Failed to connect to 127.0.0.1 port 3100 after 0 ms: Couldn't connect to server
```

Por esa dependencia externa no se pudo publicar el comentario ni persistir la transición remota. Un operador del control plane debe restaurar `127.0.0.1:3100`, publicar esta nota en [ZAL-979](/ZAL/issues/ZAL-979) y cerrar la subtarea con el mismo veredicto adverso. No se reintentará el write en este heartbeat.

Evidencia literal de la nota durable citada arriba:

```text
$ ls -la vault/06-Roadmap-y-Tareas/ZAL-979 verdict P&S ZAL-800 WhatsApp verify 2026-08-26.md
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8784 Aug 26 02:43 vault/06-Roadmap-y-Tareas/ZAL-979 verdict P&S ZAL-800 WhatsApp verify 2026-08-26.md
$ wc -l vault/06-Roadmap-y-Tareas/ZAL-979 verdict P&S ZAL-800 WhatsApp verify 2026-08-26.md
     142 vault/06-Roadmap-y-Tareas/ZAL-979 verdict P&S ZAL-800 WhatsApp verify 2026-08-26.md
```
