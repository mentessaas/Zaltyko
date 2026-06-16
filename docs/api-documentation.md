# Documentación de API

Esta documentación describe todos los endpoints de la API del sistema GymnaSaaS.

## Autenticación

La mayoría de los endpoints requieren autenticación mediante cookies de sesión de Supabase. Algunos endpoints específicos de Super Admin requieren el rol `super_admin`.

### Headers requeridos

- `Cookie`: Cookie de sesión de Supabase (automática en navegadores)
- `Content-Type: application/json`: Para requests con body

### Códigos de error comunes

- `401 UNAUTHORIZED`: Usuario no autenticado
- `403 FORBIDDEN`: Usuario autenticado pero sin permisos
- `404 NOT_FOUND`: Recurso no encontrado
- `400 BAD_REQUEST`: Datos inválidos o faltantes
- `500 INTERNAL_SERVER_ERROR`: Error del servidor

## Endpoints por categoría

### Autenticación y Perfiles

#### `POST /api/invitations/complete`
Completa una invitación y crea la cuenta del usuario.

**Body:**
```json
{
  "token": "string",
  "password": "string",
  "name": "string"
}
```

**Respuesta:**
```json
{
  "ok": true,
  "userId": "uuid"
}
```

#### `PATCH /api/profile/active-academy`
Actualiza la academia activa del usuario.

**Body:**
```json
{
  "academyId": "uuid"
}
```

#### `GET /api/profile/check-limits`
Verifica los límites del plan del usuario.

**Respuesta:**
```json
{
  "canCreateAcademy": boolean,
  "canCreateAthlete": boolean,
  "remainingAthletes": number
}
```

### Administración de Usuarios

#### `POST /api/admin/users`
Invita a un nuevo usuario al sistema.

**Permisos:** `admin`, `owner`, `super_admin`

**Body:**
```json
{
  "email": "string",
  "role": "admin" | "owner" | "coach" | "athlete" | "parent",
  "tenantId": "uuid",
  "academyIds": ["uuid"],
  "defaultAcademyId": "uuid"
}
```

**Respuesta:**
```json
{
  "ok": true,
  "invitationId": "uuid"
}
```

### Academias

#### `GET /api/academies`
Lista todas las academias del tenant del usuario.

**Query params:**
- `tenantId`: UUID del tenant (opcional, solo super_admin)

**Respuesta:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "string",
      "tenantId": "uuid",
      "country": "string",
      "region": "string",
      "academyType": "artistica" | "ritmica" | "trampolin" | "general",
      "createdAt": "ISO8601"
    }
  ]
}
```

#### `POST /api/academies`
Crea una nueva academia.

**Body:**
```json
{
  "name": "string",
  "country": "string",
  "region": "string",
  "academyType": "artistica" | "ritmica" | "trampolin" | "general",
  "ownerProfileId": "uuid"
}
```

**Respuesta:**
```json
{
  "id": "uuid",
  "tenantId": "uuid"
}
```

#### `PATCH /api/academies/[academyId]`
Actualiza una academia existente.

**Body:**
```json
{
  "name": "string",
  "country": "string",
  "region": "string",
  "academyType": "artistica" | "ritmica" | "trampolin" | "general"
}
```

#### `DELETE /api/academies/[academyId]`
Elimina una academia (solo super_admin).

### Atletas

#### `GET /api/athletes`
Lista atletas con filtros opcionales.

**Query params:**
- `status`: `active` | `inactive` | `injured` | `suspended`
- `level`: string
- `academyId`: uuid
- `groupId`: uuid
- `minAge`: number
- `maxAge`: number
- `tenantId`: uuid

**Respuesta:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "string",
      "level": "string",
      "status": "string",
      "age": number,
      "academyId": "uuid"
    }
  ]
}
```

#### `POST /api/athletes`
Crea un nuevo atleta.

**Body:**
```json
{
  "academyId": "uuid",
  "name": "string",
  "dob": "YYYY-MM-DD",
  "level": "string",
  "status": "active" | "inactive" | "injured" | "suspended",
  "groupId": "uuid",
  "contacts": [
    {
      "name": "string",
      "email": "string",
      "phone": "string",
      "relationship": "string",
      "notifyEmail": boolean,
      "notifySms": boolean
    }
  ]
}
```

