# Cobro automático — Fase 1 «Conectar Stripe»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una academia española con Starter o Growth conecta su propia cuenta Stripe (Accounts v2) desde `/owner/settings`. Zaltyko guarda y mantiene al día el estado de esa cuenta, sin hacer ningún cobro.

**Architecture:** Módulo nuevo `src/modules/payments-connect/`, separado del legacy `src/lib/stripe/*`, con tres capas:

- **dominio** puro: estado de la cuenta y disponibilidad;
- **infraestructura**: el adaptador Stripe v2 detrás de una interfaz;
- **aplicación**: el servicio, que escribe con auditoría y outbox.

Rutas:

- de la academia, bajo `/api/v1/owner/payments/connect*`;
- webhook de eventos *thin* v2 en `/api/stripe/connect/accounts-webhook`.

Persistencia:

- sobre `zaltyko.organization_payment_provider_accounts`;
- una migración candidata añade dos columnas.

**Tech Stack:** Next.js 15 App Router, Drizzle + `drizzle-orm/sql`, `stripe@^22.6.2` (apiVersion `2026-08-26.dahlia`, namespace `stripe.v2.core.*`), Zod, Vitest.

**Spec:** `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md`, sección «Fase 1» y «Decisiones mías». También ADR-0022 y ADR-0020.

## Global Constraints

**Entornos y verificación**

- No se ejecutan builds, tests, typecheck, lint ni instalaciones en el Mac.
- Cada «Run» de este plan es: hacer push de la rama y comprobar en GitHub Actions los runs del SHA de cabeza ya completados. `gh pr checks` vacío no cuenta como verde.
  - Los tests web corren en `ci.yml`.
  - Los `*-pg.test.ts` los descubre solo `postgres-integration.yml`.
- No tocar `scripts/ci/verify-sandbox-schema-replay.sh`, `supabase/schema-snapshot-manifest.json` ni `.github/workflows/ci-isolated.yml`.
- Nada contra Stripe Live ni contra Vercel o Supabase de producción.
  - En staging están autorizados: el destino de eventos sandbox, el secreto y la bandera en Vercel staging, y la candidata en Supabase staging.
- **Live cerrado por código en esta fase:** si la clave de Stripe es live, la función responde «no disponible».

**Datos y secretos**

- Ningún secreto ni dato personal en el repositorio, en logs ni en mensajes.
- Solo se guardan referencias opacas `acct_…` y códigos de estado.
- La migración va como candidata en `docs/deployment/candidates/`, no en `supabase/migrations/`.

**Reglas de negocio**

- Sin `application_fee`.
- No se cambian precios.
- No se reabre ningún prefijo de `RETIRED_LAUNCH_API_PREFIXES`. `/api/academy/stripe-connect` sigue en 410.
- Bandera: `ZALTYKO_CONNECT_ONBOARDING_ENABLED === "true"`, apagada por defecto.
- Secreto del webhook: `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET`.
- Solo `organizations.country_code = 'ES'`.
- Solo plan de pago vigente: `evaluateAutomaticCollectionPlanEligibility(...).eligible === true`. La prueba (`trialing`) no cuenta.
- Rol: owner, o admin con `locationScopeMode = "all"`. La página `/owner/settings` ya es solo para owner con todas las sedes.

**Cuenta Stripe que se crea**

- `dashboard: "full"`.
- `defaults.responsibilities = { fees_collector: "stripe", losses_collector: "stripe" }`.
- `defaults.currency = "eur"`, `identity.country = "es"`.
- `configuration.merchant.capabilities`: `card_payments` y `sepa_debit_payments` con `requested: true`.

**Textos y código**

- Copy en español de academia, sin jerga.
  - Usar «Conectar Stripe», «cobro automático de cuotas», «tarjeta», «domiciliación».
  - Nunca «onboarding», «capability», «Connect» ni «webhook».
- Las rutas usan `problemResponse`/`operationalProblem` de `@/app/api/v1/problem` y llevan `cache-control: private, no-store`.
- Cada handler nuevo lleva la anotación `@route-auth` o `@auth-flexible route-guard-reason` que exige `scripts/lib/route-auth-classifier.ts`.

