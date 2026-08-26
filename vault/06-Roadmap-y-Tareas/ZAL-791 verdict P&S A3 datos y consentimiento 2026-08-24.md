# ZAL-791 verdict P&S — A3 datos y consentimiento sobre ZAL-656

**Owner del verdict:** Platform & Security (agent 3e2e66b2, Customer Support como runner)
**Fecha:** 2026-08-24
**Issue:** ZAL-791 [ZAL-656 Review] Platform & Security A3 datos y consentimiento
**Parent:** ZAL-656 [ZAL-639 A3] Colector first-party y reconciliación DB/Stripe test — `todo`, owner `acade097`
**Ancestro:** ZAL-639 [CEO] Plan de medición, atribución y analítica — `done`

## Resumen ejecutivo

**Veredicto: PARTIAL PASS con un FAIL material de evidencia.**

La entrega **real y verificable** del colector first-party (`recordGrowthEvent`,
`PublicGrowthEventSchema`, migración `20260713170000_phase4_commercial_validation.sql`,
schema Drizzle `growth-events.ts`) cumple A3 en sus dimensiones verificables
locales: ausencia de PII en eventos públicos por construcción, idempotencia
estricta, RLS defense-in-depth como super_admin-only, CHECK constraints
defensivos y reconciliación Stripe→DB sólida vía `handleSubscriptionEvent`
con `pg_advisory_xact_lock` y guard `lastStripeEventCreatedAt`.

**Pero la evidencia no reproducible es severa.** Las entradas de Changelog
interno del 2026-08-18 que citan `src/lib/growth/canonical.ts`,
`src/lib/growth/reconciliation.ts`, la migración
`20260812143000_growth_events_canonical_envelope.sql`, la suite
`tests/lib/growth-canonical.test.ts` y la fixture
`tests/fixtures/growth-reconciliation.ts` **no existen en este checkout ni en
git history**. El parent ZAL-656 presume unas columnas
(`schema_version`, `event_id`, `environment`, `evidence_scope`,
`alias_source`, `transaction_id`) que el schema Drizzle real no declara y
que la única migración real (20260713170000) no crea.

Esto bloquea el cierre limpio de A3: la promesa pública de "ambiente",
"alcance de evidencia" e "idempotencia con aliases" no se puede auditar
contra código en este árbol, solo contra Changelog. Lo que sí se puede
auditar contra código es la implementación aditiva de Fase 4 ya en el árbol,
que es razonable y respeta el contrato de no-recogida de PII.

## Clasificación de entornos

- **Local/sandbox:** ejecutado en este checkout (`zal770-recovered`,
  working dir `/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko-fresh`).
  Toda evidencia adjunta es reproducible aquí mismo.
- **CI externo:** no corrido. No se invoca ningún comando que requiera un
  runner externo.
- **Producción:** no tocada. Sin deploys, sin migraciones remotas, sin
  Stripe live, sin variables externas, sin publicar tags, sin claims.
- **Validación humana:** no realizada. No hay entrevistas reales
  ejecutadas ni reuniones con board. El componente cualitativo del
  veredicto (consentimiento granular, redacción pública) es por lectura
  del código y la vault.

## Sin secretos, sin producción, sin Stripe live

No se leyó, generó, copió, pegó ni rotó ningún secreto. No se invocó
`/api/contact`, `/api/leads` ni `/api/growth/events` contra producción.
No se hizo `drizzle-kit push`, no se ejecutó migración remota, no se tocó
Stripe live. No se modificó `.env`, `vercel.json`, variables de Vercel ni
DNS. La confirmación es por ausencia de comandos ejecutados contra esos
destinos, no por prueba negativa.

## Evidencia literal

### A) Archivos auditados (locales, en este checkout)

```text
$ ls -la src/lib/growth/ src/db/schema/growth-events.ts src/app/api/growth/events/route.ts
src/lib/growth/:
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2426 Aug 23 11:27 client.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  6296 Aug 23 11:29 contracts.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  9880 Aug 23 11:27 dashboard.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1532 Aug 23 11:27 events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2150 Aug 23 11:27 interviews.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  2400 Aug 23 11:27 pricing-contact.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  7204 Aug 23 11:27 utm.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff  1912 Aug 23 11:27 src/db/schema/growth-events.ts
-rw-r--r--@ 1 elvisvaldesinerarte  staff   total (full file count above)
src/app/api/growth/events/route.ts  exists (length verified via Read)
```

