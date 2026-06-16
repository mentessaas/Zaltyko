# Módulo Public Events & Competitions Directory

## Descripción General

El módulo **Public Events & Competitions Directory** permite a las academias crear y gestionar eventos internos o públicos, y permite a los usuarios buscar y ver eventos en un directorio público. Sigue la misma estructura y patrones del módulo Public Academies Directory.

## Estructura de Base de Datos

### Tabla `events`

La tabla `events` almacena todos los eventos y competencias creados por las academias.

**Campos principales:**
- `id` (uuid): Identificador único del evento
- `tenant_id` (uuid): ID del tenant (multi-tenancy)
- `academy_id` (uuid): ID de la academia organizadora (FK a `academies.id`)
- `title` (text): Título del evento
- `description` (text): Descripción del evento
- `category` (text[]): Categorías del evento (ej: FIG level, edad, etc)
- `is_public` (boolean): Indica si el evento aparece en el directorio público
- `level` (enum): Nivel del evento (internal, local, national, international)
- `discipline` (enum): Disciplina (artistic_female, artistic_male, rhythmic, trampoline, parkour)
- `event_type` (enum): Tipo de evento (competitions, courses, camps, workshops, clinics, evaluations, other)
- `start_date` (date): Fecha de inicio del evento (obligatorio)
- `end_date` (date): Fecha de fin del evento
- `registration_start_date` (date): Fecha de inicio del periodo de inscripción
- `registration_end_date` (date): Fecha de fin del periodo de inscripción
- `country_code` (text): Código del país (ej: es, mx, ar)
- `country_name` (text): Nombre completo del país
- `province_name` (text): Nombre de la provincia/estado
- `city_name` (text): Nombre de la ciudad
- `country`, `province`, `city` (text): Ubicación del evento (campos antiguos, mantenidos para compatibilidad)
- `contact_email`, `contact_phone`, `contact_instagram`, `contact_website` (text): Información de contacto
- `images` (text[]): URLs de imágenes del evento (subidas a Supabase Storage)
- `attachments` (jsonb): Archivos adjuntos en formato JSON con `name` y `url` (PDFs, documentos)
- `notify_internal_staff` (boolean): Si se debe notificar al personal interno al crear/editar
- `notify_city_academies` (boolean): Si se debe notificar a academias de la misma ciudad
- `notify_province_academies` (boolean): Si se debe notificar a academias de la misma provincia
- `notify_country_academies` (boolean): Si se debe notificar a academias del mismo país
- `created_at`, `updated_at` (timestamptz): Fechas de creación y actualización

**Índices:**
- `events_tenant_academy_idx`: (tenant_id, academy_id)
- `events_country_idx`: (country)
- `events_province_idx`: (province)
- `events_city_idx`: (city)
- `events_discipline_idx`: (discipline)
- `events_level_idx`: (level)
- `events_event_type_idx`: (event_type)
- `events_start_date_idx`: (start_date)
- `events_registration_start_date_idx`: (registration_start_date)
- `events_registration_end_date_idx`: (registration_end_date)
- `events_country_code_idx`: (country_code)
- `events_is_public_idx`: (is_public)

### Enums

**`event_level`**: internal, local, national, international
**`event_discipline`**: artistic_female, artistic_male, rhythmic, trampoline, parkour
**`event_type`**: competitions, courses, camps, workshops, clinics, evaluations, other

## API Endpoints

### Endpoints Autenticados

#### `POST /api/events`
Crea un nuevo evento (requiere autenticación, solo academias).