## Review Focus

1. **Doble clic en «Conectar Stripe» o dos pestañas a la vez.**
   - Debe quedar una sola cuenta Stripe y una sola fila.
   - Se consigue con la clave de idempotencia estable y `on conflict do nothing` + relectura. Lo prueba el test de concurrencia de la Tarea 5.
2. **El usuario vuelve de Stripe sin terminar (o pulsa «Guardar para después»).**
   - La pantalla debe decir «Stripe necesita más datos», no «Lista para cobrar».
   - Lo cubre la Tarea 2 (entrada de requisitos pendiente → `onboarding` + `user_action`).
3. **El enlace de Stripe ha caducado o ya se usó** (Stripe envía a `refresh_url`).
   - Debe generarse un enlace nuevo y redirigir, sin error en pantalla.
   - Tarea 6, test de la ruta `link`.
4. **Llega un evento de una cuenta que no es nuestra, o del otro entorno.**
   - Se ignora con 200 y sin escribir nada.
   - Tarea 6, test del webhook.
5. **La migración candidata no está aplicada y la bandera está encendida.**
   - Ni la pantalla ni el webhook deben fallar con 500: hay que responder «no disponible».
   - Tareas 1 y 6.

---

### Task 1: Migración candidata, espejo Drizzle y puerta de almacenamiento

**Files:**
- Create: `docs/deployment/candidates/20261116120000_connect_onboarding_candidate.sql`
- Modify: `src/db/schema/zaltyko-core.ts` (tabla `organizationPaymentProviderAccounts`, ~l. 899)
- Create: `src/modules/payments-connect/application/storage.ts`
- Modify: `docs/deployment/candidates/README.md` (añadir fila «No aplicada»)
- Test: `tests/payments-connect-pg.test.ts` (solo el bloque de esquema; la Tarea 5 lo amplía)

**Interfaces:**
- Produces:
  - `isConnectOnboardingStorageAvailable(executor?: Pick<DatabaseClient,"execute">): Promise<boolean>`
  - `CONNECT_ONBOARDING_UNAVAILABLE_REASON = "connect_onboarding_unavailable"`
  - Columnas Drizzle `sepaDebitPaymentsCapabilityStatus: text`, `requirementsState: text`.

- [ ] **Step 1: Escribir el test pg** `describe("connect onboarding candidate schema")`, con el mismo arnés de destino desechable que `tests/payment-reminders-pg.test.ts`. Instala la candidata leyendo el archivo y comprueba:
  - las columnas existen: `sepa_debit_payments_capability_status text not null default 'pending'` y `requirements_state text not null default 'user_action'`;
  - `requirements_state` rechaza `'otro'` (check `in ('none','user_action','stripe_review','past_due')`);
  - `sepa_debit_payments_capability_status = '  '` se rechaza (`btrim <> ''`);
  - una segunda ejecución de la candidata aborta con la excepción del preflight;
  - `isConnectOnboardingStorageAvailable()` es `false` antes de instalar y `true` después.
  - En `afterAll` elimina las dos columnas.
- [ ] **Step 2: Run.** Push y comprobar que `postgres-integration.yml` falla en este test: el archivo SQL todavía no existe.
- [ ] **Step 3: Escribir la candidata.**
  - Cabecera como `20261114120500_payment_reminders_candidate.sql`: «CANDIDATE ONLY…», propósito, RGPD (solo códigos, sin datos personales).
  - Preflight que aborta si las columnas ya existen o si falta la tabla.
  - Un `alter table zaltyko.organization_payment_provider_accounts add column …` con los dos checks.
  - `comment on column` en ambas.
  - No toca grants: la tabla ya es solo de `service_role`.
- [ ] **Step 4: Espejo Drizzle y `storage.ts`.**
  - `storage.ts` solo lee `information_schema.columns`, como `src/modules/payment-reminders/application/storage.ts`.
  - Añadir la fila al README de candidatas, con SHA-256 calculado con `shasum -a 256` (no es un build) y estado «No aplicada».
