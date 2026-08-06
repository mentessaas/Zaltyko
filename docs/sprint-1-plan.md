# Sprint 1: Facturación y Sesiones (Semana 1-2)

## Objetivo
Mejorar la gestión de sesiones recurrentes, optimizar la facturación con Stripe y crear perfiles públicos para entrenadores.

---

## 1. Generación Automática de Sesiones Recurrentes

### Estado Actual
- Las clases tienen `weekday`, `startTime`, `endTime`
- Las sesiones se crean manualmente una por una
- No hay automatización para generar sesiones basadas en la recurrencia de las clases

### Tareas

#### 1.1 Función de Generación de Sesiones
**Archivo**: `src/lib/sessions-generator.ts`
- Función `generateRecurringSessions()` que:
  - Toma una clase con `weekday`, `startTime`, `endTime`
  - Genera sesiones para un rango de fechas
  - Evita duplicados (verificar si ya existe una sesión para esa fecha)
  - Asigna el coach asignado a la clase si existe

#### 1.2 API Endpoint
**Archivo**: `src/app/api/classes/[classId]/generate-sessions/route.ts`
- POST endpoint que:
  - Recibe `classId`, `startDate`, `endDate`
  - Valida permisos (tenant, admin)
  - Genera sesiones usando la función anterior
  - Retorna estadísticas (sesiones creadas, duplicados evitados)

#### 1.3 UI para Generación
**Archivo**: `src/app/dashboard/classes/[classId]/page.tsx` o componente nuevo
- Botón "Generar sesiones"
- Modal o formulario con:
  - Selector de rango de fechas (desde/hasta)
  - Vista previa de cuántas sesiones se generarán
  - Botón de confirmación
- Mostrar sesiones generadas recientemente

### Criterios de Aceptación
- ✅ Puedo generar sesiones para una clase en un rango de fechas
- ✅ Las sesiones respetan el `weekday` de la clase
- ✅ No se crean sesiones duplicadas
- ✅ Se mantiene el coach asignado si existe

---

## 2. Mejoras en Facturación Stripe

### Estado Actual
- Existe integración básica con Stripe (checkout, webhook, portal)
- Las facturas se guardan en `billing_invoices` pero la sincronización puede mejorar
- La UI muestra facturas pero puede ser más informativa

### Tareas

#### 2.1 Sincronización Automática de Facturas
**Archivo**: `src/app/api/stripe/webhook/route.ts`
- Mejorar el manejo de eventos `invoice.paid`, `invoice.payment_failed`, `invoice.finalized`
- Sincronizar automáticamente todas las facturas relacionadas con el customer
- Actualizar estado de facturas existentes

#### 2.2 Endpoint de Sincronización Manual
**Archivo**: `src/app/api/billing/sync/route.ts`
- POST endpoint para sincronizar facturas manualmente
- Obtiene todas las facturas del customer desde Stripe
- Actualiza o crea registros en `billing_invoices`
- Útil para recuperar facturas históricas

#### 2.3 Mejoras en UI de Facturación
**Archivo**: `src/app/billing/page.tsx`
- Agregar filtros:
  - Por estado (paid, pending, failed)
  - Por rango de fechas
  - Por monto
- Mejorar visualización:
  - Cards más informativos
  - Badges de estado con colores
  - Gráfico de facturación mensual
- Agregar botón "Sincronizar facturas" que llama al endpoint de sync

### Criterios de Aceptación
- ✅ Las facturas se sincronizan automáticamente desde Stripe
- ✅ Puedo sincronizar facturas manualmente si es necesario
- ✅ La UI muestra filtros y mejor visualización
- ✅ Puedo ver un resumen de facturación mensual

---

## 3. Perfiles Públicos de Entrenadores

### Estado Actual
- Los entrenadores existen en `coaches` pero solo son visibles en el dashboard interno
- No hay perfiles públicos accesibles sin autenticación
- No hay información adicional como bio, foto, especialidades

### Tareas

#### 3.1 Extender Schema de Coaches
**Archivo**: `src/db/schema/coaches.ts`
- Agregar campos:
  - `bio` (text) - Biografía del entrenador
  - `photoUrl` (text) - URL de foto de perfil
  - `isPublic` (boolean) - Si el perfil es público
  - `specialties` (text[]) - Especialidades del entrenador
- Crear migración

#### 3.2 Página Pública de Perfil
**Archivo**: `src/app/coaches/[coachId]/page.tsx`
- Página pública (sin autenticación requerida)
- Muestra:
  - Nombre, foto, bio
  - Academia a la que pertenece
  - Especialidades
  - Clases que imparte (si es público)
  - Información de contacto (si está permitido)

#### 3.3 Configuración de Visibilidad
**Archivo**: `src/app/dashboard/coaches/[coachId]/edit/page.tsx` o componente
- Formulario para editar:
  - Bio
  - Foto (upload o URL)
  - Especialidades
  - Visibilidad pública (toggle)
- Validación: Solo admins/owners pueden editar

#### 3.4 Listado Público de Entrenadores
**Archivo**: `src/app/coaches/page.tsx`
- Página pública que lista todos los entrenadores públicos
- Filtros por academia, especialidad
- Búsqueda por nombre

### Criterios de Aceptación
- ✅ Los entrenadores pueden tener perfiles públicos
- ✅ Puedo ver un perfil público sin autenticación
- ✅ Los admins pueden configurar la visibilidad
- ✅ Existe un listado público de entrenadores

---

## Priorización

### Alta Prioridad (Semana 1)
1. Generación automática de sesiones recurrentes
2. Sincronización automática de facturas Stripe

### Media Prioridad (Semana 2)
3. Mejoras en UI de facturación
4. Perfiles públicos de entrenadores (básico)

### Baja Prioridad (Si hay tiempo)
5. Listado público completo de entrenadores
6. Gráficos avanzados de facturación

---

## Notas Técnicas

### Sesiones Recurrentes
- Usar librería como `date-fns` para cálculos de fechas
- Considerar zonas horarias si es necesario
- Validar que el rango de fechas no sea excesivo (ej: máximo 1 año)

### Facturación Stripe
- Usar `stripe.invoices.list()` para obtener facturas
- Manejar paginación si hay muchas facturas
- Considerar rate limiting de Stripe API

### Perfiles Públicos
- Considerar SEO (meta tags, structured data)
- Implementar caché si hay mucho tráfico
- Validar que solo entrenadores públicos sean accesibles

