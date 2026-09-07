---
type: audit-fase
status: in-progress
phase: 1 / D2 (GDPR Art. 8 + datos de menores)
created: 2026-09-07
owner: codex-session
plan: ./Plan auditoria professionalizacion 2026-09-07.md
baseline: ./Auditoria professionalizacion 2026-09-07 — Fase 0 baseline.md
politica: ZAL-169 (antifabricación) activa
---

# Fase 1 — D2: GDPR Art. 8 + datos de menores

> Modo del documento: **literal** (cada hallazgo con SHA, ruta y comando de verificación).
> Esta dimensión NO se ha ejecutado con DPO externo. Los hallazgos son **auto-auditoría técnica**, no consejo legal.

## 1. Estado actual del modelo de datos

**Lo que existe** ✓:

| Pieza | Tabla / Campo | Evidencia |
|---|---|---|
| Fecha de nacimiento del atleta | `athletes.dob date` (nullable) | `src/db/schema/athletes.ts:24` |
| Vinculación tutor-atleta | `guardians` + `guardian_athletes` | `src/db/schema/guardians.ts:15-71` |
| Consentimiento del owner (marketing) | `owner_consent` + `owner_consent_audit` con `policyVersion` | `src/db/schema/owner-consent.ts:52-118` |
| Unsubscribe/preferences (ZAL-324 Gap 5) | `/api/unsubscribe`, `/api/preferences` con HMAC | `src/app/api/unsubscribe/route.ts:22`, `src/app/api/preferences/route.ts:20` |
| Soft-delete (atletas, etc.) | `deletedAt timestamp` | `src/db/schema/athletes.ts:35` |

**Lo que falta** ✗:

| Pieza | Por qué importa | Referencia GDPR |
|---|---|---|
| **Consentimiento parental verificable** para procesar datos de menores | Un owner puede crear un atleta con `dob` que indica <14 años sin que se registre consentimiento del tutor | Art. 8 GDPR / LOPDGDD Art. 6 |
| **Captura de consentimiento en flujo de invitación** | `athlete_invitations` no tiene campo `parental_consent_id` ni link a la política vigente | Art. 7 GDPR (específico, informado, inequívoco) |
| **Versionado de política para tutores** | `owner_consent.policyVersion` existe; no hay equivalente para tutores | Art. 7(1) + Recital 42 |
| **Verificación de edad con gate automático** | No hay lógica que rechace crear atleta <14 sin consentimiento del tutor | Art. 8(2) |
| **Anonimización real** (right to erasure) | Solo `deletedAt` — los datos quedan en DB | Art. 17 GDPR |
| **Política de retención** | No existe tabla ni job que purgue datos personales después de N meses | Art. 5(1)(e) GDPR (limitación del plazo) |
| **DPA firmado con Supabase** | Evidencia documental no verificada | Art. 28 GDPR |
| **DPA firmado con Stripe** | Evidencia documental no verificada | Art. 28 GDPR |
| **DPA firmado con Brevo** | Evidencia documental no verificada | Art. 28 GDPR |
| **Residencia EU North confirmada en prod** | Pendiente ZAL-946 / ZAL-749 | Cap. V GDPR (transferencias) |

## 2. Hallazgos por severidad

### 2.1 FINDING P0 — Sin consentimiento parental para menores

**Riesgo**: si un owner crea un atleta con `dob` indicando <14 años (España) o <16 (otros países UE), el sistema persiste datos personales del menor sin registrar consentimiento parental. Viola Art. 8 GDPR y expone a Zaltyko a sanciones de la AEPD.

**Evidencia**:
- `src/db/schema/athletes.ts:24` — `dob: date("dob")` (nullable, sin validación de edad).
- `src/db/schema/athlete-invitations.ts` — sin campo de consentimiento.
- Búsqueda `grep -rinE "parental|minor|underAge" src/db/schema/` → **vacío**.

**Recomendación (no aplicada)**:
1. Crear tabla `guardian_consent` con campos: `guardian_id`, `athlete_id`, `policy_version`, `consent_text_hash`, `granted_at`, `ip_address`, `source` (signup/invite/settings/import), `revoked_at`, audit append-only.
2. En el flujo de creación de atleta con `dob < 14`, requerir consentimiento parental antes de persistir.
3. Bloquear invitaciones a atletas menores sin consentimiento del tutor.
4. Implementar job que marque `revoked_at` si cambia `policy_version`.

### 2.2 FINDING P0 — Sin anonimización / right to erasure

**Riesgo**: el soft-delete (`deletedAt`) oculta la fila pero mantiene PII en DB. Un actor con acceso a DB (o un backup filtrado) puede reconstruir datos personales del atleta y tutor.

**Evidencia**:
- `grep -rinE "anonymize|right.to.be.forgotten|right_to_erasure" src/lib/` → **vacío**.
- `src/db/schema/athletes.ts:35` — solo `deletedAt`, sin mecanismo de purga.

**Recomendación (no aplicada)**:
1. Implementar job de anonimización que sustituya PII por hashes no reversibles al recibir solicitud de baja verificada.
2. Para menores: anonimización automática 30 días después de baja (no retención).

### 2.3 FINDING P1 — DPA con proveedores no verificado

**Riesgo**: Zaltyko actúa como processor para academias (controllers). Sin DPA firmado, no hay contrato de procesamiento entre Zaltyko y cada sub-processor (Supabase, Stripe, Brevo). AEPD puede interpretar esto como incumplimiento de Art. 28.