- [ ] **Step 5: Run.** Push; el test pg pasa y `ci.yml` sigue verde.
- [ ] **Step 6: Commit** «Cobros Connect: candidata de estado SEPA y requisitos».

### Task 2: Dominio — estado de la cuenta a partir de la cuenta v2

**Files:**
- Create: `src/modules/payments-connect/domain/account-projection.ts`
- Test: `tests/payments-connect-account-projection.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RequirementsState = "none" | "user_action" | "stripe_review" | "past_due";
  export interface ConnectAccountSnapshot {          // lo mínimo que lee el adaptador (Tarea 4)
    id: string; closed: boolean;
    cardPaymentsStatus: string | null;              // configuration.merchant.capabilities.card_payments.status
    sepaDebitPaymentsStatus: string | null;         // …sepa_debit_payments.status
    requirementEntries: Array<{ deadlineStatus: "currently_due" | "past_due" | "eventually_due"; awaitingActionFrom: "user" | "stripe" }>;
  }
  export interface ConnectAccountProjection {
    status: "onboarding" | "restricted" | "active" | "disabled";
    cardPaymentsCapabilityStatus: string;            // null → "pending"
    sepaDebitPaymentsCapabilityStatus: string;       // null → "pending"
    requirementsState: RequirementsState;
  }
  export function projectConnectAccount(s: ConnectAccountSnapshot): ConnectAccountProjection;
  export function projectionChanged(a: ConnectAccountProjection, b: ConnectAccountProjection): boolean;
  ```

- [ ] **Step 1: Tests de tabla.** Cada fila es entrada → `status` / `requirementsState`.

  | Entrada | `status` | `requirementsState` |
  |---|---|---|
  | `closed: true` | `disabled` | se ignora |
  | Una entrada `past_due`/`user` | `restricted` | `past_due` |
  | Una entrada `currently_due`/`user`, tarjeta `pending` | `onboarding` | `user_action` |
  | Solo entradas `currently_due`/`stripe`, tarjeta `pending` | `onboarding` | `stripe_review` |
  | Sin entradas `currently_due`/`past_due`, tarjeta `active`, SEPA `pending` | `active` | `none` |
  | Sin entradas, tarjeta `restricted` | `restricted` | `none` |
  | Solo entradas `eventually_due`, tarjeta `active` | `active` | `none` |

  Además:
  - En la fila de tarjeta `active` con SEPA `pending`: `sepaDebitPaymentsCapabilityStatus` vale `pending`.
  - Las capacidades `null` se proyectan como `"pending"`.
  - `projectionChanged` es `false` con dos proyecciones iguales y `true` si cambia un solo campo.
- [ ] **Step 2: Run** (push; falla: el módulo no existe).
- [ ] **Step 3: Implementar.**
  - Orden de reglas: `closed` → `past_due` → `currently_due` (`user` antes que `stripe`) → tarjeta.
  - El estado `pending` del enum de base no se produce nunca. La fila nace en `onboarding` (ver Tarea 5).
- [ ] **Step 4: Run** (verde).
- [ ] **Step 5: Commit.**

### Task 3: Disponibilidad — bandera, entorno, país, plan y rol

