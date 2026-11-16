# Cobro automático — Fase 2 «La familia guarda tarjeta o firma la domiciliación»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En `/familia/cuotas`, la persona pagadora de una familia guarda una tarjeta o firma una domiciliación SEPA en la cuenta Stripe conectada de su academia, y puede dejar de pagar automáticamente. La academia ve y puede revocar esos métodos desde `/owner/familias`. **No se cobra nada** (eso es la Fase 3).

**Architecture:** Módulo nuevo `src/modules/family-payment-methods/` con tres capas, igual que `payments-connect`:

- **dominio** puro: texto de consentimiento versionado y su SHA-256, disponibilidad, recorte de IP y agente, verificación del SetupIntent terminado;
- **infraestructura**: adaptador Stripe sobre la cuenta conectada (`stripeAccount`) y almacén SQL;
- **aplicación**: servicio que escribe con auditoría y outbox (`@/modules/shared/infrastructure/transactional-records`).

Persistencia:

- tabla nueva `zaltyko.family_payment_setup_attempts` (intento de guardar un método: Customer, SetupIntent, pagador, tutor, tipo y **evidencia del consentimiento**);
- columna nueva `payment_method_kind` en `zaltyko.family_payment_authorizations`;
- las dos en una migración **candidata**.

Flujo:

1. La familia elige método y acepta el texto → `POST …/setup` crea (o reutiliza) el Customer del pagador y un SetupIntent en la cuenta de la academia, guarda el intento `open` y devuelve `clientSecret` + `acct_…`.
2. El navegador muestra el Payment Element (`loadStripe(pk, { stripeAccount })`) y llama a `confirmSetup` con `redirect: "if_required"`.
3. `POST …/complete` relee el SetupIntent en Stripe, lo verifica contra el intento y, en una transacción, revoca la autorización activa anterior (si la hay) e inserta la nueva `active`. Tras el commit desliga en Stripe el método anterior.

**Tech Stack:** Next.js 15 App Router, Drizzle + `drizzle-orm/sql`, `stripe@^22.6.2` (apiVersion `2026-08-26.dahlia`), `@stripe/stripe-js@^8` + `@stripe/react-stripe-js@^5` (ya instalados), Zod, Vitest + Testing Library.

**Spec:** `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md`, sección «Fase 2», D2–D4 y preguntas L3/L4. También ADR-0020 y ADR-0022. Base de Fase 1: `src/modules/payments-connect/`.

## Global Constraints

**Entornos y verificación**

- No se ejecutan builds, tests, typecheck, lint ni instalaciones en el Mac. «Run» = push y comprobar en GitHub Actions los runs del SHA de cabeza ya completados (`ci.yml` para web; los `*-pg.test.ts` en `postgres-integration.yml`). `gh pr checks` vacío no es verde.
- No tocar `scripts/ci/verify-sandbox-schema-replay.sh`, `supabase/schema-snapshot-manifest.json` ni `.github/workflows/ci-isolated.yml`.
- Nada contra Stripe Live ni contra Vercel o Supabase de producción. Aplicar la candidata en staging y encender la bandera en Vercel staging **necesita autorización expresa de Elvis** (la de Fase 1 no la cubre).
- **Dos cerrojos, como R11:** la función responde «no disponible» (`live_not_released`) si `resolveConnectEnvironment() !== "test"` **o** `isProductionDatabase()` (ambas de `@/modules/payments-connect/application/config`).

**Datos y secretos**

- Ningún secreto ni dato personal en el repositorio, logs, metadata de Stripe ni mensajes.
- Zaltyko guarda solo referencias opacas: `cus_…`, `seti_…`, `pm_…`, `mandate_…`. **Nunca** IBAN, número de tarjeta, marca, últimos dígitos, nombre del titular ni correo.
- Metadata en Stripe: solo ids (`zaltyko_organization_id`, `zaltyko_family_payer_id`, `zaltyko_setup_attempt_id`). El Customer se crea sin email ni nombre (el Payment Element pide a la familia lo que SEPA exige y lo guarda Stripe).
- Evidencia del consentimiento: versión, fecha, tutor, IP recortada (IPv4 → `/24`, p. ej. `203.0.113.0`; IPv6 → `/48`, p. ej. `2001:db8:1::`), agente recortado a 120 caracteres sin caracteres de control, y SHA-256 del texto exacto aceptado.
- La migración va como candidata en `docs/deployment/candidates/`, no en `supabase/migrations/`.