**Body:**
```json
{
  "academyId": "uuid",
  "title": "string",
  "description": "string?",
  "category": ["string"]?,
  "isPublic": boolean,
  "level": "internal" | "local" | "national" | "international",
  "discipline": "artistic_female" | "artistic_male" | "rhythmic" | "trampoline" | "parkour"?,
  "eventType": "competitions" | "courses" | "camps" | "workshops" | "clinics" | "evaluations" | "other"?,
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD"?,
  "registrationStartDate": "YYYY-MM-DD"?,
  "registrationEndDate": "YYYY-MM-DD"?,
  "countryCode": "string"?,
  "countryName": "string"?,
  "provinceName": "string"?,
  "cityName": "string"?,
  "country": "string"?,
  "province": "string"?,
  "city": "string"?,
  "contactEmail": "string"?,
  "contactPhone": "string"?,
  "contactInstagram": "string"?,
  "contactWebsite": "string"?,
  "images": ["string"]?,
  "attachments": [{"name": "string", "url": "string"}]?,
  "notifyInternalStaff": boolean?,
  "notifyCityAcademies": boolean?,
  "notifyProvinceAcademies": boolean?,
  "notifyCountryAcademies": boolean?
}
```

**Validaciones de fechas:**
- `registrationStartDate <= registrationEndDate`
- `registrationEndDate <= startDate`
- `startDate <= endDate`

#### `GET /api/events`
Lista eventos con filtros (requiere autenticación para ver eventos privados del tenant).

**Query params:**
- `academyId`: UUID de la academia
- `country`, `province`, `city`: Ubicación
- `discipline`: Disciplina del evento
- `level`: Nivel del evento
- `eventType`: Tipo de evento
- `startDate`, `endDate`: Rango de fechas (YYYY-MM-DD)
- `search`: Búsqueda por título/descripción
- `page`: Número de página (default: 1)
- `limit`: Tamaño de página (default: 50, max: 1000)

#### `GET /api/events/[id]`
Obtiene el detalle de un evento.

#### `PATCH /api/events/[id]`
Edita un evento (solo dueño de la academia).

**Body:** Mismos campos que POST, todos opcionales.

#### `DELETE /api/events/[id]`
Elimina un evento (solo dueño de la academia).

#### `POST /api/events/[id]/notify`
Envía notificaciones sobre un evento.

**Body:**
```json
{
  "type": "internal_staff" | "city" | "province" | "country"
}
```

### Endpoints Públicos

#### `GET /api/public/events`
Lista eventos públicos con filtros (sin autenticación requerida).

**Query params:** Mismos que `/api/events` GET.

#### `GET /api/public/events/[id]`
Obtiene el detalle público de un evento (solo eventos con `is_public = true`).

#### `GET /api/public/events/filter-options`
Devuelve opciones disponibles para filtros (países, provincias, ciudades, disciplinas).

#### `POST /api/public/events/[id]/contact`
Envía un formulario de contacto sobre un evento (con rate limiting).

