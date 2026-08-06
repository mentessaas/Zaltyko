---
id: ZAL-130
status: as-built (re-issued 2026-08-04 by Product Lead tras reencuadre CEO)
parent: ZAL-130
owner: product lead (65d16bd7)
decisión_de_reencuadre: vault/06-Roadmap-y-Tareas/Decisiones.md (entrada 2026-08-04 ZAL-130)
last_reviewed: 2026-08-04
scope: Onboarding Zaltyko Web — owner, magic link atletas, emails transaccionales, TTFAA
refs:
  - ZAL-137 [STATE-LAYER-9] Auditar y adaptar onboarding owner
  - ZAL-138 [STATE-LAYER-9] Implementar magic links Supabase para primeras atletas
  - ZAL-139 [STATE-LAYER-9] Definir y validar plantillas Resend d0/d2/d7
  - ZAL-140 [STATE-LAYER-9] Capturar baseline TTFAA antes del rollout
  - vault/06-Roadmap-y-Tareas/TTFAA - baseline pre-rollout y contrato de medicion.md
  - vault/06-Roadmap-y-Tareas/Decisiones.md (entrada 2026-08-04 ZAL-130)
audiencia: Support y Growth — operar el piloto de 5 academias
fuera_de_alcance: position paper, voto async, "arquitectura → product x2", D-006 al log
---

# Spec de onboarding Zaltyko Web — as-built

> **Tipo de documento**: documentación as-built de cómo corre hoy el flujo de
> onboarding owner → atleta en Zaltyko Web. NO es un artefacto de diseño previo
> ni un position paper. El código ya está desplegado y en `in_review`; este
> documento describe el comportamiento observable para que Support y Growth
> puedan operar el piloto de 5 academias sin ambigüedad.
>
> Si al leerlo se detecta que el flujo real contradice lo que ZAL-137/138/139
> declaran haber entregado, **no resolver por la cuenta**: asentar y escalar.

## 1. TL;DR del flujo

Hay **dos caras** del onboarding y **un solo KPI**:

1. **Owner**: crea academia vía `POST /api/onboarding/owner` (atómico,
   `8f0637f5c` PR #50). Emite `WelcomeEmailTemplate` en el evento de creación
   y arranca sesión en su dashboard.
2. **Atleta**: el owner invita vía `POST /api/athletes/invite` (bulk ≤ 10
   por lote, `bb818b057`). El backend genera un magic link Supabase y envía
   la plantilla `athlete-magic-link-invite` con `state=<token>` en
   `redirectTo`. La atleta abre el link → `/auth/callback` consume el OTP
   → `/invite/athlete/magic?state=...` completa perfil vía
   `POST /api/athletes/invite/complete-profile`. La fila de `athletes` queda
   con `status = 'active'` y `athlete_invitations` queda en `profile_complete`.
3. **KPI**: TTFAA (Time To First Activated Athlete), contrato ya entregado
   en `vault/06-Roadmap-y-Tareas/TTFAA - baseline pre-rollout y contrato de
   medicion.md` (`c274698e0`). No se redefine métrica nueva.

## 2. Diagrama de flujo (end-to-end)

```
OWNER                                          ATLETA                       BACKEND
─────                                          ──────                       ───────
POST /api/onboarding/owner          ─►         —                            crea academy+profile+owner membership en una sola tx
                                                                        ─►   WelcomeEmailTemplate (1ª vez)
                                                                        ─►   (no d0/d2/d7 atleta desde backend)

UI: coach/atletas → "Invitar"        ─►        —                            POST /api/athletes/invite {emails:[…]≤10}
                                                                        ─►   genera magic link por email vía auth.admin.generateLink
                                                                        ─►   renderAthleteInviteEmail({academyName, customMessage, magicLink})
                                                                        ─►   sendEmailWithLogging(template:"athlete-magic-link-invite")
                                                                        ─►   inserta athlete_invitations (status:"pending", stateToken UNIQUE)

                                              recibe email "X te ha invitado a Zaltyko"
                                              click en "Confirmar y completar mi perfil"
                                              → redirige a /auth/callback?code=…  (Supabase OTP)
                                              /auth/callback verifica OTP y crea sesión
                                                       │
                                                       ▼
                                              GET /invite/athlete/magic?state=<token>
                                                       │
                                                       ├─ state no presente → 302 /invite/athlete?error=missing_state
                                                       ├─ state no existe    → 302 /invite/athlete?error=not_found
                                                       ├─ user no authed     → 302 /auth/login?next=…
                                                       ├─ email mismatch     → muestra AthleteMagicLinkCompleteForm con emailMismatch=true
                                                       ├─ expired             → muestra form con expired=true
                                                       └─ status="profile_complete" (idempotente) → 302 /my-dashboard/athlete?welcome=1

                                              completa el form (name, dob?, level?, categoryCode?, primaryApparatus?)
                                                       │
                                                       ▼
                                              POST /api/athletes/invite/complete-profile
                                                                       ─►   valida stateToken + email match + status="opened"
                                                                       ─►   tx: upsert profile (role:athlete, tenantId de la invitación)
                                                                                  upsert athletes (name,dob,level,categoryCode,primaryApparatus,status="active")
                                                                                  update athlete_invitations status="profile_complete", athleteId=…
                                                                       ─►   trackEvent("athlete_confirmed")
                                                                       ─►   200 {athleteId, academyId, redirectUrl:"/my-dashboard/athlete"}

                                              302 /my-dashboard/athlete
```

## 3. Lado owner — ZAL-137

### Punto de entrada

- **Endpoint**: `POST /api/onboarding/owner` (`src/app/api/onboarding/owner/route.ts`).
- **Auth**: el owner ya está autenticado vía Supabase (`getUser`). La ruta
  exige user presente; sin sesión → 401 `UNAUTHENTICATED`.
- **Atomicidad**: el handler usa `withTransaction()` y `createAcademy()`
  (`src/app/api/academies/academies.lib.ts`) para que academia + profile +
  membership + sport-config seed queden en **una sola unidad**. El commit
  `8f0637f5c` (PR #50) cerró esto tras detectar race conditions entre
  requests concurrentes.

### Body esperado

```jsonc
{
  "fullName": "string (2..120)",
  "academyName": "string (3..120)",
  "disciplineVariant": "artistic_female|artistic_male|rhythmic|general",
  "activeDisciplineVariants": ["artistic_female", "rhythmic"],   // opcional
  "academyKind": "recreational|competitive|mixed",                 // opcional
  "countryCode": "ES",                                            // 2..8 chars
  "country": "España",                                            // opcional
  "region": "Comunidad de Madrid",                                // opcional
  "city": "Madrid",                                               // opcional
  "activeProgramCodesByVariant": { … },                          // opcional
  "activeApparatusCodesByVariant": { … },                        // opcional
  "starterGroupKeys": ["pre-benjamin", "benjamin"],               // opcional
  "starterGroupsByVariant": { … }                                 // opcional
}
```

### Lo que el owner ve

1. Formulario de alta (probablemente `OnboardingWizard` o equivalente en
   `/app/onboarding` — el shell de UI está fuera de scope de esta spec).
2. Una vez enviado, redirige al dashboard `/app/<academyId>/dashboard`.
3. **No hay email de bienvenida al owner desde el endpoint**: la plantilla
   `WelcomeEmailTemplate` (`src/lib/email/templates/welcome-email.tsx`)
   existe en el repo pero no se invoca desde `POST /api/onboarding/owner`
   en el código actual. Ver §9 (gaps honestos).

### Lo que NO está en ZAL-137

- Re-onboarding (idempotente para reintento). El endpoint asume que el
  profile existe; si ya hay academia creada, aborta.
- Email de "primer paso" / checklist guiado en dashboard. Si existe, no
  forma parte de esta spec.

## 4. Lado atleta — ZAL-138

### 4.1. La academia invita (bulk send)

- **Endpoint**: `POST /api/athletes/invite`
  (`src/app/api/athletes/invite/route.ts`).
- **Authz**: `withTenant` + `verifyAcademyAccess` (tenant-scoped, no bypasa
  RLS, no key service_role).
- **Body**:

```jsonc
{
  "academyId": "uuid",
  "emails": ["a@x.com", "b@x.com"],          // 1..10
  "customMessage": "string ≤500",             // opcional
  "expiresInDays": 7                          // 1..30, default 7
}
```

- **Bulk max**: `ATHLETE_INVITE_BULK_MAX = 10`. Validado en Zod y en el
  servicio (defensa en profundidad).
- **Cooldown**: `ATHLETE_INVITE_RESEND_COOLDOWN_MINUTES = 5`. Si hace < 5
  min del último reenvío, la API devuelve `skipped_duplicate` para no
  spamear.
- **Cupo de reenvíos**: `ATHLETE_INVITE_MAX_RESENDS = 5`. Una vez llegado
  al cupo, la invitación `skipped_duplicate` y el owner tiene que pedir
  manualmente una nueva.
- **Generación del magic link**: `auth.admin.generateLink({ type:
  "magiclink", email, options: { redirectTo: <APP_URL>/auth/callback?next=
  /invite/athlete/magic?state=<token> })`. El `state` es un
  `randomBytes(32).toString("hex")` UNIQUE en DB.
- **Plantilla de email**: `renderAthleteInviteEmail` está **inline** en
  `src/lib/athletes/magic-link-invite-service.ts:118-151`. Es HTML,
  escapa todos los campos variables, muestra CTA bloqueado en negro, y
  expone el link en texto plano como fallback.
- **Plantilla nombre lógico**: `athlete-magic-link-invite` (referenciado
  en `sendEmailWithLogging.template`).
- **Dedupe**: `sendEmailWithLogging` usa `dedupeKey =
  athlete-invite:<invitationId>:<resendCount>`.

### 4.2. La atleta abre el magic link

1. Click en el CTA → `redirectTo` → `/auth/callback?code=…`.
2. `/auth/callback` consume el OTP con `verifyOtp` (Supabase). Sesión
   creada.
3. La `next` param apunta a `/invite/athlete/magic?state=<token>`.
4. `src/app/invite/athlete/magic/page.tsx`:
   - Lee DB por `stateToken` (UNIQUE).
   - Si no hay invitación → `redirect("/invite/athlete?error=not_found")`.
   - Si no hay user autenticado → `redirect("/auth/login?next=…")`.
   - Si `status === "pending"` y el email del user autenticado coincide
     con el de la invitación → llama `markInvitationOpened(id, user.id)`
     (idempotente, pone `status="opened"`, `supabaseUserId`, `openedAt`).
   - Si `status === "profile_complete"` → redirige a
     `/my-dashboard/athlete?welcome=1` (idempotente).
   - Si el email autenticado no coincide → muestra el form con
     `emailMismatch=true` (no marca como opened, deja que contacte al
     owner).
   - Si expiró → `expired=true` en el form.

### 4.3. La atleta completa el perfil

- **Form**: `AthleteMagicLinkCompleteForm` con `stateToken`,
  `expectedEmail`, `authenticatedEmail`, `emailMismatch`, `expired`,
  `customMessage`. Solo editable si `emailMismatch=false`.
- **Submit**: `POST /api/athletes/invite/complete-profile` con body
  `{ stateToken, name (≥2), dob? (YYYY-MM-DD), level?, programCode?,
  levelCode?, categoryCode?, primaryApparatus? }`.
- **Backend** (`src/app/api/athletes/invite/complete-profile/route.ts`):
  - Valida sesión Supabase (`getUser`). Sin user → 401.
  - Valida Zod (incluye `dob` regex, longitud de name).
  - Lee invitación por `stateToken`. Mismatch email → 403 `EMAIL_MISMATCH`.
  - Si `cancelled` → 400 `INVITATION_CANCELLED`. Si expiró → 400
    `INVITATION_EXPIRED`. Si `profile_complete` ya → 200 idempotente.
  - `withTransaction`:
    1. Upsert `profiles` (rol=athlete, tenantId=invitación,
       activeAcademyId=academia).
    2. Upsert `athletes` (status="active", deletedAt cleared,
       name/dob/level/programCode/levelCode/categoryCode/primaryApparatus).
    3. Update `athlete_invitations`: status="profile_complete",
       athleteId, profileCompletedAt.
  - `trackEvent("athlete_confirmed", {academyId, tenantId, userId,
    invitationId})` — PII (email, name) **no** se envía.
  - 200 `{alreadyComplete:false, athleteId, academyId,
    redirectUrl:"/my-dashboard/athlete"}`.

### 4.4. Cancelación

- `POST /api/athletes/invite/cancel/[invitationId]` — el owner cancela
  invitaciones `pending`/`opened`. Extiende la ruta `cancel` (existe en
  `src/app/api/athletes/invite/cancel/`).

### 4.5. Listado

- `GET /api/athletes/invite` (mismo route, list branch) devuelve
  `listAthleteInvitations(academyId)`. Soporta UI de "quién está
  pendiente / abrió / completó".

## 5. Máquina de estados de `athlete_invitations`

```
                          ┌──────────────┐
       creación          │   pending    │
   ─────────────────►    │              │
                          └──────┬───────┘
                                 │  magic link abierto por verifyOtp
                                 │  (Supabase consume OTP, /invite/athlete/magic
                                 │   corre markInvitationOpened con email match)
                                 ▼
                          ┌──────────────┐
                          │    opened    │
                          └──────┬───────┘
                                 │  POST /api/athletes/invite/complete-profile
                                 │  crea/actualiza athletes, athletes+profile quedan
                                 │  activos, transacción cierra con profile_complete
                                 ▼
                          ┌──────────────┐
                          │ profile_     │
                          │ complete     │  ← Estado terminal de activación
                          └──────────────┘

   En cualquier estado pending/opened:
     - owner cancela      →  cancelled
     - expires_at < now   →  expired   (set vía background / request explícita — ver §9.3)
```

Definición operativa adoptada por ZAL-140:

- **Atleta confirmado** = `profile_complete` (no `opened`).
- **TTFAA** se cuenta entre `MIN(athlete_invitations.created_at WHERE
  role-academy match)` y `MIN(athlete_invitations.profileCompletedAt)`
  para la primera confirmación por academia.

## 6. Emails transaccionales — ZAL-139

### Lo que está implementado

- **Plantilla atleta**: `athlete-magic-link-invite` — renderizada inline en
  `magic-link-invite-service.ts`. Asunto: "${academyName} te ha invitado a
  Zaltyko". HTML, escapado, CTA visible.
- **Plantilla owner**: `WelcomeEmailTemplate` (`src/lib/email/templates/welcome-email.tsx`)
  existe en el repo pero **no se invoca desde `POST /api/onboarding/owner`**
  en el código actual. Ver §9.1.
- **Triggers operativos** (no parte de onboarding, pero documentados para
  Support): `triggerAttendanceReminders`, `triggerPaymentReminders`,
  `triggerScheduledPaymentReminders`, `sendManualPaymentReminder`,
  `triggerEventInvitations`, `triggerClassCancellation` — todos viven en
  `src/lib/email/triggers.ts`.

### Lo que **no** está implementado (gap explícito)

- **Secuencia d0/d2/d7 atleta**: NO existe en el código actual. La
  plantilla `athlete-magic-link-invite` es la **única** comunicación que
  recibe una atleta atleta-invitada. No hay cron ni trigger que envíe
  seguimiento a día 2 o día 7. Esto es **deliberado** mientras no haya
  cohorte del piloto (ver ZAL-140 sección 3, limitación 4: "Paso first
  class skipeable/retomable y welcome d0/d2/d7 se activa tras QA de copy").
- **Email de bienvenida al owner**: existe la plantilla, no el llamador.
- **Recovery email**: si el magic link expira a los 7 días (default) o 30
  días (max), no hay recordatorio automático. El owner debe reenviar
  manualmente desde la UI (con el cooldown de 5 min y el cupo de 5
  reenvíos).

> **Implicación operativa**: Support no debe prometer al piloto
> seguimiento automático por email. El único email garantizado es el
> magic link inicial.

## 7. Modos de fallo y escalación

### 7.1. La academia no llega a la atleta

- **Síntoma**: el owner reporta " invité a 5 atletas y ninguna abrió".
- **Causas probables** (en orden de probabilidad):
  1. Email en spam → dueño debe pedir al atleta revisar spam.
  2. Email corporativo (con firewall) → reenvío desde UI.
  3. Magic link expirado (>`expiresInDays`) → cancelar y reinvitar.
  4. **Bug de Supabase**: `auth.admin.generateLink` error → fila
     `athlete_invitations` queda igual, el backend loggea
     `[athlete-magic-link] supabase generateLink error`. **Escalar a
     Platform & Security** (accede al log para confirmar).
- **Triage**: `GET /api/athletes/invite` lista todas las invitaciones
  con timestamps + status. Si `status="pending"` y `sentAt` > 24h y
  nadie abrió → re-enviar manualmente.

### 7.2. La atleta abre el link pero no puede completar

- **Email mismatch**: el usuario autenticado no coincide con el de la
  invitación. El form muestra `emailMismatch=true` y bloquea submit.
  Causa típica: la atleta abrió el link desde el email personal pero
  está logueada con un email distinto (o no logueada). **Acción**: cerrar
  sesión y volver a abrir el magic link desde el mismo cliente de correo.
- **Expired**: el form muestra `expired=true`. **Acción**: el owner
  cancela la invitación (`POST /api/athletes/invite/cancel/[id]`) y
  reinvita. Si la atleta no recibió el primer email, problema upstream
  (§7.1).

### 7.3. La transacción se rompe a mitad

- `POST /api/athletes/invite/complete-profile` corre todo dentro de
  `withTransaction`. Si la tx falla, **no se actualiza
  `athlete_invitations.status`**, pero la fila queda en `opened` (no
  doble consumo). La atleta puede reintentar el submit.
- **Si la fila se queda en `opened` con perfil a medias**: el form
  reintenta, pero si el `athletes` se creó y la tx murió justo en el
  `update athlete_invitations`, el `athlete_id` queda null. La
  siguiente transacción entra por el path "existingAthlete" y reusa la
  fila. Si el race da `INVITATION_RACE` → lanzar de nuevo el form.

### 7.4. Invitación enviada a email que ya es usuario

- `auth.admin.generateLink` no crea usuario nuevo si el email ya existe
  en `auth.users`. El link se entrega igual, y al abrir, la sesión
  Supabase aparece como ese usuario. La atleta sigue el flujo normal y
  queda con `profile.role` actualizado a `athlete` + `tenantId` de la
  invitación. **Esto es por diseño** (verificación contra
  `src/lib/athletes/magic-link-invite-service.ts:443-446`).

### 7.5. Datos de la atleta parcialmente erróneos

- Tras `profile_complete`, el owner puede corregir `name`, `dob`,
  `level`, etc. desde la UI de edición de atleta (no es flujo de
  onboarding, queda fuera de scope).

## 8. KPI — TTFAA (referencia, no redefinición)

- **Definición contractual**: `vault/06-Roadmap-y-Tareas/TTFAA - baseline
  pre-rollout y contrato de medicion.md` (entregable ZAL-140, commit
  `c274698e0`, peer-verificado).
- **Numerador**: `MIN(athlete_invitations.profileCompletedAt) WHERE
  academy_id = <academy>`.
- **Denominador**: `MIN(athlete_invitations.created_at) WHERE academy_id =
  <academy>`.
- **Cohorte**: 5 academias piloto, TTFAA por academia + agregado solo si
  las 5 emiten invitación en la misma semana natural.
- **Baseline**: N=0 al 2026-08-01 (no había flujo desplegado). El
  baseline de TTFAA se re-ejecutará **post-rollout** por Data &
  Analytics con heartbeat y autorización explícita.
- **Umbral de reportabilidad**: N≥3 academias con activación. Por debajo
  de eso, valor crudo por academia y declaración de "evidencia
  insuficiente".

## 9. Gaps honestos (lo que NO está implementado)

1. **Email de bienvenida al owner**: plantilla existe, llamador no.
   Workaround: Support puede avisar al owner manualmente o el dashboard
   muestra el checklist onboarding.
2. **Secuencia d0/d2/d7 atleta**: no implementada. La activación
   temprana depende solo del magic link.
3. **Job para marcar `expired`**: la columna `expires_at` existe, pero
   no hay cron que transicione `status` de `pending`/`opened` a
   `expired`. La transición la decide el form (`page.tsx` chequea
   `expiresAt < new Date`). Una invitación que nadie abra quedará
   `pending` indefinidamente en DB.
4. **Eventos `growth_events` explícitos**: el código usa
   `trackEvent("first_athlete_invited")` en la creación y
   `trackEvent("athlete_confirmed")` en `complete-profile`. **No
   emite** `athlete_magic_link_opened` por separado como señal de
   "magic link abierto". La marca de `opened` vive en
   `athlete_invitations.openedAt`, no en `growth_events`. ZAL-140 §3
   limitación 1 lo declara. **Implicación**: la consulta reproducible
   de TTFAA v0 (entre `profileCompletedAt` y `createdAt`) es la vía
   primaria; cálculos basados en `growth_events` requieren emitir
   `athlete_magic_link_opened` en un heartbeat posterior.
5. **Rate limit explícito en `/api/athletes/invite`**: el `withTenant`
  + `verifyAcademyAccess` cubre tenant, pero no hay cap por minuto por
   IP/usuario. Si un owner hace spam, el cooldown de 5 min y el cupo
   de 5 reenvíos amortiguan, pero no hay 429 explícito.
6. **Idempotencia cross-batch**: si el owner envía el mismo email dos
   veces en lotes distintos, la BD tiene UNIQUE INDEX
   `(academy_id, lower(email)) WHERE status IN ('pending','opened')` y
   la 2ª llamada lo trata como re-envío. Confirmado en migración
   `20260804120000_create_athlete_invitations.sql:54-57`.

## 10. Contradicciones detectadas — para escalar, NO resolver

> El CEO instruyó: "si al redactarlo encontrás que el flujo as-built
> contradice lo que ZAL-137/138/139 dicen haber entregado, no lo resuelvas
> por tu cuenta: dejalo asentado y escalámelo."

Estas son las que detecté al mapear el código. **No abrí tickets sobre
ellas** — las asiento aquí para que Support/Growth/QA las valide en su
revisión:

1. **ZAL-139 → Resend d0/d2/d7 no implementado.** La spec ZAL-139
   original (descripción heredada) habla de "plantillas d0/d2/d7". El
   as-built solo tiene el email inicial del magic link. Decidir si
   (a) se cierra ZAL-139 sin d2/d7, (b) se reabre como gap explícito, o
   (c) se acepta que el "d0" es el magic link y se cancela el resto.
2. **`WelcomeEmailTemplate` sin llamador.** Si ZAL-137 declara email
   de bienvenida al owner, el código no lo invoca. Posible causa: el
   email lo dispara otro path (sign-up en `auth/callback` o un trigger
   no visible desde `POST /api/onboarding/owner`). Pedir a Web
   Developer que confirme.
3. **Doble flujo de invitación `/invite/athlete` coexistente.** La ruta
   `/invite/athlete?token=...` (legacy) usa tabla `invitations` con
   token UUID, sin Supabase magic link. La ruta
   `/invite/athlete/magic?state=...` (nueva, ZAL-138) usa
   `athlete_invitations` con state hex. **No hay un redirect** desde la
   legacy a la nueva. Si una academia usa la vieja, las atletas caen
   en una pantalla distinta. Pedir a Web Developer que documente
   explícitamente cuál es la canónica para el piloto.
4. **No hay `athlete_magic_link_opened` en `growth_events`.** ZAL-140
   §3 limitación 1 lo declara, pero al implementarse ZAL-138 no se
   cerró ese gap. El TTFAA v0 (basado en `created_at` /
   `profileCompletedAt`) sigue funcionando, pero la atribución por
   "dupla de eventos" no.

## 11. Cita de evidencia y commits

| Pieza | Commit | Archivo/s |
| --- | --- | --- |
| Owner onboarding atómico | `8f0637f5c` (PR #50) | `src/app/api/onboarding/owner/route.ts`, `src/app/api/academies/academies.lib.ts`, `src/lib/db-transactions.ts`, `src/lib/onboarding.ts`, `src/lib/sport-config/seed.ts` |
| Magic links atletas (D-006 v0) | `bb818b057` | `src/app/api/athletes/invite/route.ts`, `src/app/api/athletes/invite/complete-profile/route.ts`, `src/app/api/athletes/invite/cancel/[invitationId]/route.ts`, `src/app/api/athletes/invite/state/[stateToken]/route.ts`, `src/app/invite/athlete/magic/page.tsx`, `src/components/invitations/AthleteMagicLinkCompleteForm.tsx`, `src/db/schema/athlete-invitations.ts`, `src/lib/athletes/magic-link-invite-service.ts`, `supabase/migrations/20260804120000_create_athlete_invitations.sql`, `tests/lib/magic-link-invite-service.test.ts` |
| Email plantillas (existentes, no d0/d2/d7 atleta) | varios | `src/lib/email/templates/welcome-email.tsx`, `src/lib/email/templates/attendance-reminder.tsx`, `src/lib/email/templates/payment-reminder.tsx`, `src/lib/email/templates/event-invitation.tsx`, `src/lib/email/templates/class-cancellation.tsx`, `src/lib/email/triggers.ts` |
| TTFAA baseline + contrato | `c274698e0` | `vault/06-Roadmap-y-Tareas/TTFAA - baseline pre-rollout y contrato de medicion.md` |
| Decisión de reencuadre (CEO) | `68e31900b` (issue ZAL-303) + `Decisiones.md` (entrada 2026-08-04 ZAL-130) | `vault/06-Roadmap-y-Tareas/Decisiones.md` |

## 12. Cómo Support / Growth usan esta spec

- **Onboarding de una academia nueva (5 del piloto)**:
  1. Verificar que el owner completó `POST /api/onboarding/owner`.
  2. Confirmar que existen disciplinas-apparatus y grupos pre-cargados
     (operational-presets).
  3. Owner invita atletas vía `POST /api/athletes/invite` (bulk ≤ 10).
  4. Soportar si la atleta reporta problemas con el email o el link.
- **Métricas**: no leer `growth_events` para TTFAA todavía. Usar
  consulta v0 sobre `athlete_invitations.created_at` /
  `profileCompletedAt` (la consulta está en `vault/06-Roadmap-y-Tareas/TTFAA - baseline pre-rollout y contrato de medicion.md` §5).
- **Reporte semanal**: por academia, no agregado. Denominador mínimo
  3 cohortes con activación para gatillar TTFAA ejecutiva.

## 13. Cambios de esta versión

- 2026-08-04 — Re-issue de ZAL-130 tras reencuadre CEO. Documentación
  as-built, no diseño previo. Cubre owner (ZAL-137), atletas (ZAL-138),
  emails (ZAL-139 — gap honesto), TTFAA (referencia ZAL-140). Lista
  contradicciones detectadas para escalar. Owner: Product Lead.