**Reglas de negocio**

- Bandera nueva `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED === "true"`, apagada por defecto. Las rutas de familia además pasan por `withFamilyUser` (`@/app/api/v1/family-access-route-helpers`), que exige `ZALTYKO_FAMILY_ACCESS_ENABLED`.
- Solo la persona pagadora: cuenta de sesión → `guardians.auth_user_id` activo → `family_guardians` activo → familia activa → `family_payers` abierto hoy (calendario de la academia) para ese tutor. Misma cadena que `resolveFamilyPortalAccess` (`feeFamilyIds`).
- Academia lista: fila de `organization_payment_provider_accounts` del entorno con `status = 'active'` y `card_payments_capability_status = 'active'`, y plan de pago vigente (`evaluateAutomaticCollectionPlanEligibility(...).eligible`, vía `loadOrganizationPlanState`). La domiciliación solo se ofrece si `sepa_debit_payments_capability_status = 'active'`.
- Una sola autorización `active` por (cuenta conectada, pagador): ya lo garantiza `family_payment_authorizations_active_method_uq`. Cambiar de método revoca la anterior **en la misma transacción** que inserta la nueva.
- Revocar: primero se marca `revoked` (eso es lo que impide cobrar en la Fase 3), después se desliga en Stripe; si Stripe falla, `logger.error` con ids opacos y la revocación se mantiene.
- Sin `application_fee`. No se cambian precios. No se reabre ningún prefijo de `RETIRED_LAUNCH_API_PREFIXES`. Las rutas antiguas `/api/family/payment-method*` siguen en 410.
- Texto de consentimiento: **borrador** sin valor legal hasta que el abogado responda L3. Versión `"borrador-2026-11-16"`. Para SEPA, el texto de orden lo muestra el propio Payment Element de Stripe (con la academia como acreedora); Zaltyko no redacta texto de orden.

**Textos y código**

- Copy en español sencillo, sin jerga: «pago automático», «tarjeta», «domiciliación bancaria», «Dejar de pagar automáticamente». Nunca «SetupIntent», «mandato», «Connect», «webhook».
- Rutas nuevas con `cache-control: private, no-store` y la anotación `@route-auth` / `@auth-flexible route-guard-reason` que exige `scripts/lib/route-auth-classifier.ts`.
- Las llamadas a Stripe nunca dentro de una transacción abierta.

## Review Focus

1. **Doble clic en «Guardar» o dos pestañas completando el mismo SetupIntent.** Debe quedar una sola autorización activa y el segundo `complete` devolver la misma. `FOR UPDATE` sobre el intento + estado `completed`. Test pg de la Tarea 4.
2. **Un SetupIntent ajeno**: `setupIntentId` de otra familia, de otra academia o que no es nuestro. 404 sin escribir nada. Tareas 2 (verificación pura) y 4.
3. **La familia vuelve del 3DS** (redirección a `return_url` con `setup_intent=…`). La página debe completar sola y mostrar «Tarjeta guardada», o «Todavía no ha terminado» si sigue `processing`/`requires_action`. Tarea 6.
4. **La academia deja de estar lista** (plan caducado, cuenta restringida, bandera apagada) entre `setup` y `complete`. `complete` vuelve a evaluar la disponibilidad y no activa nada. Tarea 4.
5. **Candidata sin aplicar con la bandera encendida.** Ni `/familia/cuotas` ni `/owner/familias` ni las rutas fallan con 500: «no disponible» y la tarjeta no aparece. Tareas 1, 5, 6 y 7.

---

### Task 1: Migración candidata, espejo Drizzle y puerta de almacenamiento

**Files:**
- Create: `docs/deployment/candidates/20261116180000_family_payment_methods_candidate.sql`
- Modify: `src/db/schema/zaltyko-core.ts` (tabla `familyPaymentAuthorizations` y tabla nueva)
- Create: `src/modules/family-payment-methods/application/storage.ts`
- Modify: `docs/deployment/candidates/README.md` (fila y sección «No aplicada»)
- Test: `tests/family-payment-methods-pg.test.ts` (bloque de esquema; la Tarea 4 lo amplía)