**Files:**
- Create: `src/modules/payments-connect/domain/availability.ts`
- Create: `src/modules/payments-connect/application/config.ts`
- Create: `src/modules/billing/application/plan-state.ts` (mover aquí `loadPlanState` de `family-collection-preferences.ts` sin cambiar su SQL)
- Modify: `src/modules/billing/application/family-collection-preferences.ts` (importar el loader movido)
- Test: `tests/payments-connect-availability.test.ts`, `tests/payments-connect-config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // config.ts
  export function isConnectOnboardingFlagEnabled(): boolean;              // ZALTYKO_CONNECT_ONBOARDING_ENABLED === "true"
  export function resolveConnectEnvironment(): "test" | "live" | null;    // por prefijo de STRIPE_SECRET_KEY: sk_test_/rk_test_ → test; sk_live_/rk_live_ → live; otro/ausente → null
  // plan-state.ts
  export interface OrganizationPlanState { entitlement: EntitlementSnapshot | null; subscription: SaasSubscriptionProjection | null }
  export function loadOrganizationPlanState(executor: Pick<typeof db,"execute">, organizationId: string): Promise<OrganizationPlanState>;
  // availability.ts
  export type ConnectUnavailableReason =
    | "flag_off" | "environment_unknown" | "live_not_released" | "storage_missing"
    | "role_not_allowed" | "country_not_supported" | "paid_plan_required";
  export type ConnectAvailability = { available: true; environment: "test" } | { available: false; reason: ConnectUnavailableReason };
  export function evaluateConnectAvailability(input: {
    flagEnabled: boolean; environment: "test" | "live" | null; storageAvailable: boolean;
    member: { role: string; locationScopeMode: string };
    countryCode: string; planState: OrganizationPlanState; organizationId: string; now?: Date;
  }): ConnectAvailability;
  ```

- [ ] **Step 1: Tests.** Un caso por motivo, en este orden de prioridad:
  1. `flag_off`
  2. `environment_unknown`
  3. `live_not_released`: el entorno `live` siempre se rechaza en esta fase.
  4. `storage_missing`
  5. `role_not_allowed`:
     - `coach` → `role_not_allowed`;
     - `admin` con `locationScopeMode: "selected"` → `role_not_allowed`;
     - `admin` con `"all"` pasa.
  6. `country_not_supported`: `MX` → `country_not_supported`.
  7. `paid_plan_required`: `free`, y suscripción en `trialing` → `paid_plan_required`.

  Starter activa + `ES` + `test` → `{ available: true, environment: "test" }`.

  En `config`:
  - `sk_live_x` → `live`;
  - `rk_test_x` → `test`;
  - `undefined` → `null`.
- [ ] **Step 2: Run** (falla).
- [ ] **Step 3: Implementar.**
  - La regla de plan reutiliza `evaluateAutomaticCollectionPlanEligibility` de `plan-eligibility.ts`.
  - Mover `loadPlanState` sin tocar el SQL. Los tests existentes de preferencias deben seguir verdes.
- [ ] **Step 4: Run** (verde, incluidos los tests de `family-collection-preferences`).
- [ ] **Step 5: Commit.**

### Task 4: Adaptador Stripe v2

**Files:**
- Create: `src/modules/payments-connect/infrastructure/stripe-connect-gateway.ts`
- Test: `tests/payments-connect-gateway.test.ts` (cliente Stripe simulado con `vi.fn`)

**Interfaces:**
- Consumes: `getStripeClient()` de `@/lib/stripe/client`; `ConnectAccountSnapshot` (Tarea 2).
- Produces:
  ```ts
  export interface ConnectAccountsGateway {
    createAccount(input: { organizationId: string; environment: "test"; displayName: string; contactEmail: string | null }): Promise<ConnectAccountSnapshot>;
    retrieveAccount(accountId: string): Promise<ConnectAccountSnapshot>;
    createOnboardingLink(input: { accountId: string; returnUrl: string; refreshUrl: string }): Promise<{ url: string }>;
    parseAccountEvent(rawBody: string, signature: string, secret: string):
      { eventId: string; type: string; accountId: string | null; livemode: boolean };
  }
  export function createStripeConnectGateway(stripe?: Stripe): ConnectAccountsGateway;
  export function connectAccountIdempotencyKey(organizationId: string, environment: "test" | "live"): string; // `zaltyko-connect-account:${environment}:${organizationId}`
  ```