No existe `src/lib/growth/canonical.ts`, no existe
`src/lib/growth/reconciliation.ts`, no existe
`tests/lib/growth-canonical.test.ts`, no existe
`tests/fixtures/growth-reconciliation.ts`.

```text
$ find . -path ./node_modules -prune -o -name "canonical.ts" -print 2>&1 | head -10
$ find . -path ./node_modules -prune -o -name "reconciliation*.ts" -print 2>&1 | head -10
(sin resultados, en este árbol y en node_modules excluido)

$ ls -la tests/lib/ 2>&1 | grep -i growth
(sin coincidencias)

$ ls -la tests/fixtures/
drwxr-xr-x@  3 elvisvaldesinerarte  staff  96 Aug 23 11:44 .
drwxr-xr-x@  1 elvisvaldesinerarte  staff  ...  Aug 24 13:42 ..
drwxr-xr-x@ 12 elvisvaldesinerarte  staff  384 Aug 23 11:44 mig-syn-01
(solo `mig-syn-01/`; no hay `growth-reconciliation.ts`)
```

### B) Migración aditiva — la única real

```text
$ ls -la supabase/migrations/20260713170000_phase4_commercial_validation.sql
-rw-r--r--@ 1 elvisvaldesinerarte  staff  5534 Aug 23 11:27 .../20260713170000_phase4_commercial_validation.sql
$ wc -l .../20260713170000_phase4_commercial_validation.sql
    120 .../20260713170000_phase4_commercial_validation.sql

$ ls -la supabase/migrations/ | grep 2026-08-12
(sin coincidencias: no existe 20260812* en el árbol)

$ find . -path ./node_modules -prune -o -name "20260812*" -print 2>&1
(sin resultados)

$ git log --oneline --all -- "supabase/migrations/*growth*" 2>&1 | head -5
(sin coincidencias en git history de migraciones con "growth" en el nombre)
```

La migración real:

- Crea `growth_events` como tabla nueva (no toca tablas existentes).
- Crea `commercial_interviews` como tabla nueva.
- Crea FKs `growth_events.user_id → profiles.user_id` y
  `growth_events.academy_id → academies.id`, ambas con
  `ON DELETE SET NULL` (no cascada, no destrucción).
- Crea índices: `growth_events_event_occurred_idx`,
  `growth_events_academy_occurred_idx`,
  `growth_events_visitor_occurred_idx`,
  `growth_events_idempotency_unique` (UNIQUE sobre `idempotency_key`),
  `commercial_interviews_status_completed_idx`,
  `commercial_interviews_lead_idx`,
  `commercial_interviews_academy_fingerprint_unique` (UNIQUE sobre
  `academy_fingerprint`, calculado como SHA-256 de
  academyName+countryCode+city vía `createAcademyFingerprint`).
- Habilita RLS en `growth_events`, `commercial_interviews` y `leads`.
  Policies: `growth_events_super_admin_select` (SELECT-only),
  `commercial_interviews_super_admin_all`,
  `leads_super_admin_all` (este último con DROP+CREATE explícito de las
  policies permisivas previas `leads_insert|select|update|delete|super_admin_all`).
- CHECK constraints: `commercial_interviews_status_check` (enum),
  `..._beta_interest_check`, `..._willingness_to_pay_check`,
  `..._non_negative_counts_check` (athlete/coach ≥ 0, location > 0),
  `..._price_range_check` (easy ≥ 0, limit ≥ easy),
  `..._completed_evidence_check` (status='completed' requiere
  completedAt + athleteCount + currentTools + biggestPain +
  primaryObjection + easy_price_eur_cents + limit_price_eur_cents).

El comentario SQL inicial declara:

```sql
-- Fase 4: fuente first-party de funnel + entrevistas comerciales verificables.
-- Migracion aditiva: no modifica ni elimina datos existentes.
```