**Interfaces:**
- Produces: `isFamilyPaymentMethodsStorageAvailable(executor?): Promise<boolean>`; Drizzle `familyPaymentSetupAttempts` y columna `paymentMethodKind`.

Tabla `zaltyko.family_payment_setup_attempts`:

| columna | tipo |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `organization_id` | `uuid not null references zaltyko.organizations(id) on delete cascade` |
| `family_id`, `family_payer_id`, `guardian_id`, `payment_provider_account_id` | `uuid not null` |
| `payment_method_kind` | `text not null check (payment_method_kind in ('card','sepa_debit'))` |
| `provider_customer_reference` | `text not null check (btrim(...) <> '')` |
| `provider_setup_reference` | `text not null check (btrim(...) <> '')` |
| `consent_version` | `text not null check (btrim(...) <> '')` |
| `consent_text_sha256` | `text not null check (consent_text_sha256 ~ '^[a-f0-9]{64}$')` |
| `consented_at` | `timestamptz not null` |
| `client_ip_prefix` | `text check (client_ip_prefix is null or char_length(client_ip_prefix) <= 64)` |
| `user_agent_excerpt` | `text check (user_agent_excerpt is null or char_length(user_agent_excerpt) <= 120)` |
| `status` | `text not null default 'open' check (status in ('open','completed','abandoned'))` |
| `authorization_id` | `uuid` (null salvo `completed`; check `(status = 'completed') = (authorization_id is not null)`) |
| `created_at`, `updated_at` | `timestamptz not null default now()` |

- Restricciones: `unique (organization_id, id)`; `unique (organization_id, payment_provider_account_id, provider_setup_reference)`; FK `(organization_id, family_id, family_payer_id) → family_payers (organization_id, family_id, id) on delete restrict`; FK `(organization_id, payment_provider_account_id) → organization_payment_provider_accounts (organization_id, id) on delete restrict`; FK `(organization_id, family_id, guardian_id) → family_guardians (organization_id, family_id, guardian_id) on delete restrict`; FK `(organization_id, authorization_id) → family_payment_authorizations (organization_id, id) on delete restrict`.
- Índice `(organization_id, payment_provider_account_id, family_payer_id, created_at desc)` (reutilizar el Customer).
- RLS `enable` + `force`; `revoke all … from public, anon, authenticated, service_role`; `grant select, insert, update … to service_role`. Igual que `family_payment_authorizations` en `20261013160000_canonical_family_collection_and_entitlements.sql`.
- En `family_payment_authorizations`: `add column payment_method_kind text` con check `payment_method_kind is null or payment_method_kind in ('card','sepa_debit')`, check `status <> 'active' or payment_method_kind is not null` y check `status <> 'active' or payment_method_kind <> 'sepa_debit' or mandate_reference is not null`.
- Actualizar el `comment on table` de `family_payment_authorizations` (deja de ser «not operational») y comentar la tabla nueva (sin datos de tarjeta ni banco; evidencia recortada).

- [ ] **Step 1: Test pg** `describe("family payment methods candidate schema")`, con el arnés desechable de `tests/payments-connect-pg.test.ts`. Instala la candidata (y antes la de Fase 1, `20261116120000_connect_onboarding_candidate.sql`, si sus columnas no existen) y comprueba: columnas y tipos; `payment_method_kind = 'otro'` rechazado en las dos tablas; `consent_text_sha256 = 'x'` rechazado; `user_agent_excerpt` de 121 caracteres rechazado; `status='completed'` sin `authorization_id` rechazado; autorización `active` `sepa_debit` sin `mandate_reference` rechazada; segunda ejecución aborta en el preflight; `isFamilyPaymentMethodsStorageAvailable()` `false` antes y `true` después. `afterAll` borra la tabla nueva y la columna (y lo que instaló de Fase 1).
- [ ] **Step 2: Escribir la candidata.** Cabecera «CANDIDATE ONLY…» como `20261116120000_connect_onboarding_candidate.sql`; `begin;` … `commit;`; preflight que aborta si la tabla o la columna ya existen o si faltan `family_payment_authorizations` o las columnas de Fase 1 (`requirements_state`).
- [ ] **Step 3: Espejo Drizzle y `storage.ts`** (lee `information_schema.columns` de la tabla nueva y de la columna nueva, como `src/modules/payments-connect/application/storage.ts`). Fila en el README de candidatas con SHA-256 (`shasum -a 256`) y estado «No aplicada».
- [ ] **Step 4: Run** (push; pg verde, `ci.yml` verde). **Commit** «Cobros familia: candidata de intentos y tipo de método».