**Body:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string?",
  "message": "string"
}
```

## Row Level Security (RLS)

### Políticas RLS

**SELECT:**
- Eventos públicos (`is_public = true`) son accesibles sin autenticación
- Usuarios autenticados ven eventos de su tenant
- Admins tienen acceso global

**INSERT/UPDATE/DELETE:**
- Solo academias dueñas pueden modificar sus eventos
- Admins tienen acceso global

## Sistema de Notificaciones

El servicio `eventsNotifier.ts` proporciona funciones para enviar notificaciones por email:

- `notifyInternalStaff(academyId, eventId)`: Notifica al personal interno de la academia
- `notifyCity(academyId, eventId)`: Notifica a academias de la misma ciudad
- `notifyProvince(academyId, eventId)`: Notifica a academias de la misma provincia
- `notifyCountry(academyId, eventId)`: Notifica a academias del mismo país

**Notificaciones Opcionales:**
Las notificaciones son **opcionales** y se controlan mediante toggles en el formulario de creación/edición:
- `notifyInternalStaff`: Toggle para notificar personal interno
- `notifyCityAcademies`: Toggle para notificar academias de la misma ciudad
- `notifyProvinceAcademies`: Toggle para notificar academias de la misma provincia
- `notifyCountryAcademies`: Toggle para notificar academias del mismo país

**Reglas:**
- Solo se envían notificaciones si el toggle correspondiente está activado
- Si todos los toggles están en `false`, no se envía ninguna notificación
- Las notificaciones se envían automáticamente al crear o editar un evento si los toggles están activados
- Las notificaciones buscan academias según la ubicación del evento usando los campos `country_code`, `province_name`, `city_name`
- Se usa el servicio de email (Mailgun) para enviar las notificaciones

## UI Pública

### Páginas

- `/events`: Listado público de eventos con filtros y paginación
- `/events/[id]`: Página pública de detalle del evento

### Componentes

- `EventsFilters`: Filtros de búsqueda (país, provincia, ciudad, disciplina, nivel, fechas, texto)
- `EventsGrid`: Grid de eventos con `EventCard`
- `EventCard`: Card individual de evento
- `EventHero`: Hero section del detalle
- `EventInfo`: Información detallada del evento
- `EventContact`: Formulario de contacto
- `ShareButton`: Botón para compartir evento

## UI Privada (Dashboard)

### Páginas

- `/dashboard/events`: Lista de eventos de las academias del usuario
- `/dashboard/events/new`: Crear nuevo evento
- `/dashboard/events/[id]`: Detalle y edición de evento

### Componentes

- `EventForm`: Formulario reutilizable para crear/editar eventos
- `EventNotifications`: Componente con 4 botones para enviar notificaciones según nivel

## Filtros de Búsqueda

El buscador público incluye:

- **País**: Select con todos los países disponibles (usando `countryRegions.ts`)
- **Provincia**: Select dependiente del país (se actualiza según país seleccionado)
- **Ciudad**: Select dependiente de la provincia (se actualiza según provincia seleccionada)
- **Disciplina**: Select con todas las disciplinas (multiselect)
- **Nivel**: Select (internal, local, national, international)
- **Tipo de evento**: Select (competitions, courses, camps, workshops, clinics, evaluations, other)
- **Rango de fechas**: Date pickers para fecha inicio y fin del evento
- **Búsqueda por texto**: Campo de texto libre para buscar por título/descripción

## Flujos de Uso

### Crear un Evento

1. El usuario accede a `/dashboard/events/new`
2. Completa el formulario con los datos del evento:
   - Título (obligatorio)
   - Descripción
   - Nivel (obligatorio): internal, local, national, international
   - Disciplina (opcional)
   - Tipo de evento (opcional): competitions, courses, camps, workshops, clinics, evaluations, other
   - Fecha de inicio del evento (obligatorio)
   - Fecha de fin del evento (opcional)
   - Fecha de inicio de inscripción (opcional)
   - Fecha de fin de inscripción (opcional)
   - Ubicación: Selector de País → Provincia → Ciudad (usando `LocationSelect`)
   - Categorías (separadas por comas)
   - Información de contacto (email, teléfono, Instagram, sitio web)
   - Subir imágenes (múltiples, hasta 10MB cada una)
   - Subir archivos adjuntos (PDFs, documentos, hasta 10MB cada uno)
3. Selecciona si el evento será público o no
4. Configura las opciones de notificación (toggles):
   - Notificar personal interno
   - Notificar academias de la misma ciudad
   - Notificar academias de la misma provincia
   - Notificar academias del mismo país
5. Guarda el evento
6. Las notificaciones se envían automáticamente según los toggles activados

### Buscar Eventos Públicos

1. El usuario accede a `/events`
2. Aplica filtros según sus necesidades (ubicación, disciplina, fechas, etc)
3. Navega por los resultados paginados
4. Hace clic en un evento para ver detalles
5. Puede contactar a los organizadores o compartir el evento

### Enviar Notificaciones

Las notificaciones se pueden enviar de dos formas:

**1. Al crear/editar un evento:**
- Los toggles en el formulario controlan si se envían notificaciones automáticamente
- Si un toggle está activado, la notificación se envía al guardar el evento

**2. Manualmente desde la página de detalle:**
- El usuario accede a `/dashboard/events/[id]`
- En la sección de notificaciones, puede enviar notificaciones manualmente:
   - Personal interno: Notifica a todos los miembros de la academia
   - Ciudad: Notifica a academias de la misma ciudad
   - Provincia: Notifica a academias de la misma provincia
   - País: Notifica a academias del mismo país
- El sistema busca automáticamente los destinatarios y envía los emails

## Migración

Para aplicar la migración de base de datos:

```sql
-- Ejecutar en Supabase SQL Editor
\i drizzle/0051_create_events_directory.sql
```

Luego aplicar las políticas RLS desde `supabase/rls.sql`.

**Migración de mejoras:**
Se aplicó una migración adicional (`add_events_enhancements`) que agrega:
- Enum `event_type`
- Campos `registration_start_date` y `registration_end_date`
- Campos de ubicación mejorados: `country_code`, `country_name`, `province_name`, `city_name`
- Campos de notificaciones opcionales: `notify_internal_staff`, `notify_city_academies`, `notify_province_academies`, `notify_country_academies`
- Índices adicionales para optimización

## Subida de Archivos

El sistema permite subir archivos a Supabase Storage:

**Buckets:**
- `events/images`: Para imágenes del evento
- `events/files`: Para archivos adjuntos (PDFs, documentos)

**Endpoint de upload:**
- `POST /api/events/upload`: Sube un archivo y devuelve la URL pública
  - Body: `FormData` con `file`, `type` ("image" | "file"), y opcionalmente `eventId`
  - Headers: `x-academy-id` (requerido para autenticación)

**Límites:**
- Tamaño máximo: 10MB por archivo
- Formatos de imagen: Todos los formatos de imagen
- Formatos de archivo: PDF, DOC, DOCX

**Componente:**
- `FileUpload`: Componente reutilizable que maneja la subida y visualización de archivos

## Tipos TypeScript

Los tipos están definidos en `src/types/events.ts`:

- `Event`: Tipo completo de evento
- `PublicEvent`: Evento con información de academia
- `EventFilters`: Filtros de búsqueda
- `CreateEventInput`: Input para crear evento
- `UpdateEventInput`: Input para actualizar evento
- `EventNotificationResult`: Resultado de notificación

## Notas de Implementación

- El módulo sigue exactamente los mismos patrones que Public Academies Directory
- Usa el mismo sistema de validación con Zod
- Mismo estilo de UI (colores, spacing, componentes)
- Mismo sistema de paginación y filtros
- Mismo manejo de errores con `handleApiError`
- Mismo sistema de rate limiting para endpoints públicos
- Mismo patrón de RLS para seguridad multi-tenant

## Mejoras Implementadas

### 1. Selector de Ubicación
- Selector dependiente País → Provincia → Ciudad
- Usa `LocationSelect` component con datos de `countryRegions.ts` y `citiesByRegion.ts`
- Almacena tanto códigos como nombres completos para mejor búsqueda

### 2. Date Pickers
- Inputs tipo `date` nativos con validación
- Validaciones automáticas:
  - `registrationStartDate <= registrationEndDate`
  - `registrationEndDate <= startDate`
  - `startDate <= endDate`

### 3. Subida de Archivos
- Componente `FileUpload` para imágenes y archivos
- Integración con Supabase Storage
- Visualización previa de imágenes
- Lista de archivos descargables

### 4. Tipos de Evento
- Enum `event_type` con 7 tipos: competitions, courses, camps, workshops, clinics, evaluations, other
- Filtro en búsqueda pública
- Visualización en cards y páginas de detalle

### 5. Notificaciones Opcionales
- Toggles en formulario para controlar notificaciones
- Solo se envían si el toggle está activado
- Integración automática al crear/editar eventos

### 6. Campos de Inscripción
- `registration_start_date` y `registration_end_date`
- Visualización en páginas públicas
- Validación de fechas respecto al evento