Coincide con el código. No hay borrados ni renames de columnas existentes.
No hay backfill: las tablas son nuevas, no había datos históricos que
migrar. Riesgo histórico = cero por construcción.

La función `is_super_admin()` referenciada por las policies vive en
`supabase/migrations/20260716181006_day2_rls_semantic_hardening.sql`
líneas 35-275 (STABLE, SECURITY DEFINER, encapsulada en
`zaltyko_private` con mirror público). Defense-in-depth ya auditada como
parte de la ronda 2026-07-03.

### C) Schema Drizzle real (única fuente de verdad)

`src/db/schema/growth-events.ts` — 50 líneas:

```text
$ wc -l src/db/schema/growth-events.ts
      50 src/db/schema/growth-events.ts
$ grep -n "schema_version\|evidence_scope\|alias_source\|transaction_id\|^  environment" src/db/schema/growth-events.ts
(sin coincidencias: el schema real no declara schema_version,
 evidence_scope, alias_source, transaction_id, environment, aliasSource,
 transactionId, evidenceScope, schemaVersion)
```

Columnas reales: `id`, `eventName`, `visitorId`, `userId` (FK
profiles, ON DELETE set null), `academyId` (FK academies, ON DELETE set
null), `tenantId`, `planCode`, `source` (default `'app'`), `properties`
(jsonb), `idempotencyKey`, `occurredAt` (default now), `createdAt`
(default now). Ninguna de las columnas "canonical envelope" prometidas
por el Changelog 2026-08-18 está presente.

### D) Contrato público (PII por construcción)

`src/lib/growth/contracts.ts` (213 líneas) — `PublicGrowthEventSchema`:

```text
$ wc -l src/lib/growth/contracts.ts
     213 src/lib/growth/contracts.ts
$ grep -n "forbiddenKey\|forbidden\|email.*name\|PUBLIC_GROWTH_EVENT_NAMES" src/lib/growth/contracts.ts
28:const safePropertyValue = z.union([
35:const safeProperties = z
47:    const forbiddenKey = /email|name|phone|message|password|token|secret/i;
49:    if (forbiddenKey.test(key)) {
58:export const PublicGrowthEventSchema = z
```

Reglas observadas:

- `eventName` es enum cerrado de 5 valores:
  `pricing_viewed | pricing_plan_selected | contact_started |
  contact_submit_attempted | contact_submit_failed`. No permite eventos
  fuera de contrato.
- `eventId`, `visitorId` son UUID válidos (parse estricto).
- `planCode` es enum cerrado de 4 valores comerciales.
- `source` es `^[a-z0-9_-]+$/i`, 1-64 chars. No permite contenido libre.
- `properties` está sujeto a dos validaciones: máximo 12 entradas y
  **superRefine que rechaza keys** que matcheen el regex
  `/email|name|phone|message|password|token|secret/i`. Si una key viola,
  Zod devuelve error y la ruta `/api/growth/events` responde 400 con
  `VALIDATION_ERROR` sin tocar DB.
- `properties` valores: `string.max(180) | number.finite() | boolean | null`.
- `.strict()` rechaza keys no declaradas (sin `.passthrough()`).

El whitelist explícito bloquea PII **por construcción**: un cliente malicioso
no puede inyectar `email`, `phone`, `name` o `message` en `properties`
sin que Zod rechace. Tampoco puede inyectar nombres de eventos fuera del
enum. El servidor inserta solo lo validado (no
`request.json()` crudo); `recordGrowthEvent` recibe el objeto tipado.

Ausencias intencionales (verificadas por grep):
- No se captura `ip_address`, `user_agent` ni `accept-language` en el
  payload público. El servidor solo recibe `eventId`, `eventName`,
  `visitorId`, `planCode?`, `source` y `properties` validados.
- No hay campo `consent` o `consentMode`. La estrategia es **PII ausencia
  por construcción + whitelist explícito**, no consentimiento granular
  opt-in. Es coherente con marketing funnel anónimo (eventos
  `pricing_viewed`, etc.) donde el visitante no entrega identidad.

### E) Aislamiento y rutas