### Task 2: Dominio — consentimiento, disponibilidad, evidencia y verificación

**Files:**
- Create: `src/modules/family-payment-methods/domain/consent.ts`, `domain/availability.ts`, `domain/evidence.ts`, `domain/setup-verification.ts`
- Create: `src/modules/family-payment-methods/application/config.ts`
- Test: `tests/family-payment-methods-domain.test.ts`

**Interfaces (Produces):**
- `type PaymentMethodKind = "card" | "sepa_debit"`.
- `FAMILY_PAYMENT_CONSENT_VERSION = "borrador-2026-11-16"`.
- `renderConsentText(input: { kind: PaymentMethodKind; academyName: string; version: string }): string` — lanza si la versión no es la vigente.
- `consentTextSha256(text: string): string` — SHA-256 hex del texto UTF-8 exacto (usar `node:crypto`).
- `truncateClientIp(raw: string | null): string | null` y `truncateUserAgent(raw: string | null): string | null` (ver Global Constraints; IP inválida → `null`; toma la primera entrada de una lista `a, b`).
- `evaluateFamilyPaymentMethodAvailability(input) → { available: true; kinds: PaymentMethodKind[] } | { available: false; reason }`, razones en este orden: `flag_off`, `environment_unknown`, `live_not_released`, `storage_missing`, `not_payer`, `account_not_ready`, `paid_plan_required`. Con la cuenta lista, `kinds` es `["card"]` más `"sepa_debit"` si SEPA está `active`.
- `verifyCompletedSetupIntent(expected: { attemptId; customerReference; kind }, setupIntent: SetupIntentSnapshot) → { outcome: "succeeded"; paymentMethodReference; mandateReference: string | null } | { outcome: "pending" } | { outcome: "failed" } | { outcome: "mismatch" }`. `SetupIntentSnapshot = { id; status; customer: string | null; paymentMethod: string | null; paymentMethodType: string | null; mandate: string | null; metadataAttemptId: string | null }`. `mismatch` si cualquier dato no coincide; `succeeded` exige `paymentMethod`, tipo igual a `kind` y, para `sepa_debit`, `mandate`. `processing`/`requires_action`/`requires_confirmation`/`requires_payment_method` → `pending`; `canceled` → `failed`.
- `config.ts`: `isFamilyPaymentMethodsFlagEnabled()` (texto exacto `"true"`), reexporta `resolveConnectEnvironment` e `isProductionDatabase` de payments-connect.

Texto (borrador; Zaltyko no redacta texto de orden SEPA):

- tarjeta: «Autorizo a {academia} a cobrar automáticamente en esta tarjeta el importe de cada cuota que emita a mi familia. Puedo dejar de pagar automáticamente cuando quiera desde este portal. Los cobros ya enviados siguen su curso.»
- domiciliación: «Autorizo a {academia} a cobrar automáticamente en esta cuenta bancaria, por domiciliación, el importe de cada cuota que emita a mi familia. Puedo dejar de pagar automáticamente cuando quiera desde este portal. Los cobros ya enviados siguen su curso.»

- [ ] **Step 1: Tests** de cada función: hash estable y distinto por academia y tipo; versión desconocida lanza; IPv4 `203.0.113.77` → `203.0.113.0`; IPv6 `2001:db8:1:2::5` → `2001:db8:1::`; `"203.0.113.77, 10.0.0.1"` → `203.0.113.0`; basura → `null`; agente de 300 caracteres con `\n` → 120 sin control; orden de razones de disponibilidad (una por caso); SEPA no activa → `kinds = ["card"]`; cada rama de `verifyCompletedSetupIntent`, incluidos customer distinto, attempt distinto, tipo distinto y SEPA sin mandate (`mismatch`).
- [ ] **Step 2: Implementar.** **Step 3: Run.** **Step 4: Commit** «Cobros familia: dominio de consentimiento y disponibilidad».