- [ ] **Step 1: Tests.**
  - `createAccount` llama a `stripe.v2.core.accounts.create` con:
    - `dashboard: "full"`;
    - `identity: { country: "es" }`;
    - `defaults.currency: "eur"`, `defaults.locales: ["es-ES"]`;
    - `defaults.responsibilities = { fees_collector: "stripe", losses_collector: "stripe" }`;
    - `configuration.merchant.capabilities.card_payments.requested === true` y lo mismo para `sepa_debit_payments`;
    - `metadata` con `zaltyko_organization_id` y `zaltyko_environment` únicamente;
    - `include` con `configuration.merchant`, `requirements` e `identity`;
    - `{ idempotencyKey: connectAccountIdempotencyKey(org, "test") }`.
    - No pasa `application_fee` ni nada de `recipient`.
  - `retrieveAccount` pide el mismo `include` y convierte `requirements.entries[].minimum_deadline.status` / `awaiting_action_from` en `requirementEntries`.
  - `createOnboardingLink` llama a `stripe.v2.core.accountLinks.create` con:
    - `use_case.type = "account_onboarding"`;
    - `configurations: ["merchant"]`;
    - `collection_options: { fields: "eventually_due" }`;
    - las dos URL.
  - `parseAccountEvent` delega en `stripe.parseEventNotification`. Si la firma es inválida, propaga el error.
- [ ] **Step 2: Run** (falla).
- [ ] **Step 3: Implementar.**
  - Ajustar nombres de método y tipos exactos a las definiciones de `stripe@22`. Si un nombre difiere, manda el typecheck de CI.
  - Nunca registrar en logs el cuerpo de la cuenta.
- [ ] **Step 4: Run** (verde, typecheck incluido).
- [ ] **Step 5: Commit.**

### Task 5: Servicio de aplicación

**Files:**
- Create: `src/modules/payments-connect/application/connect-onboarding-service.ts`
- Test: `tests/payments-connect-service.test.ts` (gateway y DB simulados) y bloque de servicio en `tests/payments-connect-pg.test.ts`

**Interfaces:**
- Consumes: Tareas 1–4; `resolveOwnerScope` (`@/modules/owner-dashboard/application/owner-scope`); `appendAuditEntry`/`appendOutboxEvent` (`@/modules/shared/infrastructure/transactional-records`); `getAppUrl` (`@/lib/env`).
- Produces:
  ```ts
  export type ConnectScreenState =
    | { kind: "unavailable"; reason: ConnectUnavailableReason }
    | { kind: "not_connected" }
    | { kind: "needs_details" | "in_review" | "ready" | "problem"; card: string; sepa: string; disabled: boolean };
  export function getConnectStatus(input: { userId: string; organizationId: string; refresh: boolean }, deps?: { gateway?: ConnectAccountsGateway; now?: Date }): Promise<ConnectScreenState>;
  export function startConnectOnboarding(input: { userId: string; organizationId: string }, deps?: …): Promise<{ url: string }>;
  export function syncConnectAccountFromEvent(input: { eventId: string; accountId: string; livemode: boolean }, deps?: …): Promise<"synced" | "unchanged" | "ignored">;
  export const CONNECT_RETURN_PATH = "/owner/settings";       // + ?organizationId=…&stripe=vuelta#cobro-automatico
  export const CONNECT_LINK_ROUTE = "/api/v1/owner/payments/connect/link"; // refresh_url, + ?organizationId=…
  ```
- Mapa a `ConnectScreenState`:

  | Fila | Estado de pantalla |
  |---|---|
  | No hay fila | `not_connected` |
  | `onboarding` + `user_action` | `needs_details` |
  | `onboarding` + `stripe_review` | `in_review` |
  | `active` | `ready` |
  | `restricted` | `problem` |
  | `disabled` | `problem` con `disabled: true` |

- Reglas:
  - Si `getConnectStatus` recibe `refresh` y `last_synced_at` tiene más de 60 s, lee la cuenta y proyecta.
  - `startConnectOnboarding`:
    1. Disponibilidad. Si no está disponible, `OperationalError("CONNECT_UNAVAILABLE", …, 409, { reason })`.
    2. Si no hay fila: `gateway.createAccount` fuera de transacción. Después `insert … on conflict (organization_id, processor, environment) do nothing`, con `status 'onboarding'` y la proyección. Si no se insertó, se relee la fila existente y se registra un aviso con las dos `acct_` (solo ids).
    3. `createOnboardingLink` con return y refresh absolutos.
  - Proyectar = `update … set` columnas, `revision = revision + 1`, `last_synced_at = now()` y `last_provider_event_reference` si viene de un evento. Va en una transacción con `appendAuditEntry` (`payments_connect.account_synced`) y `appendOutboxEvent`.
    - Solo si `projectionChanged`. Si no cambia, solo se actualiza `last_synced_at`.
    - La creación audita `payments_connect.account_created`.
  - `syncConnectAccountFromEvent`:
    - devuelve `ignored` si `livemode` no coincide con `resolveConnectEnvironment()`, si falta el almacenamiento o si la `acct_` no está en la tabla;
    - en otro caso lee la cuenta y proyecta.