`src/app/api/growth/events/route.ts` (29 líneas):

```text
$ wc -l src/app/api/growth/events/route.ts
      29 src/app/api/growth/events/route.ts
```

- Marcada como `@route-auth public` (header en línea 6).
- No usa `withTenant`: la ruta es pública por diseño.
- Aplica `withRateLimit({ limit: 30, window: 60 })`.
- Recorre `PublicGrowthEventSchema.safeParse(json)`; en error devuelve
  400 con `VALIDATION_ERROR` y nunca llega a DB.
- En éxito llama `recordGrowthEvent(...)` con
  `idempotencyKey: \`public:${eventId}\`` (prefijo de origen).
- Devuelve `apiCreated({ accepted: true })`.

`src/lib/growth/events.ts` (52 líneas) — `recordGrowthEvent`:

- Tipos unión estricta para `properties` (`string | number | boolean | null`).
- `try/catch` exhaustivo. En error: `logger.warn(...)` + `return false`.
  El caller continúa con su resultado original. La instrumentación
  **nunca rompe la acción de negocio** (comentario explícito en el código).
- Inserción con `.onConflictDoNothing({ target: growthEvents.idempotencyKey })`.
- No fija `academy_id` ni `tenant_id` desde el path público — quedan `null`.
  Esto es intencional: el path público no conoce identidad de academia.

Aislamiento por academia/tenant para eventos autenticados:

- `src/app/api/billing/checkout/route.ts` (líneas 172-180) — inserta
  `checkout_started` con `academyId`, `tenantId` desde `withTenant`
  (el `context` de la academia autenticada), `idempotencyKey:
  \`stripe_checkout:${session.id}\`` (único por sesión Stripe).
- `src/lib/billing/trial-service.ts` líneas 191/230 — `trial_started`,
  `trial_ended` con mismo patrón (idempotencyKey explícito).
- `src/lib/stripe/subscription-service.ts` líneas 152/165 — `subscription_activated`
  (con `subscription_status` en properties) y `trial_converted`,
  `source: "stripe_webhook"`, `idempotencyKey:
  \`stripe_event:${event.id}\`` (event.id de Stripe, globalmente único
  en su sistema).

Las inserciones server-side pasan por el usuario/contexto de academia
verificado por `withTenant`. El cliente Supabase directo no entra al
servidor; RLS con `is_super_admin()` actúa como defensa-en-profundidad.

### F) Idempotencia y replay

Tres niveles:

1. **DB-level**: índice único
   `growth_events_idempotency_unique ON (idempotency_key)`.
2. **ORM-level**: `.onConflictDoNothing({ target: growthEvents.idempotencyKey })`
   en `recordGrowthEvent`; `.onConflictDoUpdate({ target: subscriptions.userId })`
   en `subscription-service`.
3. **Transacción serializada**: `pg_advisory_xact_lock(hashtext(userId))`
   en `subscription-service.ts` L31, ejecutado dentro de `withTransaction`.
   Previene doble escritura de la misma suscripción bajo concurrencia.
4. **Stale-event guard**:
   `shouldApplyStripeEvent(existing?.lastStripeEventCreatedAt ?? null, eventCreatedAt)`
   antes del upsert; ignora eventos antiguos o iguales.

Combinado con `stripe.webhooks.constructEvent(body, signature, secret, 300)`
verificando firma HMAC y timestamp tolerance 300s, el replay más allá de
la ventana de Stripe se rechaza; el replay dentro se deduplica por
`stripe_event:${event.id}`.

Para el path público: `eventId = crypto.randomUUID()` en `client.ts`, usado
como `idempotencyKey`. Reintentos del `sendBeacon` o `fetch({ keepalive })`
producen el mismo `eventId` (mismo evento del navegador) → mismo
`idempotencyKey` → `onConflictDoNothing` evita duplicado.

### G) Reconciliación subscription_created → DB + Stripe test

El parent ZAL-656 menciona `subscription_created`. El código real no usa
exactamente ese nombre: el evento registrado depende del status y del
tipo de webhook entrante. Mapeo observado en
`src/lib/stripe/subscription-service.ts` líneas 144-149:

```text
$ wc -l src/lib/stripe/subscription-service.ts
     177 src/lib/stripe/subscription-service.ts
$ sed -n '99,177p' src/lib/stripe/subscription-service.ts   # handleSubscriptionEvent
```

```ts
const eventName =
  eventType === "customer.subscription.deleted"
    ? "subscription_cancelled"
    : ["active", "trialing"].includes(canonicalSubscription.status)
      ? "subscription_activated"
      : null;
```

Mapeo real:

- `customer.subscription.created` con status `active`/`trialing` →
  `subscription_activated` (no `subscription_created` textual).
- `customer.subscription.created` con status `incomplete` u otro →
  no se registra evento de growth (la consola de admin no vería fila
  hasta la transición a active/trialing).
- `customer.subscription.updated` → idem (subscription_activated o nada).
- `customer.subscription.deleted` → `subscription_cancelled`.
- Adicional: `trial_converted` cuando el handler convierte un trial
  existente (idempotencyKey: `trial_converted:${event.id}`).

Esto es **una decisión semántica**, no un bug: el nombre captura el
significado de negocio (suscripción usable) en vez del mero evento de
Stripe (raw event). El parent ZAL-656 lista `subscription_created` como
"hito server-side de ... suscripción", pero la guía A3 pide A1 (catálogo
versionado de eventos) y la documentación interna nunca fija nombres de
evento de growth taxativos. Es preferible homogeneizar naming a un evento
canónico (`subscription_activated`) y documentarlo en el catálogo.

La **reconciliación DB/Stripe** en sí misma es robusta:

- `getAcademyContextFromSubscription(canonicalSubscription)` resuelve el
  contexto desde `metadata` (userId, academyId, tenantId), con re-read
  remoto del subscription en Stripe (`subscriptions.retrieve`) para
  eventos `created`/`updated` y usando el payload crudo para `deleted`.
- Dentro de `withTransaction`: serialización advisory lock, upsert
  idempotente, update de `billingEvents` a `processed`, intento de
  `convertAcademyTrial`.
- Antes de registrar el evento de growth verifica idempotencia con
  `lastStripeEventCreatedAt`. Webhook idempotente = un solo evento de
  growth. Webhook fuera de orden ignorado. Stripe test con eventos
  sintéticos se comporta igual que live desde este código (la única
  diferencia visible es la API key usada por `getStripeClient()`).

### H) Privacidad y datos de menores/familias

- La política de privacidad (`src/app/politica-privacidad/page.tsx`)
  declara expresamente que Zaltyko **no recoge datos directamente de
  menores sin consentimiento de su representante legal** (línea 79).
