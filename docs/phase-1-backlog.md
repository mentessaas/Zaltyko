# Backlog Fase 1 · Desarrollo

Referencia directa al [_Playbook Fase 1_](./phase-1-playbook.md). Cada tarea debe convertirse en issue/ticket antes de iniciar desarrollo.

## 1. Usuarios y roles
- [x] Migración `0004` aplicada en entornos (nuevos roles y guardianes).
- [x] UI administración de usuarios (tabla + filtros por rol/tenant).
- [x] Flujo de invitación con email (Supabase magic link) y asignación de rol.
- [x] Selector de academia activa + perfil editable.

## 2. Atletas
- [x] Listado con filtros (nivel, edad, sexo, estado).
- [x] Ficha de atleta (datos generales, progreso básico, contactos). _Pendiente pestaña de progreso detallado en fases posteriores._
- [x] CRUD de guardianes y vínculo con atletas (usa `guardians`, `guardian_athletes`).
- [x] Importación CSV (job + feedback) y exportación XLSX.

## 3. Entrenadores
- [x] Panel de coaches (datos, asignaciones a academias/clases).
- [x] Asignación a academias y clases (UI + API).
- [x] Registro de asistencia y notas por sesión.
- [ ] Perfil público activable por academia.

## 4. Clases y sesiones
- [x] Calendario (weekly/monthly) integrado con `class_sessions`.
- [x] CRUD de clases (capacidad, niveles objetivo, coaches asociados).
- [ ] Generación de sesiones recurrentes + edición individual.
- [ ] Alertas (cupo lleno, cancelaciones, comentarios destacados).

## 5. Facturación Stripe
- [ ] Sincronización de productos/precios con tabla `plans` (script + admin view).
- [ ] UX de facturación in-app (plan actual, upgrade/downgrade, historial).
- [ ] Mejorar manejo de errores Stripe (webhooks y reintentos).
- [ ] Notificaciones email al cambiar plan (Mailgun).

## 6. Calidad y soporte
- [x] Actualizar `scripts/seed.ts` con datos demo (academia, atletas, coaches, guardianes).
- [ ] Añadir pruebas Vitest para endpoints CRUD principales. _(Issues creados en `tasks.md`)._
- [ ] Crear guía de soporte interno (markdown + video corto).

> **Seguimiento**: mover cada item a la board Kanban (columns: Backlog → En progreso → QA → Done). Documentar bloqueos relevantes en `docs/changelog.md`.