- [ ] **Step 1: Tests unitarios.** Uno por regla, con un gateway falso:
  - sin fila → `not_connected`;
  - refresco con menos de 60 s → no llama a `retrieveAccount`;
  - proyección igual → no audita;
  - Free → error `CONNECT_UNAVAILABLE` con `reason: "paid_plan_required"` y **sin** llamar a `createAccount`;
  - evento de cuenta desconocida → `ignored` sin escribir.
- [ ] **Step 2: Tests pg** (en `tests/payments-connect-pg.test.ts`), con base real y gateway falso:
  - dos `startConnectOnboarding` concurrentes para la misma academia, con el gateway devolviendo la misma `acct_` (idempotencia) → una sola fila;
  - si el gateway devuelve `acct_` distintas → una fila y un aviso;
  - aislamiento: el owner de la academia B no ve la fila de A (`NOT_FOUND`/`FORBIDDEN` desde `resolveOwnerScope`);
  - el evento de la cuenta de A solo actualiza la fila de A e incrementa `revision` una vez.
- [ ] **Step 3: Run** (falla).
- [ ] **Step 4: Implementar.** Ninguna llamada a Stripe dentro de `db.transaction`.
- [ ] **Step 5: Run** (verde).
- [ ] **Step 6: Commit.**

### Task 6: Rutas — estado, inicio, enlace nuevo y webhook

**Files:**
- Create: `src/app/api/v1/owner/payments/connect/route.ts` (GET estado, POST iniciar/continuar)
- Create: `src/app/api/v1/owner/payments/connect/link/route.ts` (GET: refresh_url → 303 a un enlace nuevo)
- Create: `src/app/api/stripe/connect/accounts-webhook/route.ts` (POST)
- Modify: `src/lib/rate-limit.ts` (~l. 368: `"/api/stripe/connect/accounts-webhook": { limit: 1000, window: 60 }`)
- Test: `tests/api-payments-connect-routes.test.ts`, `tests/api-connect-accounts-webhook.test.ts`

**Interfaces:**
- Consumes: Tarea 5 y `getCurrentUser` (`@/lib/auth/current-user`), como `family-collection-preference/route.ts`.
- Produces:
  - `GET ?organizationId=&refresh=1` → `ConnectScreenState`.
  - `POST {organizationId}` → `{ url }`.
  - `GET link?organizationId=` → 303 a Stripe. Si falla, 303 a `/owner/settings?organizationId=…&stripe=error#cobro-automatico`.
  - Webhook → 200 `{received:true}` o `{ignored:true}`; 400 con firma inválida; 500 si Stripe o la DB fallan (para que Stripe reintente).

- [ ] **Step 1: Tests de rutas** (servicio simulado):
  - sin sesión → 401;
  - `organizationId` no guid → 400;
  - `CONNECT_UNAVAILABLE` → 409 con `reason` en el cuerpo;
  - POST correcto → 200 `{ url }` con `cache-control: private, no-store`;
  - `link` con sesión → 303 a la URL de Stripe;
  - `link` si el servicio falla → 303 a `/owner/settings?…&stripe=error#cobro-automatico`.
