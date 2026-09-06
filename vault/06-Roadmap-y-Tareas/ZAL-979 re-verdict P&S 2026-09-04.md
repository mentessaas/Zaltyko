# ZAL-979 — Re-veredicto P&S (audit ZAL-800 WhatsApp verify)

**Autor:** Platform & Security (`6909a098-7ef1-49e6-898c-2c8fb18183e6`)
**Fecha:** 2026-09-04
**Run Paperclip:** `76f860c5-43dc-40e8-b1c9-2a4dc79cf207`
**Checkout auditado:** `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh` (HEAD `d17f446cfc2f5fa0a420e960e2073cae71bf0217`)
**Trigger:** board-poke por heartbeat stale >30min; ZAL-979 sigue en `todo` (label `process` aplicada por CEO 2026-09-04T01:46:07Z).

---

## Veredicto

**PASS.** El contrato de `POST /api/whatsapp/verify` cumple los tres requisitos de la auditoría ZAL-770:

1. **Body estricto sin secretos del cliente.** `verifySchema = z.object({phone, academyId?}).strict()` rechaza cualquier clave ajena antes de cualquier parseo de credenciales.
2. **Credenciales únicamente server-side.** `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` se resuelven desde `process.env` (paridad con `send/route.ts:215-221` y `lib/whatsapp.ts:10-12`).`).
3. **Triple rechazo de claves de credencial.** `getCredentialInputKeys()` barre body + query + headers con regex `/(?:^|[-_])api[-_]?key$/i` y devuelve 400 antes de contactar Twilio.
4. **Consumer `WhatsAppPage.tsx` no envía credenciales.** `handleVerifyConnection` envía únicamente `{phone, academyId}`.
6. **Logger redacta Authorization/Bearer/Basic/secret/apiKey/password/token** (regex `SENSITIVE_KEY_PATTERN`) con test verde.

Los tres tests focales pasan: `tests/api-zal745-marketplace-communications.test.ts` (18 tests, incluye 4 escenarios de verify: server-side success, sin credenciales simulado, body con clave heredada, query+header con clave heredada) y `tests/lib/logger-redaction.test.ts` (3 tests).

---

## Evidencia literal (ejecutada en este checkout)

### 1. Archivos auditados

```
$ ls -la -- src/app/api/whatsapp/verify/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3608 Aug 31 16:03 src/app/api/whatsapp/verify/route.ts
$ wc -l -- src/app/api/whatsapp/verify/route.ts
     118 src/app/api/whatsapp/verify/route.ts

$ ls -la -- 'src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx'
-rw-r--r--@ 1 elvisvaldesinerarte  staff 10017 Sep  2 13:37 'src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx'
$ wc -l -- 'src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx'
     293 'src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx'

$ ls -la -- src/lib/logger.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6675 Sep  2 13:37 src/lib/logger.ts
$ wc -l -- src/lib/logger.ts
     239 src/lib/logger.ts

$ ls -la -- tests/lib/logger-redaction.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2555 Sep  2 13:37 tests/lib/logger-redaction.test.ts
$ wc -l -- tests/lib/logger-redaction.test.ts
      75 tests/lib/logger-redaction.test.ts

$ ls -la -- tests/api-zal745-marketplace-communications.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff 16238 Aug 31 16:03 tests/api-zal745-marketplace-communications.test.ts
$ wc -l -- tests/api-zal745-marketplace-communications.test.ts
     428 tests/api-zal745-marketplace-communications.test.ts
```

### 2. Conteos de tests

```
$ grep -c "  it(" tests/api-zal745-marketplace-communications.test.ts
18
$ grep -c "  it(" tests/lib/logger-redaction.test.ts
3
```

### 3. Grep de claves de credencial en el handler

```
$ grep -RnE '(apiKey|api_key|Authorization|Bearer)' src/app/api/whatsapp/verify/route.ts
src/app/api/whatsapp/verify/route.ts:84:            Authorization: `Basic ${basicAuth}`,
```

Único hit: `Authorization: Basic <credenciales-server-side>` (línea 84) hacia Twilio upstream usando credenciales resueltas server-side. No hay `apiKey`/`api_key` del cliente aceptado por body, query ni header.

### 4. Grep de `apiKey` en el consumer

```
$ grep -nE '(apiKey|api_key|Authorization|Bearer)' src/app/app/[academyId]/whatsapp/WhatsAppPage.tsx
14:  apiKey: string;
101:        whatsappApiKey: config.apiKey,
267:                apiKey: config.apiKey,
274:                  apiKey: newSettings.apiKey,
```

Estos `apiKey` están **dentro** del estado del componente (state variable) y se usan solo para `PATCH /api/academies/{id}/settings` (persistencia server-side), NO se envían a `/api/whatsapp/verify`. El handler `handleVerifyConnection` (líneas 87–96) envía solo `{phone, academyId}`.

### 5. Suite focal ejecutada

```
$ pnpm exec vitest run tests/api-zal745-marketplace-communications.test.ts tests/lib/logger-redaction.test.ts

 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ |web| tests/api-zal745-marketplace-communications.test.ts (18 tests) 2778ms
 ✓ |web| tests/lib/logger-redaction.test.ts (3 tests) 14ms

 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  03:47:41
   Duration  6.31s
```

### 6. Estado de HEAD / merge markers

```
$ git log --oneline -1
d17f446c fix(test): separate web and mobile vitest projects
$ git diff --check
(sin output = limpio)
$ git grep -lE '^(<<<<<<<|=======|>>>>>>>)' HEAD
(sin output = sin marcadores de merge)
```

### 7. Estado del issue / gate

- Issue `c261d36b-9010-4f50-a6cf-7acba35b7ecd` (ZAL-979): status=`todo`, label `process` aplicada (id `19b02861-cddb-48c9-bc07-3360c58fc0c7`), bloqueador nulo.
- Exención no-code aplicada por CEO en ZAL-1214 (status `done` 2026-09-04).
- PATCH `status=done` reintentado en este heartbeat con JWT agent-actor firmado (`run_id=76f860c5...`) + `X-Paperclip-Agent-Id` + `X-Paperclip-Run-Id`: el control plane devolvió `403 cross_issue_influence_run_context_required`. Causa: este run es `board-poke: heartbeat stale`, sin `contextSnapshot.issueId` (verificado en DB). El gate es per-issue-woken.

---

## Acciones pendientes

- **Owner:** un run woken por ZAL-979 (con `contextSnapshot.issueId === c261d36b...`) debe ejecutar el `PATCH status=done` reutilizando la evidencia de este vault doc. La API ya tiene el JWT y los headers correctos (verificados contra el endpoint), solo falta el run woken por la issue target.
- Workaround sancionado per `feedback_cross_issue_cap_vault_fallback.md`: el delta (este verdict + evidencia) queda en vault filesystem y el próximo run woken por la issue lo trasladará al thread + PATCH.
- Sin cambios pendientes en código: el contrato de ZAL-800 cumple la auditoría. ZAL-979 puede cerrarse sin acción técnica adicional.

---

Refs: ZAL-770, ZAL-800, ZAL-1214, ZAL-88.
