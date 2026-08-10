---
status: durable
issue: ZAL-315
parent: ZAL-312
ancestor: ZAL-139
spec_version: v0.2
spec_attachment: 9d7a99e9-6de2-471f-aad9-a91945cde8e1-ZAL-139-onboarding-owner-v0.2.md
agent: 6909a098-7ef1-49e6-898c-2c8fb18183e6 (Platform & Security)
date: 2026-08-05
scope: Sign-off privacidad/deliverability (§9) + criterios de aceptación B2 (profiles) + criterios de seguridad B3 (academies.status / fraud_hold)
---

# ZAL-315 — Sign-off privacidad d0/d2/d7 v0.2 (Platform & Security)

## 0. Resumen ejecutivo

**Sign-off §9:** APROBADO con observaciones. La spec v0.2 cumple el mínimo RGPD y de deliverability para emails transaccionales soft (recordatorios de configuración). Hay 4 gaps que deben cerrarse **antes de activar la secuencia contra usuarios reales** (no antes de implementar). La implementación puede proceder; la activación no.

**B2 (profiles):** ACEPTADO. La migración `profiles.unsubscribed` + `profiles.locale` cumple los requisitos §6 y §8.5/§8.8. Documento criterios del endpoint de baja.

**B3 (academies.status):** ACEPTADO con recomendación técnica. **fraud_hold es decisión de seguridad y se valida con criterio abajo.** Web Developer elige opción (a) enum o (b) derivado; lo que elija debe cumplir los criterios de seguridad §3 de este documento.

## 1. §9 — Privacidad y deliverability: firmado con observaciones

### 1.1 Lo que la spec YA cumple

| Requisito §9 | Estado | Evidencia en spec |
|---|---|---|
| Sin tracking de apertura ni píxel | OK | §9 explícito; §10 reitera; §8.14 verifica |
| `List-Unsubscribe` y enlace de baja presentes | PARCIAL | §5.3 d7 los incluye; §5.1 d0 y §5.2 d2 NO los muestran en copy (gap — ver §4) |
| HTML sin datos sensibles ni info de atletas | OK | §2 + §4 prohíben billing, tarjeta, plan, dirección, documentos, atletas en payload |
| SPF/DKIM/DMARC del proveedor/transporte vigente | Pendiente pre-activación | §9 lo exige "antes del QA de entrega"; gate pre-activación, no pre-implementación |
| Firmar consentimiento, supresión y baja | Este documento | — |

### 1.2 Base legal del tratamiento

d0/d2/d7 son emails **transaccionales soft** (recordatorios de configuración dentro del servicio contratado). Base legal RGPD Art. 6(1)(b) — **ejecución del contrato**: el owner contrató Zaltyko y la secuencia lo guía a completar la configuración. NO requieren opt-in de marketing.

Esto importa porque:
- NO se mezclan con consent de marketing/analytics (separación de base legal).
- NO requieren doble opt-in.
- SÍ requieren supresión fácil (baja con un click) y respeto inmediato.
- NO requieren consentimiento parental porque el destinatario es el owner adulto (representante legal/pagador de la academia). **Esto es válido solo mientras el email NO se dirija a atletas menores de edad**, que es exactamente lo que §4 prohíbe.

### 1.3 Menores (Art. 8 RGPD) — sin impacto en d0/d2/d7

La secuencia va al **owner**. Las atletas menores aparecen en la base de datos pero NO como destinatarias de esta secuencia. El consent gate parental que ya se está construyendo (ZAL-DEP / GTM-DEP) cubre el caso de registro de atletas, no de email al owner. Confirmado: §4 prohíbe explícitamente interpolación de datos de atletas en el payload de copy.

### 1.4 DPA con proveedores

| Proveedor | Procesa datos personales en v0.2 | DPA | Región |
|---|---|---|---|
| Brevo (transporte) | email del owner, nombre, contenido transaccional | Pendiente confirmar con Brevo (Engineering/Board gestiona firma) | Sandbox actual: confirmar región antes de pasar a producción |
| Supabase | Persistencia de `profiles.unsubscribed` y `email_logs` | Pendiente confirmar DPA Supabase (Board) | Sandbox actual: confirmar región |
| Resend | NO se usa | N/A | N/A (la spec v0.2 corrige esto explícitamente) |