**Evidencia**:
- `vault/07-Auditorias-y-Riesgos/Platform-Security-revision-bloqueadores-2026-08-26.md:39` — "crean proyecto Supabase sandbox nuevo **región EU North** (GDPR residencia datos — TODO actual: confirmar región sandbox)".
- `vault/06-Roadmap-y-Tareas/ZAL-P&S-bloqueadores-revision-2026-08-25.md:100` — "DPA firmado con Supabase/Stripe/Brevo no verificado con evidencia".
- ZAL-946 (Supabase EU North), ZAL-749 (E2E sandbox secret_ref) — **bloqueadas por Board**.

**Recomendación (no aplicada)**:
1. Solicitar a Supabase/Stripe/Brevo copia firmada del DPA + SCCs para transferencias fuera UE.
2. Documentar la cadena de sub-processors en `/legal/sub-processors.md` (público).
3. Verificar residencia EU North de Supabase antes de migrar datos reales.

### 2.4 FINDING P1 — Sin política de retención

**Riesgo**: atletas inactivos durante años mantienen PII sin justificación operativa. Viola Art. 5(1)(e) GDPR.

**Evidencia**:
- `grep -rinE "retention_days|data_lifecycle|expires_at" src/db/schema/` → solo `expires_at` en invitations/roles (no es retention policy).
- No hay tabla `data_retention_policy` ni job programado de purga.

**Recomendación (no aplicada)**:
1. Definir períodos de retención por tipo de dato:
   - Atleta dado de baja + sin cargos pendientes: anonimizar tras 2 años.
   - Logs de auditoría: 5 años (obligación mercantil española).
   - Consentimientos: indefinido (evidencia de cumplimiento).
2. Implementar cron de anonimización con rate-limit (no anonimizar >100 atletas/día para evitar carga).

### 2.5 FINDING P2 — Versionado de política solo para owners

**Riesgo**: si cambia la política de privacidad y un tutor consintió hace 18 meses, no hay forma de saber si el consentimiento sigue siendo válido para la nueva política. Art. 7 GDPR exige que el consentimiento sea específico e informado para cada versión.

**Evidencia**:
- `src/db/schema/owner-consent.ts:64` — `policyVersion` solo para owners.
- No hay equivalente para tutores.

**Recomendación (no aplicada)**: añadir `policy_version` a la tabla `guardian_consent` propuesta arriba.

## 3. Estado de ZAL-324 (RGPD)

**Verificación local** (no se reproduce flujo E2E, solo lectura de código):

| Componente | Estado | Evidencia |
|---|---|---|
| `src/app/unsubscribe/page.tsx` | ✓ Existe | `vault/07-Auditorias-y-Riesgos/Platform-Security-revision-bloqueadores-2026-08-26.md` |
| `src/app/preferences/page.tsx` | ✓ Existe | Idem |
| `src/app/api/unsubscribe/route.ts` | ✓ Implementado con HMAC | `src/app/api/unsubscribe/route.ts:22` |
| `src/app/api/preferences/route.ts` | ✓ Implementado | `src/app/api/preferences/route.ts:20` |
| `UNSUBSCRIBE_HMAC_SECRET` documentado | ✓ | `.env.example:13-14` |
| Rate-limit por address hash | ✓ (ZAL-1096) | Changelog 2026-09-02 |

**Lectura**: ZAL-324 Gap 5 está cerrado en código. El gap operativo (DPA + retención + parental consent) sigue abierto.

## 4. Limitación del branch

Igual que en D1: la historia del branch `fix/r2-csp-nonce-hydration-2026-09-07` comienza en 2026-07-19. **No verifiqué migraciones SQL anteriores a esa fecha**. Para confirmar que `owner_consent` se desplegó en prod, comparar contra `df832ab5` (main).

## 5. Resumen ejecutivo D2

| Finding | Severidad | Esfuerzo estimado | Bloqueado por |
|---|---|---|---|
| Consentimiento parental para menores | **P0** | 1 sprint (schema + UI + tests) | DPO externo (validación legal) |
| Anonimización / right to erasure | **P0** | 1 sprint (job + tests) | DPO externo |
| DPA Supabase/Stripe/Brevo | **P1** | 2-3 semanas (verificación documental) | Board (ZAL-946/749) |
| Política de retención | **P1** | 1 sprint | DPO externo |
| Versionado de política para tutores | **P2** | incluido en P0 parental consent | — |

## 6. Preguntas abiertas D2 (para CEO)

- **Q-D2-1**: ¿Hay presupuesto para DPO externo que valide el modelo de consentimiento parental antes de implementar? (Recomendación: sí, ~2-5 días de consultoría).
- **Q-D2-2**: ¿Las academias en España son el único mercado? Si hay mercado UE fuera de España, el threshold de edad cambia (14 vs 16).
- **Q-D2-3**: ¿El CEO está en posición de solicitar DPA firmado a Supabase/Stripe/Brevo, o depende del Board?
- **Q-D2-4**: ¿Cuál es la política de retención que Zaltyko quiere prometer públicamente? (sugerir: "2 años tras baja del atleta, 5 años para auditoría mercantil").

---

**Próxima entrega**: D3 — Seguridad de superficie nueva (P&S review 2026-08-26 pendientes).