- [ ] **Step 2: Tests de webhook:**
  - sin `stripe-signature` → 400;
  - firma inválida → 400;
  - bandera apagada → 200 `{ignored:true}`;
  - sin `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET` → 503;
  - tipo no tratado (`v2.core.account_link.returned`) → 200 ignorado sin llamar al servicio;
  - `v2.core.account[requirements].updated` y `v2.core.account[configuration.merchant].capability_status_updated` → llaman a `syncConnectAccountFromEvent` con `related_object.id`;
  - el servicio lanza → 500.
- [ ] **Step 3: Run** (falla).
- [ ] **Step 4: Implementar.**
  - Anotaciones:
    - `@auth-flexible route-guard-reason: …` en las rutas owner (sesión + `resolveOwnerScope` dentro del servicio);
    - `@route-auth POST webhook` en el webhook.
  - El webhook lee `await request.text()` para el cuerpo crudo.
- [ ] **Step 5: Run** (verde, incluido el gate `auth-before-validate`).
- [ ] **Step 6: Commit.**

### Task 7: Pantalla «Cobro automático de cuotas» en Ajustes

**Files:**
- Create: `src/components/owner-dashboard/OwnerStripeConnectCard.tsx` (cliente)
- Modify: `src/app/owner/settings/page.tsx` (montar la tarjeta con `id="cobro-automatico"` bajo los datos de la academia, solo si `isConnectOnboardingFlagEnabled()`)
- Modify: `src/app/owner/payments/page.tsx` (con la bandera encendida y sin cuenta conectada: enlace «Cobrar las cuotas automáticamente» → `/owner/settings?organizationId=…#cobro-automatico`)
- Test: `tests/owner-stripe-connect-card.test.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/v1/owner/payments/connect` (Tarea 6), `ConnectScreenState`.

**Copy exacto por estado:**

1. **`not_connected`**
   - «Conecta tu cuenta de Stripe para que las cuotas se cobren solas. El dinero llega directo a tu cuenta.»
   - Botón «Conectar Stripe».
   - Nota: «Stripe te pedirá los datos de tu academia y tu cuenta bancaria. Zaltyko no se queda ninguna comisión.»
2. **`needs_details`**
   - «Stripe necesita más datos de tu academia.»
   - Botón «Seguir en Stripe».
3. **`in_review`**
   - «Stripe está revisando tus datos. Te avisaremos aquí cuando esté lista.»
4. **`ready`**
   - «Lista para cobrar.»
   - «Tarjeta: activa · Domiciliación: activa/pendiente». El texto depende de `card`/`sepa` (`active` → «activa», cualquier otro → «pendiente»).
   - Enlace «Abrir mi panel de Stripe» → `https://dashboard.stripe.com/`.
   - Nota: «El cobro automático de cuotas a las familias llegará en una próxima actualización.»
5. **`problem`**
   - «Stripe ha encontrado un problema con tu cuenta.»
   - Botón «Resolverlo en Stripe».
   - Con `disabled`: «Esta cuenta está cerrada. Escríbenos a hola@zaltyko.com.», sin botón.
6. **`unavailable`**
   - `paid_plan_required`: «El cobro automático está incluido en Starter y Growth.» + enlace «Ver planes» → `/owner/subscription`.
   - `country_not_supported`: «El cobro automático llegará más adelante a tu país. Mientras tanto, registra los pagos a mano.»
   - Cualquier otro motivo: la tarjeta no se muestra.

**Comportamiento:**

- `?stripe=vuelta`: al montar, se llama con `refresh=1`.
- `?stripe=error`: aviso «No hemos podido abrir Stripe. Inténtalo de nuevo.»
- Los botones se desactivan mientras esperan y redirigen con `window.location.assign(url)`.

- [ ] **Step 1: Tests (Testing Library):**
  - cada estado muestra su texto exacto y su botón;
  - el clic en «Conectar Stripe» hace POST y redirige a la `url` devuelta;
  - doble clic → un solo POST;
  - `?stripe=vuelta` → GET con `refresh=1`;
  - un 409 `paid_plan_required` muestra el texto de planes.
- [ ] **Step 2: Run** (falla).
- [ ] **Step 3: Implementar** con los primitivos de `ownerUi` y el mismo patrón visual que `OwnerAcademySettingsManager`.
- [ ] **Step 4: Run** (verde).
- [ ] **Step 5: Commit.**

