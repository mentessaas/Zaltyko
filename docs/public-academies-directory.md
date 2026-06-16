# Directorio Público de Academias

## Descripción General

El módulo de Directorio Público de Academias permite que las academias sean visibles públicamente sin necesidad de autenticación. Los usuarios pueden buscar y filtrar academias por tipo, ubicación y otros criterios.

## Arquitectura

### Base de Datos

#### Campos Añadidos a `academies`
- `city` (text): Ciudad de la academia
- `public_description` (text): Descripción pública visible en el directorio
- `is_public` (boolean, default: true): Controla si la academia es visible públicamente
- `logo_url` (text): URL del logo de la academia

#### Vista Pública
- `public_academies_view`: Vista SQL que expone solo campos públicos de academias con `is_public = true` y `is_suspended = false`
- **No tiene RLS**: Acceso público sin autenticación

#### Tablas Futuras (Preparadas)
- `academy_messages`: Para mensajería entre academias (futuro)
- `academy_geo_groups`: Para agrupación geográfica (futuro)

### Rutas Públicas

#### Frontend
- `/academias`: Listado de academias con filtros
- `/academias/[id]`: Página individual de academia

#### API
- `GET /api/public/academies`: Listado con filtros (búsqueda, tipo, país, región, ciudad)
- `GET /api/public/academies/[id]`: Detalle de academia
- `POST /api/public/academies/[id]/contact`: Formulario de contacto

### Rutas Admin

- `/super-admin/academies/public`: Gestión de visibilidad pública
- `PUT /api/super-admin/academies/[id]/public`: Actualizar visibilidad (solo super_admin)

## Seguridad

### RLS (Row-Level Security)

- **Tabla `academies`**: Mantiene RLS estricto (solo tenant/admin)
- **Vista `public_academies_view`**: Sin RLS (acceso público)
- **API Pública**: No requiere autenticación, pero valida input con Zod
- **Formulario de Contacto**: Rate limiting (5 req/min por IP)

### Middleware

Las rutas `/academias*` y `/api/public/*` están excluidas del middleware de autenticación.

## Componentes

### Componentes Públicos

- `AcademiesGrid`: Grid responsive de tarjetas
- `AcademyCard`: Tarjeta individual de academia
- `AcademiesFilters`: Filtros sticky (búsqueda, tipo, país, región, ciudad)
- `AcademyHero`: Hero section de página individual
- `AcademyInfo`: Sección de información
- `AcademySchedule`: Horarios públicos (solo títulos y días)
- `ContactAcademyForm`: Formulario de contacto
- `NearbyAcademies`: Lista de academias cercanas

### Componentes Admin

- `PublicAcademiesTable`: Tabla en super-admin
- `TogglePublicVisibility`: Botón para activar/desactivar visibilidad

## Server Actions

- `getPublicAcademies`: Listado con filtros
- `getPublicAcademy`: Detalle por ID
- `contactAcademy`: Envío de formulario de contacto
- `toggleAcademyVisibility`: Cambiar `is_public` (solo super_admin)

## Migraciones SQL

1. **0033_add_public_academy_fields.sql**: Añade campos públicos a `academies`
2. **0034_create_public_academies_view.sql**: Crea vista pública
3. **0035_create_academy_messages.sql**: Crea tabla de mensajes (futuro)
4. **0036_create_academy_geo_groups.sql**: Crea tabla de grupos geo (futuro)

## Uso

### Para Super Admin

1. Ir a `/super-admin/academies/public`
2. Ver lista de academias con su estado de visibilidad
3. Usar el toggle para activar/desactivar visibilidad pública

### Para Usuarios Públicos

1. Visitar `/academias`
2. Usar filtros para buscar academias
3. Hacer clic en una academia para ver detalles
4. Usar formulario de contacto para contactar con la academia

## Integración Futura con GymnasticMeet

Las tablas `academy_messages` y `academy_geo_groups` están preparadas para futuras integraciones. La estructura permite:

- Comunicación entre academias
- Agrupación geográfica para eventos
- Integración con sistemas externos de gestión de competiciones

## Notas Técnicas

- Las consultas públicas usan la vista `public_academies_view`, nunca la tabla `academies` directamente
- Los horarios públicos solo muestran títulos y días, no datos privados
- El formulario de contacto tiene rate limiting para prevenir spam
- Las imágenes de logos usan `next/image` para optimización

