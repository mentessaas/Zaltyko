---
status: blocked
owner: Engineering Lead
issue: ZAL-908
date: 2026-08-29
---

# ZAL-908 — Validación local y bloqueo de sandbox

## Disposición

**Blocked:** la integración local de d0/d2/d7 queda comprobada en tests focales y
smoke HTTP negativo, pero no es posible emitir una validación sandbox positiva con
academia sintética. El control plane `127.0.0.1:3100` no está disponible y no hay
un runtime sandbox gobernado ni `secret_ref` entregado para DB/cron. No se activan
envíos.

Owner del desbloqueo: Platform & Security / operador de runtime.

Acción exacta: proporcionar un runtime sandbox aislado, una academia sintética y
los `secret_ref` autorizados de DB y `CRON_SECRET`; después QA debe ejecutar el
E2E HTTP d0/d2/d7 con `ONBOARDING_OWNER_SEQUENCE_ENABLED=false` y verificar que
no salen envíos, y repetirlo con el flag controlado en sandbox sin datos reales.

## Alcance integrado observado

- `academy_created` llama al integrador d0 y el flag mantiene el envío apagado por
  defecto; los errores de delivery no deshacen la academia.
- El renderer usa el siguiente pendiente del checklist, rutas `/app/{academyId}`
  allowlisted, fallback de locale `es`, escape HTML y enlaces HMAC de preferencias
  y baja en cada ventana d0/d2/d7.
- El gate consulta `isAcademyBlockedFromSending` y no limpia estados `suspended`,
  `churned` ni `fraud_hold`; la baja normalizada por email suprime los siguientes
  pasos.
- El cron d2/d7 exige autenticación y lease; su flag permanece fail-closed sin
  configuración autorizada.

## Evidencia literal de archivos

```text
$ ls -la src/lib/onboarding-owner-integration.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10619 Aug 29 07:33 src/lib/onboarding-owner-integration.ts
$ wc -l src/lib/onboarding-owner-integration.ts
     342 src/lib/onboarding-owner-integration.ts
$ ls -la src/lib/email/allowlist.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2882 Aug 28 21:25 src/lib/email/allowlist.ts
$ wc -l src/lib/email/allowlist.ts
      98 src/lib/email/allowlist.ts
$ ls -la src/lib/email/templates/onboarding-owner.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5312 Aug 26 10:22 src/lib/email/templates/onboarding-owner.tsx
$ wc -l src/lib/email/templates/onboarding-owner.tsx
     134 src/lib/email/templates/onboarding-owner.tsx
$ ls -la src/app/api/onboarding/owner/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  14378 Aug 28 21:20 src/app/api/onboarding/owner/route.ts
$ wc -l src/app/api/onboarding/owner/route.ts
     453 src/app/api/onboarding/owner/route.ts
$ ls -la src/app/api/cron/onboarding-owner/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1210 Aug 26 10:22 src/app/api/cron/onboarding-owner/route.ts
$ wc -l src/app/api/cron/onboarding-owner/route.ts
      36 src/app/api/cron/onboarding-owner/route.ts
$ ls -la tests/onboarding-owner-integration-contract.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4093 Aug 29 07:36 tests/onboarding-owner-integration-contract.test.ts
$ wc -l tests/onboarding-owner-integration-contract.test.ts
     107 tests/onboarding-owner-integration-contract.test.ts
$ ls -la tests/onboarding-owner-integration-behavior.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4818 Aug 29 07:24 tests/onboarding-owner-integration-behavior.test.ts
$ wc -l tests/onboarding-owner-integration-behavior.test.ts
     170 tests/onboarding-owner-integration-behavior.test.ts
$ ls -la tests/api/onboarding-email-preferences.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3084 Aug 29 07:34 tests/api/onboarding-email-preferences.test.ts
$ wc -l tests/api/onboarding-email-preferences.test.ts
     116 tests/api/onboarding-email-preferences.test.ts
$ ls -la src/components/dashboard/KPISection.tsx
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3484 Aug 26 11:16 src/components/dashboard/KPISection.tsx
$ wc -l src/components/dashboard/KPISection.tsx
     128 src/components/dashboard/KPISection.tsx
```

Conteo literal de casos:

```text
$ grep -c "  it(" tests/onboarding-owner-integration-contract.test.ts
5
$ grep -c "  it(" tests/onboarding-owner-integration-behavior.test.ts
3
$ grep -c "  it(" tests/api/onboarding-email-preferences.test.ts
3
```

## Tests focales

Se usó el pnpm 9.15.3 instalado localmente mediante el PATH explícito, porque el
shim `pnpm` por defecto intenta verificar una versión firmada sin acceso al
registry. La salida literal de Vitest es:

```text
$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/onboarding-owner-integration-contract.test.ts 2>&1 | tail -30
 RUN v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ tests/onboarding-owner-integration-contract.test.ts (5 tests) 89ms
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/onboarding-owner-integration-behavior.test.ts 2>&1 | tail -30
 RUN v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ tests/onboarding-owner-integration-behavior.test.ts (3 tests) 107ms
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/api/onboarding-email-preferences.test.ts 2>&1 | tail -30
 RUN v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ tests/api/onboarding-email-preferences.test.ts (3 tests) 133ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

El lint focal terminó con `eslint_exit=0`. El typecheck global no es evidencia de
PASS: queda un error preexistente/ajeno en
`src/components/dashboard/KPISection.tsx(115,11)` por la prop `valueSuffix` no
declarada en `DashboardCardProps`.

## Smoke HTTP local

El servidor local se levantó únicamente en `127.0.0.1:3000`. Con valores sintéticos
y sin sesión:

```text
GET /api/cron/onboarding-owner?step=d2
HTTP/1.1 503 Service Unavailable
{"ok":false,"error":"CRON_NOT_CONFIGURED","code":"CRON_NOT_CONFIGURED","message":"Cron authentication is not configured"}

POST /api/onboarding/owner {}
HTTP/1.1 401 Unauthorized
{"ok":false,"error":"UNAUTHENTICATED","code":"UNAUTHENTICATED","message":"Debes iniciar sesión para completar la configuración"}

GET /api/preferences
HTTP/1.1 400 Bad Request
{"ok":false,"error":"TOKEN_REQUIRED","code":"TOKEN_REQUIRED","message":"Token requerido en query string"}

GET /app/11111111-1111-4111-8111-111111111111/{athletes/new,groups,classes,coaches,settings?tab=billing,comms}
307 -> http://127.0.0.1:3000/auth/login
```

Estos smokes prueban fail-closed y existencia de destinos; no prueban login,
persistencia, Brevo ni una academia sintética. No se consultaron ni copiaron
secretos, no se hicieron mutaciones, envíos, migraciones remotas, Stripe live ni
publicaciones externas. Next cargó el entorno local sin exponer sus valores; como
no se inspeccionó el destino de ese entorno, esta ejecución no se clasifica como
sandbox ni producción y no se presenta como evidencia externa. Platform & Security
debe confirmar el runtime aislado antes del E2E positivo.

Vault: creada esta nota de work product; no se modifica pricing, copy aprobado ni
`Decisiones.md` porque no hubo una decisión de negocio.