**No firmo DPA — esa es potestad del Board con asesoría legal humana.** Mi trabajo es flag el gap; el Board decide cómo cerrarlo. Bloqueador pre-activación (no pre-implementación).

### 1.5 Residencia de datos

Pendiente confirmar región del sandbox y, sobre todo, de producción. Si hay哪怕 un usuario real en la UE, el proyecto Supabase de producción debe estar en región UE. Bloqueador pre-activación.

### 1.6 Derechos del usuario (acceso, rectificación, supresión, portabilidad)

- **Supresión / baja**: este documento la diseña. §2 abajo.
- **Acceso / rectificación / portabilidad**: fuera de alcance de d0/d2/d7 pero el Board debe confirmar que existe camino operativo (aunque sea manual) para atenderlos. Bloqueador pre-usuarios-reales, no pre-implementación.

## 2. Criterios de aceptación B2 — `profiles.unsubscribed` + `profiles.locale` + endpoint de baja

### 2.1 Schema

**Aceptado:**

```ts
// src/db/schema/profiles.ts — añadir
unsubscribed: boolean("unsubscribed").notNull().default(false),
locale: text("locale").notNull().default("es"),
```

**Criterios:**

- `unsubscribed` es por **perfil**, no por academia. La baja del servicio es personal.
- `locale` default `'es'`. Solo `es` se traduce en envío en v0.2; cualquier otro locale activa el gate §6 "NO ENVIAR".
- Valores permitidos para `locale` en v0.2: `'es'`. Otros valores son forward-compatible pero disparan gate. NO usar locale como discriminador de marketing.
- Migración debe ser **backwards-compatible**: registros existentes reciben `unsubscribed=false`, `locale='es'`. No requiere write back explícito si los defaults lo hacen.
- Índice: si el integrador va a hacer `WHERE unsubscribed=false AND locale='es'` muy seguido, considerar índice parcial. No obligatorio en v0.2 (volumen bajo).

### 2.2 Endpoint de baja (transaccional, no marketing)

**Path:** `POST /api/profiles/unsubscribe`

**Requisitos de seguridad (todos MUST):**

1. **Autenticación por token firmado, no por sesión.** El usuario debe poder darse de baja sin login. Token = HMAC-SHA256 sobre `profileId + unsubscribedAt + secret` con expiración ≤ 7 días. Secret vive solo en server-side env var.
2. **Token de un solo uso, idempotente.** Re-clickear el mismo enlace no rompe; responde 200 igual. Guardar `unsubscribed_at` timestamp para auditoría.
3. **El token debe ser opaco y no enumerable.** No usar UUID v1 ni counter. Preferible ULID o hash truncado del profileId+secret.
4. **Rate limit por IP y por token.** 10 req/min por IP es razonable.
5. **NO loguear el token crudo en logs de aplicación.** Solo `profile_id` y resultado.
6. **Respuesta visible al usuario** (página HTML simple o redirect a página de confirmación) — NO dejar 200 con JSON vacío. RGPD exige confirmación de la acción solicitada.
7. **Footer de baja en TODOS los emails de la secuencia, no solo en d7.** Ver §4 abajo.
8. **Tiempo de procesamiento de la baja: inmediato.** La supresión debe reflejarse en el gate §6 antes del siguiente envío programado (d2 o d7). Si hay scheduler cada 24h, el efecto puede tardar hasta 24h — aceptable para RGPD si el SLA es explícito (≤24h).
9. **Alcance de la baja:** afecta a d0/d2/d7 y a emails soft similares. **NO afecta a emails críticos** (pagos, seguridad, alertas de cuenta). Esto debe documentarse en la confirmación visible al usuario.
10. **El endpoint debe aceptar el token tanto vía GET (link de footer) como vía POST (form submit).** El método GET es el estándar RGPD (one-click unsubscribe).

### 2.3 Página de confirmación de baja

- Mostrar texto claro: "Te has dado de baja de los recordatorios de configuración de Zaltyko".
- Mostrar alcance: "Seguirás recibiendo emails críticos sobre pagos, seguridad y tu cuenta."
- Ofrecer link a `preferences_url` si quiere volver a entrar (no resuscripción automática).
- Logout del owner si estaba autenticado (no obligatorio pero buena práctica).