### Task 8: Documentación de la línea roja, guía de cobros y vault

**Files:**
- Modify:
  - `src/lib/launch/essential-routes.ts:7-11` (comentario: la línea roja se levantó solo para cuotas, ver ADR-0028; los prefijos retirados siguen igual)
  - `docs/qa/legacy-surface-closure-2026-11-09.md` (aviso al principio: «Superado en parte por ADR-0028 (16-11-2026)…»)
  - `docs/COBROS_Y_CUOTAS.md` (sección «Conectar Stripe (Fase 1)»: bandera, rutas y estado; el bloque «Estado verificado» antiguo se marca como del modelo Standard v1 retirado)
  - `docs/architecture/adr/0028-cobro-automatico-de-cuotas-con-connect.md` (`pending` no se usa; la fila nace en `onboarding`)
  - `vault/06-Roadmap-y-Tareas/Changelog interno.md` (qué se probó, qué no, candidata NO aplicada en producción)
- Test: ninguno nuevo. `tests/` que lean `essential-routes.ts` deben seguir verdes.

- [ ] **Step 1: Editar los documentos.**
- [ ] **Step 2: Run** (CI verde).
- [ ] **Step 3: Commit.**

### Task 9: Preparación y prueba en staging (autorizada por Elvis el 16-11-2026)

No es código. Cada escritura en un proveedor se anota en el Changelog y en la PR.

- [ ] **Step 1: Supabase staging (`oucxnnrtfmjjlnffldfc`).**
  - Aplicar la candidata con el MCP de Supabase (`apply_migration`). Comprobar antes que el SHA-256 coincide con el README.
  - Verificar en el catálogo las dos columnas y sus checks.
- [ ] **Step 2: Stripe sandbox «Entorno de prueba de Zaltyko» (`acct_1STR6uDA0PFJp7KM`, livemode false).**
  - Confirmar que SEPA está activado en la plataforma.
  - Crear un destino de eventos v2 *thin*:
    - origen: cuentas conectadas;
    - tipos: `v2.core.account[requirements].updated`, `v2.core.account[configuration.merchant].capability_status_updated`, `v2.core.account.closed`;
    - URL: `https://staging.zaltyko.com/api/stripe/connect/accounts-webhook`.
  - El secreto de firma no se escribe en el chat, ni en el repositorio, ni en informes. Si la API no lo devuelve, pedir a Elvis que lo copie del Dashboard.
- [ ] **Step 3: Vercel `zaltyko-staging`.**
  - Añadir `STRIPE_CONNECT_ACCOUNTS_WEBHOOK_SECRET` (sensible) y `ZALTYKO_CONNECT_ONBOARDING_ENABLED=true`.
  - Confirmar que `STRIPE_SECRET_KEY` es `sk_test_`/`rk_test_` del sandbox anterior: comparar la cuenta con una lectura, sin imprimir la clave.
  - Desplegar la rama en staging como indica `docs/deployment/staging.md` (el build es remoto en Vercel).
- [ ] **Step 4: Recorrido en el navegador** con una cuenta owner de prueba `claude.*@example.com` de una academia ES con Starter de prueba:
  1. «Conectar Stripe» → Stripe sandbox.
  2. Usar «Guardar para después» → vuelta → «Stripe necesita más datos».
  3. Completar con los datos de prueba de Stripe → «Lista para cobrar» (tarjeta activa, domiciliación según Stripe).
  4. Comprobar que el evento llegó (`last_provider_event_reference` relleno).
  5. Abrir el enlace dos veces → la segunda vez se genera uno nuevo.
  6. Academia Free → texto de planes.
  7. Academia MX → texto de país.
  - Capturas para la PR.
- [ ] **Step 5: PR «Cobros Connect — Fase 1: Conectar Stripe»** con evidencia de staging y CI verde. La revisa la sesión coordinadora y la aprueba Elvis en GitHub.
  - Tras el merge no se activa nada en producción: la candidata y la bandera de producción necesitan otra autorización.
