---
status: active
owner: data & analytics
parent: [[Decisiones]]
sources:
  - ../00-Inicio/Estado actual de Zaltyko.md
  - ../../PRODUCT-ANALYSIS.md
  - ./Backlog priorizado.md
  - ./Plan operativo gimnasia.md
last_reviewed: 2026-08-01
scope: D-006 onboarding Zaltyko Web (parent ZAL-130)
---

# TTFAA — baseline pre-rollout y contrato de medición

> **TTFAA** = Time To First Activated Athlete. Tiempo entre la primera invitación
> a una atleta emitida por una academia y la primera activación de esa academia
> (atleta confirmado = magic link abierto + perfil completo).
> Esta nota es el entregable de [ZAL-140](/ZAL/issues/ZAL-140).

## 1. Definición contractual

| Concepto | Definición operativa |
| --- | --- |
| **Activación (hito final)** | ≥1 atleta confirmado en la academia. *Atleta confirmado* = (a) magic link abierto + (b) perfil completo. |
| **Magic link abierto (a)** | La atleta llega a `/invite/athlete?token=...` con sesión autenticada que coincide con el email de la invitación. Hoy esto se infiere desde `invitations.status = 'processing'` (claim de uso único en `POST /api/invitations/complete`); ZAL-138 debe emitir un evento explícito `athlete_magic_link_opened` en `growth_events` para reconciliar con PostHog. |
| **Perfil completo (b)** | Fila en `athletes` con `name`, `dob` y `status = 'active'` enlazada a la academia vía `memberships` (rol `viewer` o equivalente de atleta) para el `userId` resultante de la invitación. |
| **Inicio (t=0)** | `MIN(invitations.created_at)` con `role = 'athlete'` y `defaultAcademyId = <academyId>`. La academia empieza a contar TTFAA cuando emite su primera invitación atleta. |
| **Fin** | `MIN(athletes.created_at)` que cumple (a)+(b) y está conectada por FK a una invitación atleta de esa academia con `status = 'accepted'`. |
| **TTFAA (métrica)** | `fin - inicio` en horas, observado sobre la primera activación por academia. Reporte por academia y agregado: mediana, p75, n. |

### Denominador y exclusiones

- **Denominador (cohorte)**: invitaciones con `role = 'athlete'`, `defaultAcademyId` en la cohorte piloto, `status = 'accepted'` y fin dentro de la ventana de observación.
- **Ventana de observación**: 7 días naturales desde t=0 por academia; activaciones posteriores se reportan aparte, no se imputan al TTFAA.
- **Exclusiones**:
  - invitaciones `role != 'athlete'` (coach, parent, admin) y re-invitaciones a un mismo `supabaseUserId` antes del `acceptedAt`.
  - invitaciones `expiresAt < createdAt + expiresInDays` marcadas como expiradas o canceladas antes de cualquier apertura.
  - atletas con `deletedAt IS NOT NULL` o `status = 'inactive'` (rollback de QA).
  - atletas creadas por seed/CSV o con `source = 'qa-internal' | 'seed' | 'migration'` en `growth_events.properties`.
  - academias con magic link emitido por QA interna o de prueba (flag pendiente en ZAL-138).

### Cohortes

- **Piloto D-006**: 5 academias reales,名单 a confirmar con el Product Lead. Cada academia es una cohorte. No se agrupan academias: TTFAA se reporta por academia y el agregado se calcula solo si las 5 emiten invitación atleta dentro de la misma semana natural.
- **Cohorte histórica**: 0 (no hay magic link Supabase en producción pre-rollout; el flujo `/invite/athlete` actual usa tokens UUID y no califica como cohorte comparable).

## 2. Baseline pre-rollout (captura 2026-08-01)

| Métrica | Valor | Fuente | Timestamp |
| --- | --- | --- | --- |
| Academias con invitación atleta emitida | **0** | [[Estado actual de Zaltyko]] (snapshot 2026-07-22) + este heartbeat | 2026-08-01 |
| Eventos `athlete_magic_link_opened` en `growth_events` | **0** (el evento no existe en el código actual) | `src/db/schema/growth-events.ts` y `src/lib/growth/events.ts` | 2026-08-01 |
| Eventos `athlete_profile_completed` en `growth_events` | **0** (no emitido) | id. | 2026-08-01 |
| Atletas creadas con magic link Supabase | **0** (ZAL-138 en progreso, sin deploy) | [ZAL-138](/ZAL/issues/ZAL-138) | 2026-08-01 |
| TTFAA mediana (horas) | **no reportable** (N=0) | — | — |
| TTFAA p75 (horas) | **no reportable** (N=0) | — | — |
| % activación en D1 | **no reportable** (N=0) | — | — |
| % activación en D7 | **no reportable** (N=0) | — | — |

