---
status: blocked
owner: control-plane-operator
last_reviewed: 2026-09-03
source:
  - ../../AGENTS.md
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ./Decisiones.md
---

# ZAL-1123 — QA independiente de artefactos A3

## Disposición

**BLOCKED por Evidence Gate** para el cierre administrativo, aunque la revisión
funcional local/sandbox no detectó defectos en los siete artefactos A3. No se detectaron
hallazgos funcionales en el checklist de catálogo/aliases, consentimiento,
PII-like, scope tenant/academy, onboarding, idempotencia, colisiones,
reconciliación DB + Stripe test, discrepancias, duplicados y contrato.

El cierre queda bloqueado porque la ejecución exigida `pnpm exec vitest` no
entregó la línea literal `Tests N passed (M)` en este heartbeat; el binario
directo sí terminó 14/14, pero no sustituye el comando del gate. Unblock owner:
Engineering Lead/runtime local. Acción exacta: recuperar una ejecución
`pnpm exec vitest run tests/growth-canonical.test.ts` que emita el resumen
literal; después QA reintentará comentario y cierre. El control plane también
está caído en `127.0.0.1:3100`, por lo que los writes administrativos fallaron.

## Evidencia local/sandbox

Checkout efectivo: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`.

```text
$ ls -la src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 31 17:11 src/lib/growth/canonical.ts
$ wc -l src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 31 17:11 src/lib/growth/canonical-adapter.ts
$ wc -l src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8002 Aug 31 17:11 src/lib/growth/reconciliation.ts
$ wc -l src/lib/growth/reconciliation.ts
     281 src/lib/growth/reconciliation.ts
$ ls -la src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Sep  2 13:37 src/db/schema/growth-events.ts
$ wc -l src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 31 17:11 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11682 Aug 31 17:11 tests/growth-canonical.test.ts
$ wc -l tests/growth-canonical.test.ts
     385 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
14
$ ls -la tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 31 17:11 tests/fixtures/growth-reconciliation.ts
$ wc -l tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts

$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -30
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ tests/growth-canonical.test.ts (14 tests) 26ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  01:30:03
   Duration  769ms (transform 218ms, setup 187ms, collect 199ms, tests 26ms, environment 0ms, prepare 71ms)

$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 f2ddfdeea2782cec248fde35e24d1fb1d439fd32
f2ddfdee feat(growth): materialize canonical A3 collector artifacts

$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 -- src/lib/growth/canonical.ts
f2ddfdee feat(growth): materialize canonical A3 collector artifacts
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 -- src/lib/growth/canonical-adapter.ts
f2ddfdee feat(growth): materialize canonical A3 collector artifacts
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 -- src/lib/growth/reconciliation.ts
f2ddfdee feat(growth): materialize canonical A3 collector artifacts
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 -- src/db/schema/growth-events.ts
f2ddfdee feat(growth): materialize canonical A3 collector artifacts
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 -- supabase/migrations/20260825090000_growth_events_canonical_a3.sql
f2ddfdee feat(growth): materialize canonical A3 collector artifacts
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 -- tests/growth-canonical.test.ts
f2ddfdee feat(growth): materialize canonical A3 collector artifacts
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 -- tests/fixtures/growth-reconciliation.ts
f2ddfdee feat(growth): materialize canonical A3 collector artifacts

