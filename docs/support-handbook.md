# Guía Interna de Soporte y Operaciones – GymnaSaaS

> Última actualización: 2025-11-10

## 1. Panorama general
- **App**: Next.js 14 (App Router) + Tailwind + Supabase (Auth + Postgres con Drizzle ORM).
- **Entornos**: `local` (pnpm dev), `staging`, `production`. Todos deben apuntar a instancias Supabase separadas.
- **Roles clave**: `super_admin`, `admin`, `coach`, `owner`, `athlete`, `parent`.  
  - `super_admin` salta todas las políticas RLS.
  - `admin` ve todo dentro del tenant.
- **Dominios críticos**: invitaciones de usuarios, atletas/guardianes, coaches/clases, facturación Stripe.

## 2. Preparación del entorno
1. **Variables sensibles** (en `.env.local` o Secrets Manager):  
   - `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`  
   - `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`  
   - `MAILGUN_API_KEY` (opcional, pero necesario en producción para avisos)
2. **Migraciones**  
   ```bash
   pnpm db:migrate
   pnpm db:seed         # genera datos demo completos (usuarios, atletas, coaches, clases, facturas)
   ```
3. **Sincronizar planes Stripe** (tras crear/editar precios con `metadata.plan_code`):  
   ```bash
   pnpm stripe:sync
   ```
4. **Webhooks**  
   - Configurar endpoint público `POST /api/stripe/webhook`.  
   - Verificar firma usando `STRIPE_WEBHOOK_SECRET`.

## 3. Flujos operativos principales
### 3.0 Navegación multi-academia
- El panel autenticado se encuentra en `/app/[academyId]/…` y hereda un layout con sidebar + topbar.
- El selector de academia activa se gestiona desde `/dashboard` → “Mi perfil”. Si el usuario omite onboarding, se le bloquea la vista hasta crear su primera academia.
- El sidebar expone accesos directos: **Dashboard**, **Atletas**, **Entrenadores**, **Clases**, **Asistencia**, **Facturación**, **Evaluaciones**.

### 3.1 Creación de academias
- El usuario debe tener perfil `owner` o `admin` antes de crear academias (el onboarding lo valida).
- En el paso 1 se elige el **tipo de academia** (`artística`, `rítmica`, `trampolín`, `general`), que personaliza dashboards y futuras plantillas.
- La API `/api/academies` persiste el tipo y permite listados filtrados vía `GET /api/academies?academyType=...`.

### 3.2 Administración de usuarios
- Desde Dashboard → Usuarios.  
- Secciones:
  - Tabla de perfiles existentes (filtrable por rol/tenant).
  - Invitaciones: requiere `super_admin` o `admin` con tenant activo.
  - Invitaciones pendientes: reenvía/cancela tokens.
- API relevante: `/api/admin/users` (POST invita), `/api/invitations/complete` (cliente).

### 3.3 Gestión de atletas y tutores
- **Nueva vista**: `/app/[academyId]/athletes`
  - Filtros rápidos (estado, nivel, búsqueda) + chips de progreso.
  - Formularios modales “Crear atleta” y “Editar atleta” con contactos familiares embebidos.
  - Registro de tutores reutiliza `/api/athletes/[athleteId]/guardians`.
- Importación CSV (`/api/athletes/import`) y exportación XLSX (`/api/athletes/export`) continúan disponibles.
- RLS: los tutores (`parent`) sólo acceden a atletas vinculados mediante `guardian_athletes`.

### 3.4 Coaches y clases
- **Entrenadores** (`/app/[academyId]/coaches`)
  - Tabla con contactos, clases asignadas y búsqueda por nombre/email.
  - Dialogs de alta/edición consumen `/api/coaches` y `/api/coaches/[coachId]/assignments`.
  - Eliminar entrenador limpia asignaciones asociadas.
- **Clases** (`/app/[academyId]/classes`)
  - Listado con horario, capacidad y chips de coaches.
  - “Nueva clase” y “Editar clase” permiten asignar entrenadores.
  - Detalle `.../classes/[classId]` muestra sesiones, permite crear nuevas y registrar asistencia.
- **Asistencia** (`/app/[academyId]/attendance`)
  - Resumen rápido de últimas sesiones; enlaza al detalle para registro.
- API auxiliar: `/api/class-sessions`, `/api/class-sessions/[sessionId]`, `/api/attendance`.