**Lectura honesta**: el baseline es N=0. No existe muestra pre-rollout que permita calcular TTFAA, percentiles, ratios de conversión ni impacto. Publicar cualquier número en estas condiciones sería fabricar evidencia. La medición pasa a ser accionable solo cuando ZAL-137, ZAL-138 y ZAL-139 dejen el flujo desplegado y la primera academia del piloto invite a una atleta real.

**Aviso de staleness**: el snapshot de [[Estado actual de Zaltyko]] está fechado 2026-07-22. Esta nota no ha consultado producción; los conteos `0` reproducen el estado conocido a esa fecha y asumen que el flujo nuevo no se ha desplegado aún (consistente con el estado `in_progress` de ZAL-137/ZAL-138/ZAL-139 al 2026-08-01). Una reconfirmación post-deploy corresponde a un heartbeat posterior con autorización explícita.

## 3. Limitaciones explícitas

1. **Definición de "magic link abierto" aún no es evento de `growth_events`**. La señal actual vive en `invitations.status` y requiere un JOIN con `POST /api/invitations/complete`. ZAL-138 debe cerrar este gap antes de cualquier lectura ejecutiva.
2. **Definición de "perfil completo" no está formalizada como flag**. La heurística propuesta (`name` + `dob` + `memberships.role='viewer'`) depende de cómo ZAL-138 cree la fila de atleta. Si la creación se hace con valores parciales, el gate se rompe. Confirmar con Web Developer.
3. **Tamaño de muestra piloto = 5**. Con N=5, percentiles (mediana, p75) son inestables. Lectura ejecutiva exige mínimo N=3 cohortes con activación; el reporte por academia debe primar sobre el agregado.
4. **D-006 kickoff override (2026-08-01)**: el "Paso first class" queda skipeable/retomable y welcome d0/d2/d7 se activa tras QA de copy. Esto puede mover el evento de actividad medible (check-in, mensaje) sin cambiar el evento de activación. Mantener la definición de TTFAA anclada al hito de activación, no a la primera clase.
5. **No se consulta producción sin autorización**. Esta nota no ejecuta `pnpm` ni SQL contra Supabase. La reconfirmación del baseline se hace en un heartbeat posterior con alcance explícito del board.
6. **No hay integración PostHog con `growth_events` activa hoy**. La tabla existe (`growth_events`, `growth-events` schema) pero el contrato público solo emite `pricing_viewed`, `pricing_plan_selected`, `contact_started`. La fuente canónica para TTFAA es la tabla propia; PostHog queda como respaldo de tráfico pre-registro.
7. **RLS y `withTenant`**: la conexión de la app es rol `postgres` con `BYPASSRLS` (auditado 2026-07-03). El aislamiento depende de wrappers; cualquier query nueva debe pasar por `withTenant` o declarar explícitamente su alcance.

## 4. Contrato D1/D7 post-piloto

| Métrica | Definición | Umbral de lectura | Fuente |
| --- | --- | --- | --- |
| **TTFAA mediana (h)** | Mediana de `fin - inicio` por academia piloto | Reportable con N≥3 | `growth_events` + `invitations` + `athletes` |
| **TTFAA p75 (h)** | Percentil 75 por academia | Reportable con N≥3 | id. |
| **% activación en D1** | `COUNT(academias con fin - inicio ≤ 24h) / COUNT(academias cohorte)` | Reportable con N≥3 | id. |
| **% activación en D7** | `COUNT(academias con fin - inicio ≤ 168h) / COUNT(academias cohorte)` | Reportable con N≥3 | id. |
| **Drop invitación→perfil** | `1 - (perfiles completos / magic links abiertos)` por academia | Auxiliar, sin umbral | `growth_events` |
| **Tiempo mediano a magic link abierto** | `athlete_magic_link_opened - invitation_sent` | Auxiliar | `growth_events` |

**Reglas de comparación con baseline**:

- Comparar TTFAA post-piloto vs baseline **solo si** N_post ≥ 3 academias con invitación atleta. Si N_post < 3, publicar valor crudo por academia y declarar "evidencia insuficiente para comparar".
- Cualquier delta se reporta con intervalo (mediana, p75, n) y se etiqueta como *evidencia de piloto*, no como uplift demostrado.
- La cohorte histórica (pre-rollout) queda anclada en N=0; no se imputa un valor numérico.

## 5. Consulta reproducible (SQL preparado para post-rollout)

Esta consulta **no se ejecuta** en este heartbeat. Se publica como contrato; se ejecutará cuando ZAL-138 emita los eventos `athlete_magic_link_opened` y `athlete_profile_completed` y haya invitaciones reales en la cohorte piloto. Asume que ambos eventos quedan registrados en `growth_events` con `academy_id` y `tenant_id` poblados.