### Task 3: Adaptador Stripe sobre la cuenta conectada

**Files:**
- Create: `src/modules/family-payment-methods/infrastructure/stripe-family-gateway.ts`
- Test: `tests/family-payment-methods-gateway.test.ts`

**Interfaces (Produces):**
```ts
export interface FamilyPaymentGateway {
  createCustomer(input: { connectedAccount: string; organizationId: string; familyPayerId: string; idempotencyKey: string }): Promise<{ id: string }>;
  createSetupIntent(input: { connectedAccount: string; customer: string; kind: PaymentMethodKind; organizationId: string; familyPayerId: string; attemptId: string }): Promise<{ id: string; clientSecret: string }>;
  retrieveSetupIntent(input: { connectedAccount: string; setupIntentId: string }): Promise<SetupIntentSnapshot>;
  detachPaymentMethod(input: { connectedAccount: string; paymentMethod: string }): Promise<void>;
}
export function createStripeFamilyGateway(stripe?: Stripe): FamilyPaymentGateway;
```
- Todas con `{ stripeAccount: connectedAccount }`. Customer: solo `metadata` de ids, clave `zaltyko-family-customer:${providerAccountRowId}:${familyPayerId}` (la pasa el servicio). SetupIntent: `payment_method_types: [kind]`, `usage: "off_session"`, `customer`, metadata de ids, clave `zaltyko-family-setup:${attemptId}`. `retrieveSetupIntent` con `expand: ["payment_method"]` solo para leer `payment_method.type`; nunca devuelve otros campos del método. `detachPaymentMethod` ignora `resource_missing` y un método ya desligado.
- Cliente Stripe como `createStripeConnectGateway` (misma apiVersion; sin crear cliente con clave vacía).

- [ ] **Step 1: Tests** con un `Stripe` falso: parámetros exactos de cada llamada (incluida la cabecera `stripeAccount` y la clave de idempotencia), metadata solo con ids, ninguna llamada envía email/nombre, `resource_missing` en detach no lanza, otros errores sí.
- [ ] **Step 2: Implementar.** **Step 3: Run.** **Step 4: Commit** «Cobros familia: adaptador Stripe en la cuenta de la academia».

### Task 4: Almacén y servicio de aplicación

**Files:**
- Create: `src/modules/family-payment-methods/infrastructure/family-payment-store.ts`
- Create: `src/modules/family-payment-methods/application/family-payment-methods-service.ts`
- Test: `tests/family-payment-methods-service.test.ts` (unitario con dobles) y amplía `tests/family-payment-methods-pg.test.ts`

**Interfaces (Produces):**
```ts
export type FamilyPaymentMethodState =
  | { kind: "unavailable"; reason: FamilyPaymentUnavailableReason }
  | { kind: "none"; kinds: PaymentMethodKind[]; academyName: string; consentVersion: string; consentTexts: Partial<Record<PaymentMethodKind, string>> }
  | { kind: "active"; method: PaymentMethodKind; since: string; kinds: PaymentMethodKind[]; academyName: string; consentVersion: string; consentTexts: Partial<Record<PaymentMethodKind, string>> };

getFamilyPaymentMethodState(input: { userId: string; organizationId: string; familyId: string; now?: Date }, deps?): Promise<FamilyPaymentMethodState>;
startFamilyPaymentSetup(input: { userId; organizationId; familyId; kind: PaymentMethodKind; consentVersion: string; consentAccepted: true; clientIp: string | null; userAgent: string | null; now?: Date }, deps?): Promise<{ clientSecret: string; connectedAccount: string; setupIntentId: string }>;
completeFamilyPaymentSetup(input: { userId; organizationId; familyId; setupIntentId: string; now?: Date }, deps?): Promise<{ outcome: "active"; method: PaymentMethodKind } | { outcome: "pending" }>;
revokeFamilyPaymentMethod(input: { userId; organizationId; familyId; now?: Date }, deps?): Promise<{ outcome: "revoked" | "none" }>;
listOwnerFamilyPaymentMethods(input: { userId; organizationId }): Promise<Array<{ authorizationId; familyId; payerName: string; method: PaymentMethodKind; since: string }>>;
revokeFamilyPaymentMethodByOwner(input: { userId; organizationId; authorizationId; now?: Date }, deps?): Promise<{ outcome: "revoked" | "none" }>;
```
`deps = { gateway?: FamilyPaymentGateway }`.