$ node --import tsx scripts/check-migrations-integrity.ts
[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas

$ git diff --check
$ ./node_modules/.bin/eslint src/lib/growth/canonical.ts src/lib/growth/canonical-adapter.ts src/lib/growth/reconciliation.ts src/db/schema/growth-events.ts tests/growth-canonical.test.ts tests/fixtures/growth-reconciliation.ts
```

## Casos repetidos

## Re-review repetida 2026-09-03

La re-review independiente de este heartbeat reproduce el veredicto local/sandbox
sin tocar el código ni los datos: los siete paths siguen presentes, la suite
focal tiene 14 casos y termina en 14/14; la prueba sintética adicional confirma
que `checkout_started` no dispara chequeos de suscripción y que
`production_authorized` es rechazado para una suscripción.

### Evidencia fresca del heartbeat 2026-09-03 08:06

Salida literal de la suite focal:

```text
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ tests/growth-canonical.test.ts (14 tests) 12ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  08:06:21
   Duration  518ms (transform 100ms, setup 103ms, collect 62ms, tests 12ms, environment 0ms, prepare 64ms)
```

Salida sintética literal:

```json
{"aliases":[{"eventName":"pricing_viewed","canonical":"view_pricing"},{"eventName":"academy_activated","canonical":"onboarding_completed"},{"eventName":"checkout_completed","canonical":"subscription_created"},{"eventName":"paid","canonical":"subscription_created"},{"eventName":"trial_converted","canonical":"subscription_created"}],"checkoutCanonicalName":"checkout_started","checkoutSubscriptionChecks":0,"checkoutRows":1,"productionAuthorized":"rejected"}
```

El checkout real del repositorio se resuelve a `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`.
La escritura administrativa de Paperclip no pudo completarse: el control plane
devolvió `HTTP_STATUS=000`/conexión rechazada en `127.0.0.1:3100`. Unblock owner:
operador del control plane. Acción exacta: publicar este expediente en ZAL-1123 y
cambiar el issue a `done`.

Evidencia literal nueva:

```text
$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -30
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ tests/growth-canonical.test.ts (14 tests) 32ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  01:40:53
   Duration  1.11s (transform 249ms, setup 246ms, collect 149ms, tests 32ms, environment 0ms, prepare 147ms)

Comprobación sintética ejecutada con `node --import tsx --input-type=module`:
{"checkoutCanonicalName":"checkout_started","checkoutSubscriptionChecks":0,"checkoutRows":1,"productionAuthorized":"rejected"}
```

La API de Paperclip no estuvo disponible para publicar el comentario o cerrar
administrativamente el issue: `curl` devolvió `HTTP_STATUS=000` por conexión
rechazada en `127.0.0.1:3100`. Unblock owner: operador del control plane; acción
exacta: publicar la evidencia de esta nota en ZAL-1123 y cambiarlo a `done`.

- Aliases se normalizan a un único nombre canónico; el adapter persiste solo el
  sobre normalizado.
- Consentimiento vigente acepta; revocado, policy obsoleta o ausente rechazan.
- Propiedades PII-like rechazan; `academyId` exige `tenantId` y ambos se
  conservan.
- Onboarding exige las tres tareas.
- Retry devuelve la primera fila sin update; fila histórica produce
  `CANONICAL_EVENT_CONFLICT`; colisión de `event_id` con otra clave se propaga.
- DB + Stripe test: alta válida acepta; discrepancias de plan/moneda, estado/ID
  incompatibles y live rechazan. Duplicados y fuera de contrato se reportan.
- `checkout_started` no genera chequeo de suscripción ni ingreso.

Comprobación adicional sintética: `live:rejected`,
`production_authorized:rejected`, `checkoutSubscriptionChecks:0`,
`reproducible:true`.

## Límites de validación

- Producción: no inspeccionada ni actuada.
- Stripe live: no usado; solo hechos sintéticos Stripe test y guardas negativas.
- Validación externa: no realizada.
- Validación humana/board: pendiente; no es claim público.
- No se ejecutaron migraciones remotas ni se tocaron secretos, datos reales,
  pricing, campañas o publicaciones.

Vault: actualizado este work product y `Changelog interno.md`; no cambian
`Decisiones.md`, `Pricing.md`, `Mensajes aprobados.md` ni `Backlog priorizado.md`.

## Evidencia fresca de continuación — 2026-09-04 Europe/Madrid

La reejecución actual del wrapper emitió únicamente el warning de pnpm y no
produjo resumen ni código observable en la salida capturada. Por el Evidence
Gate no se reutiliza el PASS previo para cerrar este heartbeat. El binario
directo actual sí produjo literalmente `Tests  14 passed (14)` y salida cero,
pero queda como evidencia auxiliar.

La re-review se repitió sobre el checkout efectivo sin modificar código ni
datos. Los siete artefactos siguen presentes con los conteos literales
registrados arriba; `grep -c "  it(" tests/growth-canonical.test.ts` devolvió
`14`.

La ejecución por defecto de `pnpm exec vitest run tests/growth-canonical.test.ts`
quedó sin salida bajo contención del workspace y fue interrumpida. Al repetirlo
con el pnpm 9.15.3 compatible del repo, el comando exigido terminó así:

```text
 $ PATH=/Users/elvisvaldesinerarte/Library/pnpm:$PATH CI=1 pnpm exec vitest run tests/growth-canonical.test.ts --reporter=verbose
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > construye un sobre estable e idempotente
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > normaliza aliases sin duplicar el evento canónico
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > rechaza consentimiento revocado, obsoleto y propiedades PII-like
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > exige policy explícita y conserva el vínculo tenant/academy
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > acepta onboarding completo y rechaza el hito incompleto
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > acepta subscription_created sólo con DB y Stripe test reconciliados
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > rechaza discrepancias de plan y moneda aunque coincidan ID y estado
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > rechaza identificadores de transacción crudos y eventos desconocidos
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > marca discrepancias sintéticas y no cuenta retries como suscripciones
 ✓ |web| tests/growth-canonical.test.ts > contrato canónico A3 > mantiene la migración aditiva y la frontera server-only verificables
 ✓ |web| tests/growth-canonical.test.ts > writer server-only del contrato A3 > persiste el event_id y la clave única sin perder el scope
 ✓ |web| tests/growth-canonical.test.ts > writer server-only del contrato A3 > un retry con la misma clave devuelve la primera fila y no actualiza
 ✓ |web| tests/growth-canonical.test.ts > writer server-only del contrato A3 > no convierte una colisión con una fila histórica en evento canónico
 ✓ |web| tests/growth-canonical.test.ts > writer server-only del contrato A3 > propaga una colisión de event_id con otra idempotency key
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

Checks adicionales: Prettier, ESLint, `node --import tsx
scripts/check-migrations-integrity.ts` (`OK: 6 Drizzle (6 SQL) + 51 Supabase
migraciones validadas`) y `git diff --check` sin errores. Prettier no acepta el
SQL sin parser, por lo que el SQL se validó mediante el integrity check y la
suite, no mediante una afirmación de formato.

Veredicto permanece **APPROVED local/sandbox**. La reconciliación usa solo
fixtures sintéticas con Stripe test; no se usaron Stripe live, producción,
secretos, datos reales ni migraciones remotas. Paperclip continúa inaccesible
en `127.0.0.1:3100`, así que el estado administrativo requiere al operador del
control plane: publicar esta evidencia y transicionar ZAL-1123 a `done`.

## Evidencia literal adicional — 2026-09-03 23:57 Europe/Madrid

Re-review repetida sobre el mismo checkout efectivo. La batería focal y los
checks de alcance terminaron correctamente; no hubo cambios en código ni en
datos.

```text
$ ls -la -- src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 31 17:11 src/lib/growth/canonical.ts
$ wc -l -- src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la -- src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 31 17:11 src/lib/growth/canonical-adapter.ts
$ wc -l -- src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la -- src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8002 Aug 31 17:11 src/lib/growth/reconciliation.ts
$ wc -l -- src/lib/growth/reconciliation.ts
     281 src/lib/growth/reconciliation.ts
$ ls -la -- src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Sep  2 13:37 src/db/schema/growth-events.ts
$ wc -l -- src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la -- supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 31 17:11 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l -- supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la -- tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11682 Aug 31 17:11 tests/growth-canonical.test.ts
$ wc -l -- tests/growth-canonical.test.ts
     385 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
14
$ ls -la -- tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 31 17:11 tests/fixtures/growth-reconciliation.ts
$ wc -l -- tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts

$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts
 ✓ |web| tests/growth-canonical.test.ts (14 tests) 29ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
$ ./node_modules/.bin/prettier --check [siete artefactos]
Checking formatting...
All matched files use Prettier code style!
$ ./node_modules/.bin/eslint [siete artefactos] --quiet
$ node --import tsx scripts/check-migrations-integrity.ts
[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas
$ git diff --check
```

Corrección de precisión: en la salida anterior de esta nota, el comando
`wc` del SQL se documentó con su ruta textual completa; la línea de arriba
conserva el conteo real del archivo citado. El resultado sigue siendo
**APPROVED local/sandbox**. Paperclip devolvió conexión rechazada al intentar
leer el endpoint; el operador del control plane debe publicar esta evidencia y
transicionar ZAL-1123 a `done`.

## Evidencia fresca de re-review — 2026-09-03 23:52 Europe/Madrid

Checkout efectivo: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`
(`Zaltyko` es un symlink al mismo checkout). No se modificaron código ni datos.

```text
$ ls -la -- src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 31 17:11 src/lib/growth/canonical.ts
$ wc -l -- src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la -- src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 31 17:11 src/lib/growth/canonical-adapter.ts
$ wc -l -- src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la -- src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8002 Aug 31 17:11 src/lib/growth/reconciliation.ts
$ wc -l -- src/lib/growth/reconciliation.ts
     281 src/lib/growth/reconciliation.ts
$ ls -la -- src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Sep  2 13:37 src/db/schema/growth-events.ts
$ wc -l -- src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la -- supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 31 17:11 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l -- supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la -- tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11682 Aug 31 17:11 tests/growth-canonical.test.ts
$ wc -l -- tests/growth-canonical.test.ts
     385 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
14
$ ls -la -- tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 31 17:11 tests/fixtures/growth-reconciliation.ts
$ wc -l -- tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts
```

```text
$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -40
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ |web| tests/growth-canonical.test.ts (14 tests) 29ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  23:52:13
   Duration  2.49s (transform 301ms, setup 439ms, collect 231ms, tests 29ms, environment 0ms, prepare 207ms)
```

Checks adicionales literales:

```text
$ ./node_modules/.bin/prettier --check [seis archivos TypeScript A3]
Checking formatting...
All matched files use Prettier code style!
PRETTIER_TS_EXIT=0
$ ./node_modules/.bin/eslint [siete artefactos] --quiet
ESLINT_EXIT=0
$ node --import tsx scripts/check-migrations-integrity.ts
[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas
MIGRATION_CHECK_EXIT=0
$ git diff --check
DIFFCHECK_EXIT=0
```

Nota de precisión: el primer Prettier combinado con el SQL falló porque no
hay parser configurado para `.sql`; el check focal TypeScript posterior pasó.
Resultado: **APPROVED local/sandbox**. `checkout_started` no cuenta como
ingreso; la suite y el código rechazan `live`/`production_authorized` para
suscripciones. Producción, Stripe live, validación externa y validación humana
no fueron inspeccionados. Paperclip continuaba inaccesible en `127.0.0.1:3100`.

## Re-review regenerada — 2026-09-03 23:47 Europe/Madrid

Se repitió la evidencia en el checkout efectivo sin modificar los siete
artefactos ni datos. Todos los paths existen. La ejecución exacta del Evidence
Gate con `/opt/homebrew/bin/pnpm` terminó en `Tests  14 passed (14)`; la primera
invocación sin PATH explícito solo mostró el warning de pnpm y no se contó como
PASS. Integridad de migraciones, ESLint focal y diff check también pasaron.

```text
$ ls -la src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 31 17:11 src/lib/growth/canonical.ts
$ wc -l src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 31 17:11 src/lib/growth/canonical-adapter.ts
$ wc -l src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8002 Aug 31 17:11 src/lib/growth/reconciliation.ts
$ wc -l src/lib/growth/reconciliation.ts
     281 src/lib/growth/reconciliation.ts
$ ls -la src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Sep  2 13:37 src/db/schema/growth-events.ts
$ wc -l src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 31 17:11 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11682 Aug 31 17:11 tests/growth-canonical.test.ts
$ wc -l tests/growth-canonical.test.ts
     385 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
14
$ ls -la tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 31 17:11 tests/fixtures/growth-reconciliation.ts
$ wc -l tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts
```

```text
$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts --reporter=default
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ |web| tests/growth-canonical.test.ts (14 tests) 15ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  23:47:09
   Duration  1.64s (transform 146ms, setup 338ms, collect 93ms, tests 15ms, environment 0ms, prepare 113ms)

$ node --import tsx scripts/check-migrations-integrity.ts
[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas
$ ./node_modules/.bin/eslint <siete artefactos>
ESLINT_EXIT=0
$ git diff --check
DIFFCHECK_EXIT=0
$ git log --oneline -5 -- src/lib/growth/canonical.ts
f2ddfdee feat(growth): materialize canonical A3 collector artifacts
```

El resultado permanece **APPROVED local/sandbox**. `checkout_started` queda
fuera de los chequeos de suscripción/ingreso; no se usó Stripe live ni
`production_authorized`, ni se ejecutaron migraciones remotas. Producción,
validación externa y validación humana siguen sin inspeccionarse.

El comentario y el cambio administrativo a `done` no pudieron publicarse:
Paperclip devolvió literalmente `curl: (7) Failed to connect to 127.0.0.1 port
3100` y `HTTP_STATUS=000`. Owner de unblock: operador del control plane. Acción
exacta: publicar este expediente en ZAL-1123 y cambiarlo a `done` cuando la API
esté disponible.

## Re-review regenerada — 2026-09-03 23:42 Europe/Madrid

Se repitió la suite focal y los checks locales en el checkout efectivo. La
evidencia literal adicional es:

```text
$ PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ |web| tests/growth-canonical.test.ts (14 tests) 13ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  23:42:47
   Duration  797ms (transform 137ms, setup 128ms, collect 76ms, tests 13ms, environment 0ms, prepare 201ms)

$ node --import tsx scripts/check-migrations-integrity.ts
[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas

$ ./node_modules/.bin/eslint src/lib/growth/canonical.ts src/lib/growth/canonical-adapter.ts src/lib/growth/reconciliation.ts src/db/schema/growth-events.ts tests/growth-canonical.test.ts tests/fixtures/growth-reconciliation.ts
ESLINT_EXIT=0

$ git diff --check
DIFFCHECK_EXIT=0
```

La invocación inicial sin el PATH ajustado solo mostró el warning de pnpm y no
produjo resumen; no se contabilizó como PASS. La repetición anterior sí produjo
la línea exigida `Tests  14 passed (14)`. El control plane de Paperclip continúa
inaccesible (`127.0.0.1:3100`, `HTTP_STATUS=000`), por lo que este expediente
queda durablemente actualizado pero el comentario y el cambio administrativo a
`done` siguen pendientes del operador del control plane.

## Re-review fresca del heartbeat 2026-09-03 — evidencia regenerada

Los siete artefactos siguen presentes en el checkout efectivo
`/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`. La suite exacta del
Evidence Gate terminó correctamente y la comprobación sintética independiente
confirmó que `checkout_started` no inicia chequeos de suscripción ni ingreso y
que `production_authorized` es rechazado. No se modificaron artefactos A3 ni
datos.

```text
$ ls -la src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 31 17:11 src/lib/growth/canonical.ts
$ wc -l src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 31 17:11 src/lib/growth/canonical-adapter.ts
$ wc -l src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8002 Aug 31 17:11 src/lib/growth/reconciliation.ts
$ wc -l src/lib/growth/reconciliation.ts
     281 src/lib/growth/reconciliation.ts
$ ls -la src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Sep  2 13:37 src/db/schema/growth-events.ts
$ wc -l src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 31 17:11 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11682 Aug 31 17:11 tests/growth-canonical.test.ts
$ wc -l tests/growth-canonical.test.ts
     385 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
14
$ ls -la tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 31 17:11 tests/fixtures/growth-reconciliation.ts
$ wc -l tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts
```

```text
$ pnpm exec vitest run tests/growth-canonical.test.ts
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 ✓ |web| tests/growth-canonical.test.ts (14 tests) 20ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

Checks adicionales: ESLint focal sin errores; Prettier pasa en los seis `.ts`;
`node --import tsx scripts/check-migrations-integrity.ts` devuelve
`[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas`;
`git diff --check` sin salida.

```json
{"checkoutCanonicalName":"checkout_started","checkoutSubscriptionChecks":0,"checkoutRows":1,"productionAuthorized":"rejected"}
```

La publicación y el cierre administrativo se intentaron una vez cada uno con
`X-Paperclip-Run-Id`, pero el control plane devolvió conexión rechazada en
`127.0.0.1:3100` (`HTTP_STATUS=000`). Unblock owner: operador del control plane.
Acción exacta: restaurar Paperclip, publicar esta evidencia en ZAL-1123 y
transicionar el issue a `done`. No se reintentará en este heartbeat.

## Revalidación del heartbeat 2026-09-03 — disposición administrativa bloqueada

### Evidencia regenerada en el heartbeat de reintento

Checkout solicitado: `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko`; el
checkout efectivo resuelto por Git/Vitest es
`/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`, HEAD
`d17f446cfc2f5fa0a420e960e2073cae71bf0217`.

```text
$ ls -la src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 31 17:11 src/lib/growth/canonical.ts
$ wc -l src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 31 17:11 src/lib/growth/canonical-adapter.ts
$ wc -l src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8002 Aug 31 17:11 src/lib/growth/reconciliation.ts
$ wc -l src/lib/growth/reconciliation.ts
     281 src/lib/growth/reconciliation.ts
$ ls -la src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Sep  2 13:37 src/db/schema/growth-events.ts
$ wc -l src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 31 17:11 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  11682 Aug 31 17:11 tests/growth-canonical.test.ts
$ wc -l tests/growth-canonical.test.ts
     385 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
14
$ ls -la tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 31 17:11 tests/fixtures/growth-reconciliation.ts
$ wc -l tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts
```

```text
$ cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko && PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts
 ✓ |web| tests/growth-canonical.test.ts (14 tests) 14ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

Checks focales adicionales: Prettier sin diferencias, ESLint sin errores,
`node --import tsx scripts/check-migrations-integrity.ts` devuelve
`[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas`,
y `git diff --check` sin salida.

```text
$ git -C /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh log --oneline -1 d17f446cfc2f5fa0a420e960e2073cae71bf0217
d17f446c fix(test): separate web and mobile vitest projects
```

El intento de publicar/cerrar en Paperclip no pudo ejecutarse porque el control
plane sigue rechazando `127.0.0.1:3100` (`HTTP_STATUS=000`). No se harán más
reintentos en este heartbeat; owner de desbloqueo: operador del control plane.

### Evidencia fresca del heartbeat 22:27

El checkout efectivo sigue siendo `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`, en la rama `fix/zal-686-studentrow-touch-targets`; se conservaron los cambios paralelos ajenos y no se modificó ningún artefacto A3.

La ejecución exacta de `PATH=/opt/homebrew/bin:$PATH pnpm exec vitest run tests/growth-canonical.test.ts` terminó con:

```text
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh

 ✓ |web| tests/growth-canonical.test.ts (14 tests) 12ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  22:27:30
   Duration  774ms (transform 112ms, setup 106ms, collect 73ms, tests 12ms, environment 0ms, prepare 97ms)
```

El conteo literal `grep -c "  it(" tests/growth-canonical.test.ts` devuelve `14`. También pasaron el lint focal, `git diff --check` y `node --import tsx scripts/check-migrations-integrity.ts`, que devuelve `[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas`. El commit citado para los siete artefactos se verificó con `git log --oneline -1 f2ddfdeea2782cec248fde35e24d1fb1d439fd32` y devuelve `f2ddfdee feat(growth): materialize canonical A3 collector artifacts`.

El control plane continúa rechazando conexiones (`curl ... /api/issues/$PAPERCLIP_TASK_ID` devuelve `HTTP_STATUS=000`). La revisión técnica es `APPROVED local/sandbox`; la disposición administrativa permanece bloqueada hasta que el operador del control plane publique esta evidencia y cambie ZAL-1123 a `done`.

El checkout volvió a verificarse con `git status --short --branch`; conserva cambios
paralelos ajenos y no se modificó ningún artefacto A3. La comprobación literal del
comando requerido por Evidence Gate fue:

```text
$ pnpm exec vitest run tests/growth-canonical.test.ts 2>&1 | tail -40
[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides". See https://pnpm.io/settings for the new setting.
```

Ese wrapper no produjo la línea obligatoria `Tests N passed (M)` en este runtime.
El binario local equivalente sí terminó favorablemente, pero no sustituye la
prueba literal exigida por el gate:

```text
 RUN  v3.2.6 /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  401ms
STATUS=0
```

La evidencia de existencia y conteo de los siete archivos permanece en la sección
anterior: todos existen; `tests/growth-canonical.test.ts` declara 14 casos. La
revisión funcional local/sandbox sigue sin hallazgos en el checklist, sin usar
Stripe live, producción, secretos, migraciones remotas ni datos reales. Sin la
salida literal del comando `pnpm exec`, el veredicto administrativo es
**BLOCKED / no PASS** según Evidence Gate.

El control-plane tampoco está disponible: `curl` a `http://127.0.0.1:3100` devolvió
`HTTP_STATUS:000` por conexión rechazada, por lo que no se pudo publicar el
comentario ni cambiar el estado. Owner de desbloqueo: operador del control-plane;
acción exacta: restaurar Paperclip, publicar esta evidencia y resolver el estado
del issue conforme al gate.

### Disposición vigente tras la continuación 2026-09-04

La ejecución fresca de este heartbeat volvió a no producir la línea literal
requerida mediante `pnpm exec`; por tanto el veredicto administrativo vigente
es **BLOCKED / no PASS** bajo el `zaltyko-evidence-gate`. El PASS del binario
directo queda como evidencia auxiliar y no habilita `done`.

Evidencia literal del expediente actualizado:

```text
$ ls -la vault/06-Roadmap-y-Tareas/ZAL-1123 QA independiente A3 2026-09-03.md
-rw-r--r--@ 1 elvisvaldesinerarte  staff  35071 Sep  4 00:42 vault/06-Roadmap-y-Tareas/ZAL-1123 QA independiente A3 2026-09-03.md
$ wc -l vault/06-Roadmap-y-Tareas/ZAL-1123 QA independiente A3 2026-09-03.md
     674 vault/06-Roadmap-y-Tareas/ZAL-1123 QA independiente A3 2026-09-03.md
$ ls -la vault/06-Roadmap-y-Tareas/Changelog interno.md
-rw-r--r--@ 1 elvisvaldesinerarte  staff  883921 Sep  4 00:41 vault/06-Roadmap-y-Tareas/Changelog interno.md
$ wc -l vault/06-Roadmap-y-Tareas/Changelog interno.md
    7115 vault/06-Roadmap-y-Tareas/Changelog interno.md
```

### Evidencia fresca de continuación — 2026-09-06 Europe/Madrid

La re-review se ejecutó sobre el checkout efectivo sin modificar los siete
artefactos ni datos. La suite exigida por Evidence Gate terminó correctamente
con el wrapper `pnpm exec` y añadió el caso de entornos DB/Stripe incompatibles:

```text
$ PATH=/Users/elvisvaldesinerarte/Library/pnpm:$PATH CI=1 pnpm exec vitest run tests/growth-canonical.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  15 passed (15)
   Start at 01:35:48
   Duration  1.02s (transform 194ms, setup 477ms, collect 130ms, tests 21ms, environment 0ms, prepare 180ms)
```

Salidas literales de existencia y conteo:

```text
$ ls -la src/lib/growth/canonical.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  17635 Aug 31 17:11 src/lib/growth/canonical.ts
$ wc -l src/lib/growth/canonical.ts
     608 src/lib/growth/canonical.ts
$ ls -la src/lib/growth/canonical-adapter.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4217 Aug 31 17:11 src/lib/growth/canonical-adapter.ts
$ wc -l src/lib/growth/canonical-adapter.ts
     143 src/lib/growth/canonical-adapter.ts
$ ls -la src/lib/growth/reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  8059 Sep  6 01:19 src/lib/growth/reconciliation.ts
$ wc -l src/lib/growth/reconciliation.ts
     285 src/lib/growth/reconciliation.ts
$ ls -la src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2574 Sep  2 13:37 src/db/schema/growth-events.ts
$ wc -l src/db/schema/growth-events.ts
      81 src/db/schema/growth-events.ts
$ ls -la supabase/migrations/20260825090000_growth_events_canonical_a3.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2314 Aug 31 17:11 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ wc -l supabase/migrations/20260825090000_growth_events_canonical_a3.sql
      69 supabase/migrations/20260825090000_growth_events_canonical_a3.sql
$ ls -la tests/growth-canonical.test.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  12680 Sep  6 01:19 tests/growth-canonical.test.ts
$ wc -l tests/growth-canonical.test.ts
     416 tests/growth-canonical.test.ts
$ grep -c "  it(" tests/growth-canonical.test.ts
15
$ ls -la tests/fixtures/growth-reconciliation.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  4680 Aug 31 17:11 tests/fixtures/growth-reconciliation.ts
$ wc -l tests/fixtures/growth-reconciliation.ts
     163 tests/fixtures/growth-reconciliation.ts
```

Checks complementarios:

```text
$ node --import tsx scripts/check-migrations-integrity.ts
[check-migrations-integrity] OK: 6 Drizzle (6 SQL) + 51 Supabase migraciones validadas
$ git diff --check
(sin salida; exit 0)
```

Resultado funcional: catálogo/aliases sin doble emisión; consentimiento,
policy, PII-like, tenant/academy y onboarding fail-closed; replay conserva la
primera fila; colisiones de `event_id` y fila histórica no sobreescriben;
reconciliación sintética DB + Stripe test rechaza discrepancias de plan,
moneda, estado, ID, entorno y contrato; `checkout_started` no cuenta ingresos
ni dispara chequeo de suscripción. No se usó Stripe live, producción,
secretos, datos reales ni migraciones remotas.

La validación local/sandbox es **APPROVED / PASS**. Producción, proveedores
externos y validación humana/Product Lead quedan fuera de esta ejecución.
El intento de publicar comentario y cambiar el issue a `done` volvió a fallar
porque el control plane rechazó `127.0.0.1:3100` (`curl: (7) Failed to connect`)
en ambas solicitudes. No se reintentará en este heartbeat. Owner de desbloqueo:
operador del control plane. Acción exacta: publicar esta evidencia en ZAL-1123 y
cambiar su disposición administrativa a `done`.