### 2.4 Lo que NO es aceptable

- ❌ Baja con doble opt-in (RGPD exige one-click).
- ❌ Baja que requiere login (RGPD exige sin fricción).
- ❌ Baja que solo afecta a la dirección de email pero no a `profiles.unsubscribed` (debe persistir).
- ❌ Baja que ignora y re-envía el siguiente email programado (idempotencia debe probarse).
- ❌ Footer de baja solo en d7 (RGPD/buena práctica: en TODOS).

## 3. Criterios de seguridad B3 — `academies.status` y `fraud_hold`

### 3.1 Recomendación: opción (a) enum

Web Developer decide, pero mi recomendación como Platform & Security es **opción (a) `status text NOT NULL DEFAULT 'active'`** con enum `('active','suspended','churned','fraud_hold','trial')`. Razones:

1. **`fraud_hold` es flag binario de seguridad.** Un enum explícito hace trivial auditar `WHERE status='fraud_hold'` y verificar que ningún flujo de auto-completado lo limpia.
2. **`churned` debe ser estado terminal con timestamp.** Derivarlo de `trial_ends_at < now() AND paymentsConfiguredAt IS NULL` significa que mover `trial_ends_at` (p. ej. un cupón) lo "resucita". Un enum con `churned_at` explícito es más seguro.
3. **Audit trail.** Necesitamos saber **cuándo** una academia entró en `churned` o `fraud_hold`, no solo el estado actual. Implica columnas `churned_at`, `fraud_hold_at`.
4. **Backwards compatibility.** `suspended` ya existe vía `isSuspended=true`. La opción (a) puede coexistir transitoriamente: el gate §6 consulta `status IN ('suspended','churned','fraud_hold') OR isSuspended=true` durante la migración, y luego se elimina el flag viejo.

### 3.2 Si Web Developer elige opción (b) derivado

Debe cumplir:

- `fraud_hold boolean NOT NULL DEFAULT false` con `fraud_hold_at timestamp`.
- `churned` derivado: query explícita en el gate §6: `WHERE trial_ends_at < now() AND paymentsConfigured_at IS NULL`. NO usar `isTrialActive` (puede ser false por otras razones).
- El integrador debe documentar en el gate que `churned` es derivado y NO persistido. Riesgo: si `trial_ends_at` se extiende por cupón, la academia vuelve a ser "elegible" automáticamente — eso puede ser o no deseable según modelo de negocio. Documentar.

### 3.3 Criterios de seguridad para `fraud_hold` (transversales a ambas opciones)

**fraud_hold es decisión de seguridad, no de producto. Estos criterios son MUST:**

1. **Solo Platform & Security o Engineering Lead pueden setear `fraud_hold=true`.** El flujo NO puede ser self-service. Si el Web Developer implementa un endpoint, debe estar gated por `withSuperAdmin` o rol equivalente.
2. **Setear `fraud_hold=true` requiere log de auditoría obligatorio** con: `actor_id`, `reason` (enum o string controlado), `evidence_url` opcional, `timestamp UTC`. Persistir en `audit_logs` o tabla equivalente.
3. **`fraud_hold=true` NO borra ni desactiva Stripe.** La cuenta de pagos se congela, no se elimina. Esto preserva evidencia para revisión.
4. **`fraud_hold=true` debe reflejarse en TODOS los gates de envío** (no solo d0/d2/d7): emails de marketing si los hubiera, notificaciones de atleta, etc. El integrador debe usar una función centralizada `isAcademyBlockedFromSending(academyId)` que evalúe `status='fraud_hold' OR isSuspended=true OR status='churned'`.
5. **`fraud_hold=false` (clear) requiere también log de auditoría.** Solo Platform & Security o Engineering Lead.
6. **El integrador NUNCA debe poder clear `fraud_hold` automáticamente** aunque el motivo original expire. Es siempre acción humana.
7. **El gate §6 (`fraud_hold` → NO ENVIAR) es MUST, no SHOULD.** Si el integrador envía un email a una academia en `fraud_hold`, es incidente de seguridad, no bug.

## 4. Gaps pre-activación (no bloquean implementación, sí bloquean activación)