Reglas:

- **Pagador:** `resolveFamilyPayer({ userId, organizationId, familyId, now })` en el almacén → `{ guardianId, familyPayerId }` o `null` (misma cadena que `family-portal-access.ts`; fecha local de la academia). `null` → `OperationalError("NOT_FOUND", …, 404)`; nunca dice si la familia existe.
- **Disponibilidad:** se evalúa en `getFamilyPaymentMethodState`, en `start` y otra vez en `complete`. No disponible en una escritura → `OperationalError("FEATURE_NOT_AVAILABLE", …, 503)`; método no ofrecido (`kinds`) → 409.
- **Consentimiento:** `consentAccepted` debe ser `true` y `consentVersion` la vigente, si no 400. El SHA-256 se calcula en el servidor sobre `renderConsentText` con el nombre de la academia de la base.
- **start:** sin transacción abierta durante Stripe. (1) lee y valida; (2) Customer: el `provider_customer_reference` del último intento de ese (cuenta, pagador), o `createCustomer`; (3) `attemptId = randomUUID()`, `createSetupIntent`; (4) inserta el intento `open` con la evidencia; audit + outbox `family_payment_methods.setup_started` (metadata: ids, `kind`, `consentVersion`; sin IP ni agente). Si el insert falla, el SetupIntent queda huérfano sin `clientSecret` entregado: `logger.warn` con `seti_…`.
- **complete:** busca el intento por `(organization_id, provider_setup_reference)` y exige que su pagador sea el de la sesión (si no, 404). Si ya está `completed`, devuelve el resultado sin llamar a Stripe. Si no, `retrieveSetupIntent` fuera de transacción y `verifyCompletedSetupIntent`: `mismatch` → 404; `pending` → `{ outcome: "pending" }`; `failed` → marca `abandoned`, 409. `succeeded` → transacción: `FOR UPDATE` del intento (si otro lo completó, devolver eso); revoca la activa anterior de ese (cuenta, pagador) si existe; inserta la autorización `active` (`provider_setup_reference`, `payment_method_reference`, `mandate_reference`, `payment_method_kind`, `consent_version`, `consent_evidence_reference = "family_payment_setup_attempts:" + attemptId`, `consent_evidence_sha256`, `consented_at`, `consented_by_guardian_id`); intento `completed` + `authorization_id`; audit + outbox `family_payment_methods.authorization_activated` (y `…authorization_revoked` para la anterior). Tras el commit, `detachPaymentMethod` del método anterior (fallo → `logger.error`, sin deshacer).
- **revoke (familia y academia):** transacción: `FOR UPDATE` de la activa, `status='revoked'`, `revoked_at=now`; audit + outbox `family_payment_methods.authorization_revoked` (`actor`: `family` u `owner`). Tras el commit, `detachPaymentMethod`. Sin activa → `{ outcome: "none" }`.
- **Academia:** `resolveOwnerScope` y exigir owner/admin con `locationScopeMode === "all"` (como Fase 1), si no 403. `listOwnerFamilyPaymentMethods` devuelve solo activas del entorno actual, con nombre del tutor pagador (`people.given_name` + primer apellido), como mucho 200 filas.
- Reutilizar `appendAuditEntry`/`appendOutboxEvent`; `targetType` `"family_payment_authorization"`.