### 3.5 Facturación Stripe
- **Nueva vista contextual**: `/app/[academyId]/billing`
  - Estado del plan (`/api/billing/status`).
  - Historial de facturas (`/api/billing/history`).
  - Acciones de upgrade/downgrade via `/api/billing/checkout` y portal `/api/billing/portal`.
- Sincronización de planes: `/api/billing/sync` (solo `super_admin`).
- Webhook `/api/stripe/webhook`:
  - Actualiza suscripciones y facturas.
  - Envía avisos con Mailgun (`billing.invoice_paid`, `billing.invoice_issue`).
  - Registra auditoría en `billing_events`.

### 3.6 Evaluaciones (placeholder)
- `/app/[academyId]/assessments` mantiene la vista anterior; pendiente integrar con nuevo panel.

## 4. Checklist de soporte
1. **Usuario no puede iniciar sesión**
   - Confirmar invitación en `invitations` (`status = pending`).
   - Revisar RLS: ¿perfil creado? (`profiles`), ¿tenant asignado?  
   - Forzar reenvío desde Dashboard → Usuarios.
2. **Creación/edición de academias**
   - Verificar rol del usuario (`owner` o `admin`) y el tipo seleccionado (`academy_type`).
   - Si el tipo es incorrecto, actualizarlo desde soporte (hasta que exista edición desde UI).
   - Confirmar que la academia aparece en `/api/academies` con el filtro adecuado.
3. **Importación CSV falla**
   - Ver logs en consola de la UI (muestra fila y causa).
   - Validar `academyId` obligatorio si el usuario no tiene tenant.
   - Recomendación: usar la nueva plantilla CSV (botón disponible en importador).
4. **Facturación**
   - Verificar `billing_invoices` y `billing_events`.  
   - Confirmar webhook activo en Stripe (últimos logs).  
   - Comprobar Mailgun si no llegan correos.
5. **Plan límite excedido**
   - API devuelve `402 LIMIT_REACHED`. Sugerir upgrade desde facturación.
   - Confirmar `assertWithinPlanLimits` en logs/test.
6. **Asistencia no se registra**
   - Confirmar que la sesión existe (`class_sessions`).
   - Revisar payload enviado a `/api/attendance` (requiere `sessionId` + arreglo `entries`).
   - Verificar RLS (tenant del coach que hace la acción).

## 5. Operaciones rutinarias
- **Antes de deploy**  
  - `pnpm lint && pnpm test` (incluye pruebas de APIs críticas).
  - `pnpm db:migrate` en staging.  
  - `pnpm stripe:sync` si cambian precios/productos.
- **Post-deploy**  
  - Revisar panel `/app/[academyId]/dashboard` en staging (navegar por Atletas → Coaches → Clases → Facturación).  
  - Validar webhook Stripe con evento de prueba (`stripe events resend`).
- **Backups**  
  - Supabase: programar backups automáticos o export manual (`pg_dump`).  
  - Configs `.env` en Secrets Manager/versionado seguro.

## 6. Residuales y futuros ajustes
| Tema | Estado | Acción |
| --- | --- | --- |
| Video demo soporte | Pendiente | Grabar recorrido (ver guion abajo) y subir a carpeta interna. |
| RLS tablas auxiliares | Revisado | Actualizar doc si se añaden nuevas tablas multi-tenant. |
| Documentación Stripe | Iniciado | Completar playbook con capturas cuando se conecte entorno real. |

### Guion sugerido para video (≤5 min)
1. Presentación rápida (objetivo, roles principales).  
2. Paso a paso: iniciar sesión demo → Usuarios (crear invitación) → Atletas (modales + contactos) → Coaches (asignar clases) → Clases (crear sesión + registrar asistencia) → Facturación (plan, historial).  
3. Cierre con checklist de soporte y puntos de escalado.

## 7. Escalado y contactos
- **Incidentes críticos (datos, facturación, web caída)** → Escalar a `super_admin` + ingeniería plataforma.  
- **Soporte de clientes** → usar cola de tickets (Zendesk/Intercom) y documentar en este runbook.  
- **Canales internos**:  
  - Slack `#gymna-support` (dudas rápidas)  
  - GitHub Issues (bugs reproducibles)  
  - Notion/Confluence (log de incidentes resueltos)

---
Mantener este documento versionado y actualizado tras cada sprint. Cualquier ajuste en RLS, flujos críticos o dependencias externas debe reflejarse aquí y en el video de soporte.

