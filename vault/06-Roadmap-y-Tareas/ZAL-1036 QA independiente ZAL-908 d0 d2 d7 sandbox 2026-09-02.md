# ZAL-1036 — QA independiente de ZAL-908: d0/d2/d7 sandbox

**Fecha:** 2026-09-02  
**Veredicto:** **BLOCKED / no PASS**  
**Entorno:** checkout local `Zaltyko-fresh`; sin producción, dominios públicos, secretos, datos reales ni Brevo externo.

## Resultado ejecutivo

La evidencia estática y los tests focales confirman el contrato de renderer d0/d2/d7, allowlist HTTPS, locale fallback, enlaces firmados de preferencias/baja y el gate semántico que preserva `fraud_hold`. El flag desactivado deja d2/d7 deshabilitados y no inicia lecturas ni envíos.

La primera pasada quedó bloqueada porque no había PostgreSQL local disponible. En esta revalidación se levantó un PostgreSQL efímero aislado en el scratch del run, se creó una academia/owner sintéticos y se repitió el E2E HTTP local. Ese E2E es favorable, pero el cierre QA sigue bloqueado: Prettier focal falla en 13 archivos y el typecheck actual reporta 3 errores ajenos al flujo, por lo que no corresponde emitir PASS global.

## Matriz de comprobación

| Área | Evidencia | Resultado |
|---|---|---|
| Renderer d0/d2/d7 | `OnboardingOwnerTemplate`, copy es/en, HTML escaping; contrato de integración | Favorable en local |
| Allowlist y rutas | UUID válido, HTTPS obligatorio, host `*.zaltyko.com`, CTA `/app/[academyId]/*` | Favorable en local |
| Locale y enlaces | fallback `pt-BR → es`; URLs firmadas para `/preferences` y `/unsubscribe` | Favorable en local |
| Seguridad | `isAcademyBlockedFromSending`; `suspended`, `churned`, `fraud_hold`; integración sin `update(academies)` | Favorable estático + tests |
| Cron apagado | `processOnboardingOwnerD2/D7` con `ONBOARDING_OWNER_SEQUENCE_ENABLED=false` | `disabled: true`, `scanned/sent/skipped: 0` |
| Brevo | test de configuración y envío; no se hizo llamada externa | Sin evidencia de envío real |
| E2E HTTP + PostgreSQL | Academia sintética en PostgreSQL efímero; flag off/on, auth, validación de paso, dedupe, simulación Brevo y `fraud_hold` | Favorable en sandbox local |
| Formato/typecheck | Prettier focal: 13 archivos; TypeScript: 3 errores ajenos | **Bloqueado** |

## Acción de desbloqueo

Owner: Engineering Lead. Acción exacta: corregir o justificar el formato focal y resolver los 3 errores de typecheck; conservar la receta de PostgreSQL efímero/fixtures sintéticas y después pedir una nueva revisión QA para el veredicto final.

## Evidencia y clasificación

- `L/T`: checkout local y tests Vitest focales.
- `X`: no se ejecutó ninguna llamada a producción, dominio público, Brevo o proveedor externo.
- `H`: no hay validación humana ni peer verification adicional en este issue.

## Revalidación reproducible 2026-09-02

Se ejecutó exclusivamente en localhost/worktree con fixtures UUID sintéticas. El servidor Next.js escuchó en `127.0.0.1:3123`; el PostgreSQL efímero se apagó al terminar.

```text
$ curl -sS -H 'Authorization: Bearer synthetic-cron-secret' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=d2'
{"ok":true,"data":{"step":"d2","scanned":0,"sent":0,"skipped":0,"disabled":true}}
$ curl -sS -H 'Authorization: Bearer synthetic-cron-secret' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=d7'
{"ok":true,"data":{"step":"d7","scanned":0,"sent":0,"skipped":0,"disabled":true}}
$ curl -sS -H 'Authorization: Bearer synthetic-cron-secret' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=bad'
{"ok":false,"error":"INVALID_STEP","code":"INVALID_STEP","message":"step debe ser d2 o d7"}
$ curl -sS -o /dev/null -w 'unauth_status=%{http_code}\n' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=d2'
unauth_status=401

$ curl -sS -H 'Authorization: Bearer synthetic-cron-secret' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=d2'
{"ok":true,"data":{"step":"d2","scanned":1,"sent":1,"skipped":0,"disabled":false}}
$ curl -sS -H 'Authorization: Bearer synthetic-cron-secret' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=d2'
{"ok":true,"data":{"step":"d2","scanned":1,"sent":0,"skipped":1,"disabled":false}}
$ curl -sS -H 'Authorization: Bearer synthetic-cron-secret' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=d7'
{"ok":true,"data":{"step":"d7","scanned":0,"sent":0,"skipped":0,"disabled":false}}
$ psql ... -Atc "select status,is_suspended from academies ..."
sent|onboarding-owner|d2

$ psql ... -c "update academies set status='fraud_hold' ..."
fraud_hold | f
$ curl -sS -H 'Authorization: Bearer synthetic-cron-secret' 'http://127.0.0.1:3123/api/cron/onboarding-owner?step=d2'
{"ok":true,"data":{"step":"d2","scanned":1,"sent":0,"skipped":1,"disabled":false}}
$ psql ... -Atc "select status,is_suspended from academies ..."
fraud_hold|f
```

`sent|onboarding-owner|d2` es un log sintético de la simulación de desarrollo; no hubo llamada a Brevo real.

Evidencia literal de artefactos y conteos:

```text
$ ls -la src/lib/onboarding-owner-integration.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  10403 Aug 29 19:45 src/lib/onboarding-owner-integration.ts
$ wc -l src/lib/onboarding-owner-integration.ts
     333 src/lib/onboarding-owner-integration.ts
$ ls -la src/app/api/cron/onboarding-owner/route.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1210 Aug 26 10:22 src/app/api/cron/onboarding-owner/route.ts
$ wc -l src/app/api/cron/onboarding-owner/route.ts
      36 src/app/api/cron/onboarding-owner/route.ts
$ ls -la src/lib/academy-status.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8688 Sep  2 13:37 src/lib/academy-status.ts
$ wc -l src/lib/academy-status.ts
     289 src/lib/academy-status.ts

$ ls -la tests/onboarding-owner-integration-contract.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3925 Aug 29 19:45 tests/onboarding-owner-integration-contract.test.ts
$ wc -l tests/onboarding-owner-integration-contract.test.ts
     104 tests/onboarding-owner-integration-contract.test.ts
$ ls -la tests/onboarding-owner-flow.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2393 Aug 26 10:22 tests/onboarding-owner-flow.test.ts
$ wc -l tests/onboarding-owner-flow.test.ts
      48 tests/onboarding-owner-flow.test.ts
$ ls -la tests/onboarding-template-helpers.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2097 Aug 23 11:27 tests/onboarding-template-helpers.test.ts
$ wc -l tests/onboarding-template-helpers.test.ts
      61 tests/onboarding-template-helpers.test.ts
$ ls -la tests/onboarding-next-step-urls.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2749 Aug 23 11:27 tests/onboarding-next-step-urls.test.ts
$ wc -l tests/onboarding-next-step-urls.test.ts
      75 tests/onboarding-next-step-urls.test.ts
$ ls -la tests/onboarding-next-step-label.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  3105 Aug 23 11:27 tests/onboarding-next-step-label.test.ts
$ wc -l tests/onboarding-next-step-label.test.ts
      84 tests/onboarding-next-step-label.test.ts
$ ls -la tests/onboarding-email-link-token.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4555 Aug 23 11:27 tests/onboarding-email-link-token.test.ts
$ wc -l tests/onboarding-email-link-token.test.ts
     134 tests/onboarding-email-link-token.test.ts
$ ls -la tests/academy-status.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  15059 Aug 23 11:27 tests/academy-status.test.ts
$ wc -l tests/academy-status.test.ts
     430 tests/academy-status.test.ts
$ ls -la tests/cron-lease-readiness.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2576 Aug 23 11:27 tests/cron-lease-readiness.test.ts
$ wc -l tests/cron-lease-readiness.test.ts
      72 tests/cron-lease-readiness.test.ts
$ ls -la tests/lib/trial-lifecycle.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2913 Aug 23 11:27 tests/lib/trial-lifecycle.test.ts
$ wc -l tests/lib/trial-lifecycle.test.ts
      93 tests/lib/trial-lifecycle.test.ts
$ ls -la tests/lib/brevo.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1307 Aug 23 11:27 tests/lib/brevo.test.ts
$ wc -l tests/lib/brevo.test.ts
      44 tests/lib/brevo.test.ts

$ grep -c "  it(" tests/onboarding-owner-integration-contract.test.ts
5
$ grep -c "  it(" tests/onboarding-owner-flow.test.ts
3
$ grep -c "  it(" tests/onboarding-template-helpers.test.ts
8
$ grep -c "  it(" tests/onboarding-next-step-urls.test.ts
7
$ grep -c "  it(" tests/onboarding-next-step-label.test.ts
8
$ grep -c "  it(" tests/onboarding-email-link-token.test.ts
9
$ grep -c "  it(" tests/academy-status.test.ts
30
$ grep -c "  it(" tests/cron-lease-readiness.test.ts
5
$ grep -c "  it(" tests/lib/trial-lifecycle.test.ts
3
$ grep -c "  it(" tests/lib/brevo.test.ts
2
```

Resultados literales del runner aislado (cada archivo, `Test Files 1 passed`): `5/5`, `3/3`, `8/8`, `7/7`, `8/8`, `9/9`, `30/30`, `5/5`, `3/3` y `2/2`, respectivamente. El comando `pnpm exec vitest ...` no termina en este checkout por un cuelgue del wrapper después del warning de `pnpm`; el runner directo con la misma configuración sí termina. No se usa ese wrapper como prueba de PASS.

Calidad focal:

```text
$ ./node_modules/.bin/eslint [archivos focales]
/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh/src/lib/email/templates/onboarding-owner.tsx
  3:3  warning  'pickLocalized' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)

$ ./node_modules/.bin/prettier --check [archivos focales]
[warn] Code style issues found in 13 files. Run Prettier with --write to fix.

$ ./node_modules/.bin/tsc --noEmit --pretty false
src/app/app/[academyId]/whatsapp/page.tsx(193,7): error TS2741: Property 'apiKey' is missing in type '{ phone: string; isConfigured: boolean; }' but required in type 'WhatsAppConfig'.
src/components/marketplace/MarketplaceForm.tsx(128,11): error TS18004: No value exists in scope for the shorthand property 'userId'. Either declare one or provide an initializer.
src/components/marketplace/MarketplaceForm.tsx(129,11): error TS18004: No value exists in scope for the shorthand property 'sellerType'. Either declare one or provide an initializer.
```

Vault: creada esta nota y añadida una entrada al `Changelog interno.md`; `Decisiones.md` y `Backlog priorizado.md` no cambian porque no se tomó una decisión de producto, pricing o arquitectura.
