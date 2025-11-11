# Fase 1 · Playbook operativo

## Objetivo
Completar el **núcleo operativo** de GymnaSaaS:
- CRUD completos y consistentes para usuarios, atletas, entrenadores y clases.
- Interfaces de gestión (web) alineadas con roles.
- Facturación Stripe lista para producción (planes Free / Pro / Premium).

## Checklist de entregables

### 1. Usuarios y roles
- [ ] Ampliar enum `profile_role` (añadir `parent`, `super_admin`).
- [ ] Panel de administración de usuarios por tenant (listar, crear invitaciones, cambiar rol).
- [ ] Flujo de invitaciones (email + token) y registro orientado al rol.
- [ ] Página “Mi perfil” con edición básica y selección de academia activa.

### 2. Atletas
- [ ] Listado filtrable (nivel, edad, sexo, estado).
- [ ] Ficha de atleta con pestañas: datos, progreso, familia, notas.
- [ ] CRUD de contactos familiares (notificaciones email/sms).
- [ ] Importación CSV (job + resumen de resultados) y exportación XLSX.

### 3. Entrenadores
- [ ] Gestión de coaches (detalles, certificaciones, biografía pública).
- [ ] Asignación de coaches a academias y clases (UI + backend).
- [ ] Registro de asistencia y evaluaciones por sesión.
- [ ] Perfil público opcional (toggle para landing SEO).

### 4. Clases y sesiones
- [ ] Calendario semanal/mensual (React Big Calendar o similar).
- [ ] CRUD de clases + capacidad + niveles objetivo.
- [ ] Generación automática de sesiones recurrentes.
- [ ] Registro de asistencia, observaciones y alertas (ej. cupo lleno).

### 5. Facturación Stripe
- [ ] Configurar productos/precios en Stripe y sincronizarlos con `plans`.
- [ ] Revisar endpoints `api/billing/*` (manejo de errores, logging).
- [ ] Portal de pagos in-app (mostrar plan actual, upgrade/downgrade, historial).
- [ ] Notificaciones de facturación (webhook → email + auditoría).

### 6. Calidad y soporte
- [ ] Seeds actualizados (`scripts/seed.ts`) para demos y pruebas automáticas.
- [ ] Test coverage para rutas API críticas (Vitest + pg-mem).
- [ ] Manual de uso interno (short Loom + markdown) para soporte.

## Requisitos previos
- Ejecutar migraciones del backlog fase 0/1.
- Consolidar políticas RLS (ver `supabase/rls.sql`).
- Definir diseño UI base (Figma o tokens Tailwind).

## Métricas de aceptación
- 100% de las operaciones CRUD del core disponibles vía UI y API.
- Límite de plan respetado (atletas/clases) con mensajes de upgrade.
- Flujo de cobro manual y upgrade automático validado en modo test Stripe.
- Seeds generando academia demo con datos coherentes (pantallas y linter sin errores).