- [ ] **Step 1: Tests unitarios** (gateway falso, almacén real solo en pg): orden de comprobaciones; consentimiento ausente o de otra versión → 400 sin llamar a Stripe; reutiliza Customer; `complete` con `pending`/`failed`/`mismatch`; `complete` ya completado no llama a Stripe; academia deja de estar lista antes de `complete` → 503 sin escribir.
- [ ] **Step 2: Tests pg:** fixture academia + cuenta activa + familia + tutor pagador (como `payments-connect-pg.test.ts`); start → complete activa una fila con evidencia y kind; dos `complete` simultáneos → una sola fila activa; cambio de método → la anterior `revoked` y `detach` llamado con su `pm_…`; revoke por familia y por academia; otro tutor no pagador de la misma familia → 404; tutor de otra academia → 404.
- [ ] **Step 3: Implementar.** **Step 4: Run.** **Step 5: Commit** «Cobros familia: servicio para guardar y revocar el método».

### Task 5: Rutas de la familia y de la academia

**Files:**
- Create: `src/app/api/v1/family/payment-methods/route.ts` (`POST` con `action: "setup" | "complete" | "revoke"`)
- Create: `src/app/api/v1/owner/payments/family-methods/route.ts` (`POST` revocar)
- Modify: `src/lib/rate-limit.ts` (entrada `/api/v1/owner/payments/family-methods`: 20/60)
- Test: `tests/api-family-payment-methods-routes.test.ts`

Reglas:

- Familia: `withFamilyUser(request, { mutation: true, limit: { limit: 10, window: 60 } }, …)`. Cuerpo validado con Zod `.strict()` (uuid de academia y familia; `kind` del enum; `consentAccepted: z.literal(true)`; `setupIntentId` con `^seti_[A-Za-z0-9]+$`). IP de `x-forwarded-for` (primera entrada) o `x-real-ip`; agente de `user-agent`; ambos se recortan en el dominio.
- Bandera de esta fase apagada → 503 `FEATURE_NOT_AVAILABLE` antes de leer el cuerpo.
- Respuestas con `apiSuccess`; errores como el resto de rutas de familia (`familyRouteError`). `setup` devuelve `{ clientSecret, connectedAccount }` y nada más.
- Academia: patrón de `src/app/api/v1/owner/payments/connect/route.ts` (mismo origen, sesión, `resolveOwnerScope` dentro del servicio, límite, `no-store`). Cuerpo `{ organizationId, authorizationId }`.
- Anotaciones de `scripts/lib/route-auth-classifier.ts` en los dos handlers.

- [ ] **Step 1: Tests** con el servicio simulado: sin sesión 401; otro origen 403; bandera apagada 503; cuerpo con campo extra 400; cada acción llama al servicio con los datos esperados (IP ya entera: el recorte lo hace el servicio); errores del servicio mapeados; cabecera `no-store`; la respuesta de `setup` no lleva nada más que `clientSecret` y `connectedAccount`.
- [ ] **Step 2: Implementar.** **Step 3: Run** (incluye `audit:routes`/clasificador en CI). **Step 4: Commit** «Cobros familia: rutas para guardar y revocar».

### Task 6: Pantalla de la familia en `/familia/cuotas`

**Files:**
- Create: `src/components/family-portal/FamilyAutomaticPaymentCard.tsx` (cliente)
- Modify: `src/app/familia/cuotas/page.tsx` (lee `getFamilyPaymentMethodState` por cada `feeFamilyId` de cada academia; si falla, no muestra la tarjeta)
- Modify: `src/components/family-portal/FamilyFeesView.tsx` (acepta y muestra la tarjeta dentro de la sección de su academia; la demo pública no la recibe)
- Test: `tests/family-automatic-payment-card.test.tsx`

Estados:

- `unavailable`: no se muestra nada.
- `none`: título «Pago automático»; texto «Guarda una tarjeta o domicilia el pago para que las cuotas se cobren solas. Todavía no se cobrará nada.»; radios «Tarjeta» y «Domiciliación bancaria» (solo los de `kinds`); el texto de consentimiento del método elegido y casilla «Acepto»; botón «Continuar» (desactivado sin casilla) → `setup` → Payment Element (`<Elements stripe={loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, { stripeAccount })} options={{ clientSecret, locale: "es" }}>`) → «Guardar» → `confirmSetup({ elements, confirmParams: { return_url: <origen>/familia/cuotas?pago=vuelta&organizationId=…&familyId=… }, redirect: "if_required" })` → `complete`.
- `active`: «Pagas automáticamente con tarjeta» / «…con domiciliación bancaria», «desde el {fecha}»; botones «Cambiar método» (vuelve al flujo de `none`) y «Dejar de pagar automáticamente» (confirmación en la propia tarjeta → `revoke`).
- Vuelta del 3DS: si la URL trae `pago=vuelta`, `setup_intent` y coinciden academia y familia, llama a `complete` una vez y limpia la URL con `history.replaceState`. `pending` → «Tu banco todavía lo está confirmando. Vuelve a mirar en unos minutos.»
- Errores en lenguaje sencillo; nunca muestra códigos de Stripe ni el `clientSecret`. La clave publicable se lee de `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; si falta, la tarjeta dice «El pago automático no está disponible ahora mismo».

- [ ] **Step 1: Tests** (mock de `@stripe/react-stripe-js` y `@stripe/stripe-js`, `fetch` simulado): cada estado; «Continuar» desactivado sin casilla; solo ofrece SEPA si está en `kinds`; envío de `setup` con versión y `consentAccepted: true`; `confirmSetup` sin redirección → `complete` → «Tarjeta guardada»; vuelta con `setup_intent` → un solo `complete`; revocar pide confirmación; nombres accesibles de botones y radios.
- [ ] **Step 2: Implementar.** **Step 3: Run.** **Step 4: Commit** «Cobros familia: pago automático en el portal».

### Task 7: Panel de la academia en `/owner/familias`

**Files:**
- Create: `src/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel.tsx`
- Modify: `src/app/owner/familias/page.tsx` (solo con `allSites`, bandera de esta fase y almacén disponible; si la lectura falla, no se muestra)
- Test: `tests/owner-family-payment-methods-panel.test.tsx`

- Título «Pago automático de las familias». Lista: nombre del tutor pagador, «Tarjeta» o «Domiciliación bancaria», «desde el {fecha}», botón «Dejar de cobrar automáticamente» con confirmación → `POST /api/v1/owner/payments/family-methods`. Vacío: «Ninguna familia ha guardado todavía un método de pago.» Texto de ayuda: «Revocar no anula los cobros ya enviados.»

- [ ] **Step 1: Tests:** lista, vacío, confirmación y envío, error. **Step 2: Implementar.** **Step 3: Run.** **Step 4: Commit** «Cobros familia: revocar desde Familias».

### Task 8: Documentación

**Files:** `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md` (estado de Fase 2 y «Decisiones mías» nuevas), `docs/COBROS_Y_CUOTAS.md` (sección «Pago automático de la familia (Fase 2)»: quién, pantalla, rutas, variables, datos, estado, cerrojos, deuda), `.env.example` (`ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED=false`), `docs/deployment/candidates/README.md`, `vault/06-Roadmap-y-Tareas/Changelog interno.md`, la nota de decisiones del vault que usó la Fase 1.

- Deuda a documentar: sin respaldo por evento si la familia cierra el navegador tras el 3DS (lo cubre la Fase 4 con `setup_intent.succeeded`); texto de consentimiento en borrador hasta L3; Customer v1 sobre cuenta v2 por verificar en staging; la tabla nueva debe entrar en el catálogo de derechos de datos (`src/modules/data-rights/application/catalog.ts`, excluida como `payment_authorizations`) antes de aplicarla en producción.

- [ ] **Step 1: Escribir.** **Step 2: Run** (`audit:env` y documentación en CI). **Step 3: Commit** «Cobros familia: documentación de la Fase 2».

### Task 9: Staging (necesita autorización de Elvis)

Pedir a Elvis, una sola vez: aplicar la candidata en Supabase staging (`oucxnnrtfmjjlnffldfc`), poner `ZALTYKO_FAMILY_PAYMENT_METHODS_ENABLED=true` en Vercel staging y comprobar que `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` de staging es `pk_test_` del «Entorno de prueba de Zaltyko». Recorrido: tutor pagador de prueba guarda la tarjeta `4242…`, después `4000 0027 6000 3184` (3DS), cambia a SEPA con el IBAN de prueba `ES0700120345030000067890`, revoca; la academia revoca desde Familias. Requiere la cuenta sandbox de la academia en «Lista para cobrar» (pendiente de Elvis desde la Fase 1).
