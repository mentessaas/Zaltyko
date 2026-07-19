---
status: active
owner: producto
last_reviewed: 2026-06-26
source:
  - ../ROADMAP.md
  - ../PRODUCT-ANALYSIS.md
  - ../docs/next-steps-implementation.md
---
# Roadmap maestro

> **Estado a 2026-06-26**: Fase 1 (hardening) casi cerrada tras los sprints 0-7 + auditoria de seguridad (PR #8) + fix de CI. Fase 2 (producto core) validada en sandbox (QA P1 5/5 PASS), pendiente de QA con usuarios reales. Detalle de ejecucion en [[Decisiones#2026-06-24 - Resumen de sprints 0-7 + auditoria + CI fix]] y [[Changelog interno]].

## Fase 1 - Confianza y hardening — casi cerrada

- ✅ Inconsistencias de pricing, planes y checkout (Sprint 0/0-decision, toggle anual bloqueado).
- ✅ APIs con `withTenant`, respuestas estandar y validacion (auditoria PR #8).
- ✅ Bugs de runtime, responsive y accesibilidad (Sprints 0/5/6: WCAG, touch targets, skeletons).
- ✅ RLS auditable 100% sobre 62 tablas + jobs CI `validate-rls` y `check:migrations` (Sprint 1 + commit `406c498`).
- 🔶 Pendiente: deuda de auditoria (items 1.2/2.2/2.3/2.5/2.6), 25 tablas TS faltantes en DB, policies permisivas.

## Fase 2 - Producto core completo — validado en sandbox

- ✅ Evaluaciones end-to-end (QA P1 5/5 PASS).
- ✅ Comunicacion unificada (CommunicationHub con 3 tabs, Sprint 6).
- ✅ Asistencia y reportes dedicados (QA P1, export PDF 200).
- ✅ Billing claro y exportaciones basicas (Stripe hardening en auditoria).
- 🔶 Pendiente: QA con usuarios reales (portal padres/atletas, solicitudes de vinculo).

## Fase 3 - Activacion y growth — en curso

- Onboarding guiado, demo data, trial lifecycle.
- SEO/i18n completo (clusters bilingues listos; producto autenticado ~10% i18n).
- Marketing y ventas con [[Mensajes aprobados]].
- Validar hipotesis de [[Pricing]] freemium con 10 entrevistas a academias.

## Fase 4 - Expansion

- Integraciones, add-ons monetizables, multi-sede avanzado.
- IA visible y util.
- Marketplace/empleo como canal de revenue (5 lineas de monetizacion en [[Modelo de negocio]]).

## Proximos pasos sugeridos (continuidad para agentes)

Orden recomendado de trabajo a partir de 2026-06-26:

1. **Decision humana legacy `/dashboard/*`** (Elvis) — Opcion A recomendada en [[Decisiones#2026-06-24 - Decidir Opcion A para legacy `/dashboard/*` (recomendada, NO ejecutada)]]. Desbloquea Sprint 7D.
2. **Plan de migracion de las 25 tablas TS faltantes en DB** (P0) — `drizzle-kit push --force` es destructivo; requiere plan tabla por tabla. Diagnostico en `scripts/dump-schema.ts`.
3. **Endurecer policies permisivas + deuda de auditoria** (items 2.2/2.3/2.5/2.6 en [[Backlog priorizado]]).
4. **Validar y commitear los upgrades de dependencias pendientes** (jspdf 2→4 y xlsx pueden romper export; ver [[Changelog interno#2026-06-26 - Upgrades de dependencias (PENDIENTE DE COMMIT)]]).
5. **Validaciones humanas**: 10 entrevistas de pricing y QA del portal padres/vinculos con usuarios reales.