**Respuesta:**
```json
{
  "ok": true,
  "id": "uuid"
}
```

#### `PATCH /api/athletes/[athleteId]`
Actualiza un atleta.

**Body:**
```json
{
  "name": "string",
  "dob": "YYYY-MM-DD",
  "level": "string",
  "status": "active" | "inactive" | "injured" | "suspended",
  "groupId": "uuid"
}
```

#### `DELETE /api/athletes/[athleteId]`
Elimina un atleta.

#### `GET /api/athletes/[athleteId]/guardians`
Lista los contactos familiares de un atleta.

**Respuesta:**
```json
{
  "items": [
    {
      "linkId": "uuid",
      "guardianId": "uuid",
      "name": "string",
      "email": "string",
      "phone": "string",
      "isPrimary": boolean
    }
  ]
}
```

#### `POST /api/athletes/[athleteId]/guardians`
Agrega un contacto familiar a un atleta.

**Body:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "relationship": "string",
  "notifyEmail": boolean,
  "notifySms": boolean
}
```

#### `DELETE /api/athletes/[athleteId]/guardians/[linkId]`
Elimina un contacto familiar.

#### `GET /api/athletes/export`
Exporta atletas a CSV.

**Query params:**
- `tenantId`: uuid (requerido)

#### `POST /api/athletes/import`
Importa atletas desde CSV.

**Body:** FormData con archivo CSV

### Clases y Sesiones

#### `GET /api/classes`
Lista clases de una academia.

**Query params:**
- `academyId`: uuid (requerido)

**Respuesta:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "string",
      "academyId": "uuid",
      "groupId": "uuid"
    }
  ]
}
```

#### `POST /api/classes`
Crea una nueva clase.

**Body:**
```json
{
  "academyId": "uuid",
  "name": "string",
  "groupId": "uuid"
}
```

#### `PATCH /api/classes/[classId]`
Actualiza una clase.

#### `DELETE /api/classes/[classId]`
Elimina una clase.

#### `POST /api/classes/[classId]/generate-sessions`
Genera sesiones recurrentes para una clase.

**Body:**
```json
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "daysOfWeek": [0, 1, 2, 3, 4, 5, 6],
  "time": "HH:mm"
}
```

#### `GET /api/class-sessions`
Lista sesiones de clase.

**Query params:**
- `classId`: uuid
- `academyId`: uuid
- `startDate`: YYYY-MM-DD
- `endDate`: YYYY-MM-DD

#### `POST /api/class-sessions`
Crea una sesión de clase.

**Body:**
```json
{
  "classId": "uuid",
  "sessionDate": "YYYY-MM-DD",
  "startTime": "HH:mm",
  "endTime": "HH:mm"
}
```

#### `PATCH /api/class-sessions/[sessionId]`
Actualiza una sesión.

#### `DELETE /api/class-sessions/[sessionId]`
Elimina una sesión.

### Asistencia

#### `POST /api/attendance`
Registra o actualiza asistencia de atletas.

**Body:**
```json
{
  "sessionId": "uuid",
  "entries": [
    {
      "athleteId": "uuid",
      "status": "present" | "absent" | "late" | "excused",
      "notes": "string"
    }
  ]
}
```

#### `GET /api/attendance`
Obtiene registros de asistencia.

**Query params:**
- `sessionId`: uuid
- `athleteId`: uuid
- `startDate`: YYYY-MM-DD
- `endDate`: YYYY-MM-DD

### Evaluaciones

#### `POST /api/assessments`
Crea una evaluación de atleta.

**Body:**
```json
{
  "academyId": "uuid",
  "athleteId": "uuid",
  "assessmentDate": "YYYY-MM-DD",
  "apparatus": "string",
  "assessedBy": "uuid",
  "overallComment": "string",
  "scores": [
    {
      "skillId": "uuid",
      "score": number,
      "comments": "string"
    }
  ]
}
```

### Notas de Entrenador

#### `POST /api/coach-notes`
Crea una nota de entrenador sobre un atleta.

**Body:**
```json
{
  "academyId": "uuid",
  "athleteId": "uuid",
  "note": "string",
  "authorId": "uuid"
}
```

### Facturación

#### `GET /api/billing/plans`
Lista planes disponibles.