Estos 4 gaps deben resolverse antes de activar d0/d2/d7 contra usuarios reales. La implementación puede proceder en paralelo.

### Gap 1: Footer de baja en TODOS los emails (no solo d7)

**Estado:** §5.1 d0 y §5.2 d2 NO muestran `{{unsubscribe_url}}` en la copy. §5.3 d7 sí lo muestra.

**Por qué importa:** RGPD y buena práctica de email marketing (aunque sea transaccional soft) exigen footer de baja visible en cada mensaje, no solo en el último. CAN-SPAM, GDPR Art. 7(3) + recital 42, RFC 8058 List-Unsubscribe-Post.

**Acción:** Web Developer debe añadir footer de baja + preferencias en §5.1 y §5.2 de la spec antes de implementar. Cambiar el template, no solo el cuerpo — el footer debe ser visible.

**Severidad:** MEDIA. No es bug crítico, pero sin resolver, la spec está en incumplimiento RGPD soft.

### Gap 2: SPF/DKIM/DMARC no verificados

**Estado:** §9 exige SPF/DKIM/DMARC del remitente "antes del QA de entrega". El QA de entrega es pre-activación, no pre-implementación.

**Porción:** Engineering/Board verifica con Brevo (proveedor actual de sandbox). Si el dominio `zaltyko.com` (o el que se use como From) no tiene SPF/DKIM/DMARC alineados con Brevo, los emails caen en spam o son rechazados.

**Severidad:** ALTA pre-activación. Deliverability es prerrequisito, no nice-to-have.

### Gap 3: DPA y región de Brevo + Supabase

**Estado:** Pendiente confirmación por Board con asesoría legal humana.

**Porción:** Board + Legal. Mi trabajo es flag.

**Severidad:** ALTA pre-usuarios-reales. RGPD no perdona "lo hizo el agente" si hay datos de un ciudadano UE.

### Gap 4: Camino operativo de acceso/rectificación/portabilidad

**Estado:** No existe flujo documentado para atender pedidos RGPD Art. 15-22 más allá de la baja.

**Porción:** Engineering/Board. Operativo, no técnico.

**Severidad:** MEDIA pre-usuarios-reales.

## 5. Lo que YA está validado y se puede implementar

- §2 (copy) sin datos sensibles, sin precios, sin promesas — OK.
- §3 (claves) coincide con `CHECKLIST_KEYS` en código as-built — OK.
- §4 (variables) con fallbacks explícitos y "NO ENVIAR si falta" — OK.
- §5 (templates) copy aprobada por Growth (ZAL-141), longitudes dentro de límites — OK.
- §6 (gate) cubre los 10 escenarios — OK.
- §7 (criterios Web Developer) incluye escape HTML, allowlist de URLs, idempotencia — OK.
- §8 (checklist QA) ejecutable cuando exista el integrador — OK.
- §10 (medición) honesto con N=0, baseline sin base — OK.
- §11 (gates) ownership claro, ningún gate autoriza publicación — OK.

## 6. §11 — Mi firma como Platform & Security

**Firmo §9 con las observaciones de §4 de este documento.**

| Gate §11 | Owner | Estado |
|---|---|---|
| Copy v0.2 | Content + Growth | Aprobado (externo a mi gate) |
| Variables, claves, evento e idempotencia | Web Developer | Pendiente ZAL-314 |
| Escenarios de envío | QA | Pendiente post-ZAL-314 |
| **Consentimiento, supresión y baja** | **Platform & Security** | **FIRMADO con §4 de este doc** |
| Sales freeze | Board | Pendiente autorización explícita |

**Fecha:** 2026-08-05
**Agente:** Platform & Security (6909a098-7ef1-49e6-898c-2c8fb18183e6)

---

## Hash y trazabilidad

Este documento es work product durable. SHA del commit se ancla en ZAL-315 vía `POST /completion-proofs/commits` con `touchedPaths` que incluyen este archivo. Sin ese POST, mi PATCH a `done` o `in_review` rebotará con `ProofRequired` (ZAL-88 gate per-issue).

**No es prueba de código autoral** — es prueba de que el sign-off de privacidad está escrito y commiteado. El integrador d0/d2/d7 vive en ZAL-314 (Web Developer) y ese es el código que QA ejecutará.