```sql
-- TTFAA por academia piloto (5 academias, cohortes D-006)
WITH piloto AS (
  SELECT a.id AS academy_id, a.tenant_id, a.name
  FROM academies a
  WHERE a.id = ANY($1::uuid[])  -- lista de 5 academies del piloto
),
invite_athlete AS (
  SELECT
    i.id              AS invitation_id,
    i.tenant_id,
    i.default_academy_id AS academy_id,
    i.supabase_user_id,
    i.created_at      AS invited_at,
    i.accepted_at,
    i.status
  FROM invitations i
  JOIN piloto p ON p.academy_id = i.default_academy_id
  WHERE i.role = 'athlete'
    AND i.status = 'accepted'
    AND i.accepted_at IS NOT NULL
),
events AS (
  SELECT
    g.academy_id,
    g.event_name,
    g.user_id,
    g.occurred_at
  FROM growth_events g
  JOIN piloto p ON p.academy_id = g.academy_id
  WHERE g.event_name IN ('athlete_magic_link_opened', 'athlete_profile_completed')
),
ttfa_per_academy AS (
  SELECT
    p.academy_id,
    p.name,
    MIN(i.invited_at)                                      AS t0_invited,
    MIN(e.occurred_at)
      FILTER (WHERE e.event_name = 'athlete_magic_link_opened') AS t_magic_opened,
    MIN(e.occurred_at)
      FILTER (WHERE e.event_name = 'athlete_profile_completed') AS t_profile_done
  FROM piloto p
  LEFT JOIN invite_athlete i ON i.academy_id = p.academy_id
  LEFT JOIN events e         ON e.academy_id = p.academy_id
  GROUP BY p.academy_id, p.name
)
SELECT
  academy_id,
  name,
  t0_invited,
  t_magic_opened,
  t_profile_done,
  EXTRACT(EPOCH FROM (t_profile_done - t0_invited)) / 3600.0 AS ttfaa_hours
FROM ttfa_per_academy
WHERE t_profile_done IS NOT NULL
  AND t_profile_done <= t0_invited + INTERVAL '7 days';
```

**Versión agregada (D1/D7)**:

```sql
WITH ttfa AS ( /* mismo CTE que arriba, materializado */ )
SELECT
  COUNT(*)                                                     AS n_activated,
  COUNT(*) FILTER (WHERE ttfaa_hours <= 24)                     AS n_d1,
  COUNT(*) FILTER (WHERE ttfaa_hours <= 168)                    AS n_d7,
  ROUND(AVG(ttfaa_hours)::numeric, 2)                          AS avg_h,
  ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttfaa_hours))::numeric, 2) AS p50_h,
  ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ttfaa_hours))::numeric, 2) AS p75_h
FROM ttfa;
```

**Respaldo (cuando el evento de growth aún no esté emitido, solo para diagnóstico)**:

```sql
-- TTFAA v0 basado en invitations + athletes, sin growth_events.
-- NO usar para reporte ejecutivo: ignora "magic link abierto" y "perfil completo" como eventos discretos.
SELECT
  a.id AS academy_id,
  a.name,
  MIN(i.created_at)                                AS t0_invited,
  MIN(ath.created_at)                              AS t_athlete_created
FROM academies a
JOIN invitations i  ON i.default_academy_id = a.id AND i.role = 'athlete' AND i.status = 'accepted'
LEFT JOIN athletes ath
       ON ath.user_id = i.supabase_user_id
      AND ath.academy_id = a.id
      AND ath.status = 'active'
      AND ath.deleted_at IS NULL
      AND ath.name IS NOT NULL
      AND ath.dob IS NOT NULL
WHERE a.id = ANY($1::uuid[])
GROUP BY a.id, a.name
HAVING MIN(ath.created_at) IS NOT NULL
   AND MIN(ath.created_at) <= MIN(i.created_at) + INTERVAL '7 days';
```

## 6. Trabajo delegado / pendientes

- [ ] ZAL-137 (web developer) — auditar y adaptar onboarding owner; sin bloqueo para ZAL-140.
- [ ] ZAL-138 (web developer) — emitir `athlete_magic_link_opened` y `athlete_profile_completed` en `growth_events` con `academy_id`/`tenant_id` poblados. **Crítico para que el contrato TTFAA sea medible.**
- [ ] ZAL-139 (copy) — definir plantillas Resend d0/d2/d7; sin bloqueo para TTFAA contractual.
- [ ] Product Lead — confirmar la lista de 5 academias piloto y la fecha de arranque común.
- [ ] Data & Analytics — en heartbeat posterior y con autorización explícita: re-ejecutar la consulta reproducible y publicar TTFAA real. No hacerlo en este run.

## 7. Cambios de esta versión

- 2026-08-01 — Creación inicial. Baseline N=0, contrato D1/D7, consulta reproducible preparada. Estado ZAL-140: listo para comentario de cierre con `in_progress` mientras el piloto no arranca.