**Respuesta:**
```json
{
  "items": [
    {
      "id": "uuid",
      "code": "free" | "pro" | "premium",
      "nickname": "string",
      "stripePriceId": "string",
      "maxAcademies": number,
      "maxAthletes": number
    }
  ]
}
```

#### `POST /api/billing/checkout`
Crea una sesión de checkout de Stripe.

**Body:**
```json
{
  "academyId": "uuid",
  "planCode": "free" | "pro" | "premium"
}
```

**Respuesta:**
```json
{
  "checkoutUrl": "string"
}
```

#### `GET /api/billing/portal`
Obtiene URL del portal de facturación de Stripe.

**Query params:**
- `academyId`: uuid (requerido)

**Respuesta:**
```json
{
  "portalUrl": "string"
}
```

#### `GET /api/billing/status`
Obtiene el estado de facturación de una academia.

**Body:**
```json
{
  "academyId": "uuid"
}
```

**Respuesta:**
```json
{
  "subscription": {
    "stripeCustomerId": "string",
    "planCode": "string",
    "status": "active" | "canceled" | "past_due"
  }
}
```

#### `GET /api/billing/history`
Obtiene historial de facturas.

**Query params:**
- `academyId`: uuid (requerido)

### Super Admin

#### `GET /api/super-admin/users`
Lista todos los usuarios (solo super_admin).

**Query params:**
- `role`: string
- `status`: `active` | `suspended`
- `page`: number
- `limit`: number

#### `GET /api/super-admin/users/[profileId]`
Obtiene detalles de un usuario específico.

#### `PATCH /api/super-admin/users/[profileId]`
Actualiza un usuario (solo super_admin).

**Body:**
```json
{
  "role": "string",
  "isSuspended": boolean,
  "canLogin": boolean
}
```

#### `POST /api/super-admin/users/[profileId]/send-message`
Envía mensaje/email a un usuario.

**Body:**
```json
{
  "subject": "string",
  "message": "string"
}
```

#### `GET /api/super-admin/academies`
Lista todas las academias.

**Query params:**
- `plan`: string
- `type`: string
- `country`: string
- `status`: `active` | `suspended`

#### `GET /api/super-admin/academies/[academyId]`
Obtiene detalles de una academia.

#### `PATCH /api/super-admin/academies/[academyId]`
Actualiza una academia.

**Body:**
```json
{
  "isSuspended": boolean
}
```

#### `DELETE /api/super-admin/academies/[academyId]`
Elimina una academia.

#### `GET /api/super-admin/metrics`
Obtiene métricas globales del sistema.

**Respuesta:**
```json
{
  "totalUsers": number,
  "totalAcademies": number,
  "totalAthletes": number,
  "activeSubscriptions": number
}
```

#### `GET /api/super-admin/logs`
Obtiene logs del sistema.

**Query params:**
- `limit`: number
- `offset`: number

#### `POST /api/super-admin/athletes/sync-users`
Sincroniza atletas existentes con usuarios.

#### `POST /api/super-admin/athletes/activate-access`
Activa acceso de login para un atleta.

**Body:**
```json
{
  "profileId": "uuid"
}
```

### Webhooks

#### `POST /api/stripe/webhook`
Endpoint para webhooks de Stripe.

**Headers:**
- `stripe-signature`: Firma de Stripe

**Eventos soportados:**
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## Límites y Validaciones

### Límites de Plan

Los endpoints respetan los límites del plan del usuario:
- **Free**: Máximo 50 atletas, 1 academia
- **Pro**: Máximo 200 atletas, múltiples academias
- **Premium**: Sin límites

### Validaciones Comunes

- UUIDs deben ser válidos
- Emails deben tener formato válido
- Fechas deben estar en formato ISO8601 o YYYY-MM-DD
- Roles deben ser válidos según el contexto
- Tenant ID debe coincidir con el del usuario autenticado

## Rate Limiting

Actualmente no hay rate limiting implementado, pero se recomienda:
- Máximo 100 requests por minuto por usuario
- Máximo 1000 requests por hora por usuario

## Versión de API

La API actual es la versión 1.0. No hay versionado de endpoints aún.

## Soporte

Para problemas o preguntas sobre la API, contacta al equipo de desarrollo.