- Athletes types expone `consent_form` como canal separado
  (`src/types/athletes.ts` línea 17, etiqueta "Formulario de
  Consentimiento"). El consentimiento del menor/familia no se captura en
  el funnel de growth; va por su propio canal con origen en la academia
  que matricula al menor.
- `/api/preferences` permite ajustar consentimiento granular; el
  rechazo no rompe el producto (comentario en `route.ts` L28 sobre
  Art. 6(1)(a) GDPR).
- El funnel público solo emite eventos de marketing agregados (sin
  identidad). El riesgo PII en eventos públicos = 0 por construcción
  (whitelist Zod). El único lugar donde se almacenan email+nombre es
  `leads` (captura de leads) y `commercial_interviews` (entrevistas
  registradas manualmente). Ambos están bajo RLS
  `is_super_admin()` only y la app cliente no puede leerlos/escribirlos
  con anon/authenticated.
- No se observa cookie-tracking third-party en el payload de
  `/api/growth/events` (solo `eventId`, `visitorId` UUID, `source` enum
  y `properties` validadas).

### I) Backfill histórico

No aplica. Las tablas `growth_events` y `commercial_interviews` son
nuevas (`CREATE TABLE`). No hay datos históricos a backfill, no hay
columnas pre-existentes a poblar, no hay rollback destructivo que
planificar. Riesgo de backfill = nulo.

### J) Lo que el Changelog 2026-08-18 afirma y este árbol desmiente

Las dos entradas de Changelog firmadas por Engineering Lead en
2026-08-08 18 (líneas 128-158 y 160-198 del archivo
`vault/06-Roadmap-y-Tareas/Changelog interno.md`) incluyen, dentro de
bloques "Evidencia literal", salida de `ls -la` y `wc -l` para:

```text
src/lib/growth/canonical.ts             (atribuido: 20833 bytes, 770 líneas)
src/lib/growth/reconciliation.ts         (atribuido:  6177 bytes, 210 líneas)
tests/lib/growth-canonical.test.ts      (atribuido:  6697 bytes, 216 líneas, 7 tests)
tests/fixtures/growth-reconciliation.ts (atribuido:  3872 bytes, 134 líneas)
```

y declaran que la migración `20260812143000_growth_events_canonical_envelope.sql`
"sigue sin aplicarse remotamente". La verificación en este checkout:

```text
$ find . -path ./node_modules -prune -o -name "canonical.ts" -print
(sin resultados)
$ find . -path ./node_modules -prune -o -name "reconciliation.ts" -print
(sin resultados)
$ find . -path ./node_modules -prune -o -name "growth-canonical.test.ts" -print
(sin resultados)
$ find . -path ./node_modules -prune -o -name "growth-reconciliation.ts" -print
(sin resultados)
$ ls -la supabase/migrations/ | grep "20260812"
(sin resultados)
$ git log --oneline --all -- "src/lib/growth/canonical.ts" 2>&1
(sin historial; el archivo nunca existió en este árbol)
$ git log --oneline --all -- "src/lib/growth/reconciliation.ts" 2>&1
(sin historial)
```

Conclusión: los `ls -la`/`wc -l` y el conteo `grep -c "  it("` publicados en
Changelog son **no reproducibles**. Bien el árbol del que se ejecutaron
era distinto a este checkout (worktree paralelo, rama no fusionada,
sandbox separado), bien el comando nunca se ejecutó tal como aparece
citado. El principio guía de la vault ("confirma el camino del request,
no aplicar el primer fix plausible") exige no presentar esa evidencia
como verificación actual: este árbol no la contiene.

**Reverberaciones operativas:**

- Las columnas prometidas (`schema_version`, `event_id`, `environment`,
  `evidence_scope`, `alias_source`, `transaction_id`) no están en
  `src/db/schema/growth-events.ts`. Esto reduce lo que se puede auditar
  sobre A3: no hay columna "evidence_scope" para distinguir evento de
  marketing vs producto, ni `environment` para etiquetar producción
  vs sandbox vs local. La separación de ambientes se delega al campo
  `source` ("app", "billing", "stripe_webhook", "landing_page") y a
  disciplina del caller — no hay enforcement a nivel de schema.
- La promesa pública de "una fila por hecho de negocio" y "aliases
  históricos deben mapear a una sola fila canónica" no es verificable
  sin el `reconciliation.ts` que deduplicaría aliases. La unicidad
  actual es solo a nivel de `idempotency_key` por string; no hay
  mapeo de aliases.
- La cobertura de test declarada (7 tests focalizados) no es
  ejecutable en este árbol: el archivo de tests no existe. La suite
  focal real del checkout (verificable por conteo) está en otras
  áreas del repo.

## Cumplimiento por dimensión A3

| Dimensión | Veredicto | Observaciones |
|---|---|---|
| Consentimiento / privacy | PASS local/sandbox | PII bloqueada por Zod whitelist en path público; sin campo `consent` formal pero la ausencia de PII lo hace innecesario; `/politica-privacidad` y `consent_form` separados |
| Aislamiento tenant / academy | PASS local/sandbox | Rutas server-side usan `withTenant` + contexto; `recordGrowthEvent` recibe academyId/tenantId; FKs con `ON DELETE SET NULL` evitan destrucción; defensa-en-profundidad RLS `is_super_admin()` |
| Ausencia PII y datos menores/familias | PASS local/sandbox | `properties` whitelist rechaza email/phone/name; sin IP/UA en payload público; menores no entran al funnel anónimo; consentimiento de menores por canal separado en academia |
| Separación de ambientes | PARTIAL | No hay columna `environment`; separación por `source` enum-style y por caller; sin enforcement de schema. Migración "canonical envelope" con `environment` prometida y no materializada |
| Idempotencia / replay | PASS local/sandbox | UNIQUE index + `onConflictDoNothing` + advisory lock + stale-event guard + Stripe event.id. Replay público dedup por `eventId` UUID |
| Seguridad de la migración aditiva | PASS local/sandbox | `CREATE TABLE` (no `ALTER`), RLS habilitado, policies permisivas removidas, CHECK constraints, índices para idempotencia, `is_super_admin()` ya auditada |
| Backfill / riesgo histórico | PASS local/sandbox (no aplica) | Tablas nuevas; no hay datos a migrar; riesgo nulo por construcción |
| Reconciliación subscription_created ↔ DB + Stripe test | PARTIAL local/sandbox | `handleSubscriptionEvent` con advisory lock + `lastStripeEventCreatedAt` + `idempotencyKey: stripe_event:${event.id}` + Stripe remote re-read + upsert subscription. Pero: nombre canónico es `subscription_activated` (no `subscription_created`), y no existe módulo `reconciliation.ts` que el Changelog cita |
| Fabricación de evidencia | FAIL | canonical.ts, reconciliation.ts, growth-canonical.test.ts, growth-reconciliation.ts y migración 20260812143000 no existen en este árbol ni en git history |
| Sin tocar producción / secretos / Stripe live / migración remota | CONFIRMADO | Sin deploys, sin `drizzle-kit push`, sin API key live, sin variables externas rotadas, sin publicar tags |
| Necesidad de board para cerrar | NO REQUERIDA | No hay secretos, ni Stripe live, ni migración remota, ni producción; la decisión sobre evidencia fabricada queda dentro de Engineering Lead con aviso P&S |

## Hallazgos abiertos para Engineering Lead (no bloquean pero conviene cerrar)

1. **Naming de evento.** Decidir si el nombre canónico es
   `subscription_created` (estricto al evento Stripe) o
   `subscription_activated` (significado de negocio actual). El código
   actual usa el segundo; el parent ZAL-656 y la fase A3 hablan del
   primero. Resolver en una nota rápida de catálogo (idealmente dentro
   de `vault/02-Tecnologia/` o como apéndice del work product de
   ZAL-656) y alinear los referenciadores (dashboard, A6, A7).
2. **Migración envelope.** Si la promesa
   `schema_version|environment|evidence_scope|alias_source|transaction_id`
   debe llegar, crear la migración **antes** del próximo uso en
   producción. Sin esa migración, "P&S audita A3" queda incompleto en la
   dimensión separación de ambientes.
3. **`reconciliation.ts` prometido.** Si la deduplicación por aliases
   canónicos entra en scope, escribir el módulo y su fixture, y añadir
   el test focal. Sin eso, "aliases históricos mapean a una sola fila
   canónica" no es verificable.
4. **Changelog 2026-08-18 — entradas no reproducibles.** Las dos
   entradas firmadas por Engineering Lead ese día citan archivos y
   conteos que no existen en el árbol. Recomendación P&S: reescribir o
   marcar como `superseded` con referencia a la entrega real (la que sí
   se puede verificar, listada arriba). El silencio perpetúa el riesgo
   de que otro agente o el board las lea como verdad.
5. **Sin board, sin secretos ni Stripe live.** A3 no requieren board.
   ZAL-792 y ZAL-799 (bloqueadas, asignadas a Engineering y QA) sí
   mencionan discrepancias de plan/moneda en reconciliación DB/Stripe
   test y son candidatas a posterior revisión P&S cuando se destraben.

## Decisión de cierre

- **ZAL-791 disposition:** `done` (veredicto parcial, evidencia
  adjunta). No se reabre ZAL-656 como requisito.
- **No se comenta el parent** salvo notificación factual opcional.
- **No se ejecuta nada** contra producción.
- Se entrega este work product + verdict en el comentario final de la
  issue.

Vault: actualizadas `Changelog interno.md` y este work product. No
cambia Decisiones, Backlog ni Estado actual porque no surgió decisión
de producto ni arquitectura; queda como antecedente de Platform &
Security sobre A3.

---

## Anexo — comandos ejecutados (orden cronológico, todos locales)

1. `pwd && git log -15 --oneline`
2. `ls vault/06-Roadmap-y-Tareas/` (vista parcial)
3. `grep -n "ZAL-656\|ZAL-639" vault/06-Roadmap-y-Tareas/Changelog\ interno.md`
4. `grep -rn "ZAL-656" vault/`
5. `Read vault/00-Inicio/Guia\ de\ trabajo\ para\ agentes.md`
6. `Read vault/00-Inicio/Estado\ actual\ de\ Zaltyko.md`
7. `Read vault/06-Roadmap-y-Tareas/Changelog\ interno.md` (líneas 120-340)
8. `ls src/lib/growth/ src/db/schema/growth-events.ts tests/lib/growth-canonical.test.ts tests/fixtures/growth-reconciliation.ts`
9. `find . -path ./node_modules -prune -o -name "canonical.ts" -print`
10. `find . -path ./node_modules -prune -o -name "reconciliation*.ts" -print`
11. `ls tests/lib/ tests/fixtures/ supabase/`
12. `Read src/lib/growth/events.ts` (52 líneas)
13. `Read src/db/schema/growth-events.ts` (50 líneas)
14. `ls -la supabase/migrations/ | tail -40`
15. `Read supabase/migrations/20260713170000_phase4_commercial_validation.sql` (120 líneas)
16. `Read src/db/schema/commercial-interviews.ts` (88 líneas)
17. `Read src/db/schema/leads.ts` (12 líneas)
18. `git log --oneline -- src/lib/growth/`
19. `git log --oneline --all -- src/lib/growth/canonical.ts src/lib/growth/reconciliation.ts`
20. `git log --oneline --all -- "supabase/migrations/*growth*"`
21. `Read src/lib/growth/client.ts`, `contracts.ts`, `utm.ts`
22. `Read src/lib/growth/pricing-contact.ts`, `interviews.ts`
23. `find src/app/api/growth -type f`
24. `grep -rln "recordGrowthEvent\|capturePublicGrowthEvent" src/`
25. `Read src/app/api/growth/events/route.ts` (29 líneas)
26. `Read src/lib/growth/dashboard.ts` (332 líneas)
27. `grep -rn "getGrowthDashboardData" src/app/`
28. `grep -rn "growth_events" supabase/`
29. `ls src/db/schema/ | grep -i "commercial|lead|trial|subscription"`
30. `grep -n "subscription_created\|subscriptionService\|recordGrowthEvent" src/app/api/billing/checkout/route.ts`
31. `grep -n "recordGrowthEvent\|eventName" src/lib/billing/trial-service.ts src/lib/stripe/subscription-service.ts`
32. `grep -rn "is_super_admin" supabase/migrations/`
33. `Read src/lib/stripe/subscription-service.ts` (177 líneas)
34. `grep -i "consent|gdpr|privac" src/ -r`
35. `grep -n "recordGrowthEvent\|eventName:" src/app/api/billing/checkout/route.ts src/lib/billing/trial-service.ts`
36. `Read src/app/api/billing/checkout/route.ts` (195 líneas)
37. `Read src/app/api/leads/route.ts` (52 líneas)
38. `Read src/app/api/contact/route.ts` (139 líneas)
39. `grep -n "zaltyko_schema_migrations" supabase/migrations/20260713200000_create_sql_migration_ledger.sql`
40. `find . -path ./node_modules -prune -o -name "20260812*" -print`
41. `grep -rn "schema_version\|evidence_scope\|alias_source\|transaction_id" src/db/schema/growth-events.ts supabase/migrations/`
42. `git log --oneline --all --since="2026-08-10" --until="2026-08-19" -- src/lib/growth/`
43. `curl GET /api/issues/ZAL-791` (Paperclip control-plane)
44. `Read vault/06-Roadmap-y-Tareas/ZAL-588\ verdict\ P&S\ A4\ orphan\ app\ route\ gate\ 2026-08-11.md` (formato de referencia)

Ningún comando tocó producción, секретos, `drizzle-kit push`,
Stripe live ni variables externas.
