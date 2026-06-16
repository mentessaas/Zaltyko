# Go-Live Review - Abril 2026

Fecha de revisión: 2026-04-21

## Objetivo

Dejar una fuente de verdad corta y operativa para decidir qué entra en el primer release comercial, qué sigue oculto por feature flag y qué bordes todavía deben vigilarse antes de abrir onboarding real a los primeros clientes.

## 1. Módulos visibles en el primer release

### Owner

- Registro y login
- Onboarding de owner
- Selector de academias y dashboard global
- Workspace de academia:
  - Dashboard
  - Atletas
  - Clases
  - Eventos
  - Anuncios
  - Facturación
  - Configuración
- Calendario global
- Perfil
- Mensajes

### Coach

- Login e invitación
- Home dirigido a academia activa
- Workspace de academia:
  - Dashboard
  - Atletas
  - Clases
  - Eventos
- Calendario global
- Perfil
- Mensajes sin creación libre de conversaciones

### Parent

- Aceptación de invitación
- Perfil familiar
- Calendario filtrado por hijos
- Mensajes solo lectura/seguimiento desde conversaciones existentes

### Athlete

- Aceptación de invitación
- Perfil propio
- Calendario personal
- Mensajes solo lectura/seguimiento desde conversaciones existentes

## 2. Módulos ocultos o degradados por flag

Fuente: [features.ts](../src/lib/product/features.ts)

Todas estas flags quedan en `false` por defecto y hoy deben mantenerse así para el primer release:

- `advancedAnalytics`
  - Ruta: [analytics/page.tsx](../src/app/app/[academyId]/dashboard/analytics/page.tsx)
  - Estado: bloqueado con `FeatureUnavailableState`
- `reportsHub`
  - Ruta: [reports/page.tsx](../src/app/app/[academyId]/reports/page.tsx)
  - Estado: bloqueado con `FeatureUnavailableState`
  - Navegación: ya no aparece en menús de academia mientras la flag siga apagada
- `scheduledReports`
  - API: [scheduled reports route](../src/app/api/reports/scheduled/route.ts)
  - Estado: devuelve `FEATURE_DISABLED`
- `whatsapp`
  - Ruta: [whatsapp/page.tsx](../src/app/app/[academyId]/whatsapp/page.tsx)
  - Estado: bloqueado con `FeatureUnavailableState`
- `paymentMethods`
  - API: [payment-method/route.ts](../src/app/api/billing/payment-method/route.ts)
  - Estado: devuelve `FEATURE_DISABLED`
- `communicationTemplateUse`
  - API: [template use route](../src/app/api/communication/templates/[templateId]/use/route.ts)
  - Estado: devuelve `FEATURE_DISABLED`

## 3. Smoke walkthrough por rol

Nota: esta revisión combina walkthrough de código y tests automatizados ya existentes. No sustituye una ronda visual manual en navegador con datos reales.

### Owner

Recorrido esperado:

1. Registro público desde [RegisterForm.tsx](../src/components/RegisterForm.tsx)
2. Redirección a [owner onboarding](../src/app/onboarding/owner/page.tsx)
3. Resolución de home desde [resolve-user-home.ts](../src/lib/auth/resolve-user-home.ts)
4. Entrada al dashboard de academia activa
5. Acceso a atletas, clases, eventos, billing y settings desde el shell de academia

Estado actual:

- Bien encaminado
- Navegación y redirects ya son coherentes
- La salida comercial para owner parece lista si la academia tiene datos básicos

### Coach

Recorrido esperado:

1. Acepta invitación
2. Completa acceso con [api/invitations/complete/route.ts](../src/app/api/invitations/complete/route.ts)
3. Redirección a academia activa
4. Entra a clases, atletas y eventos
5. Puede usar calendario y mensajes dentro de su experiencia acotada

Estado actual:

- Bien encaminado
- El home preferido y la navegación ya lo dejan en el workspace correcto
- El menú no expone billing ni configuración

### Parent

Recorrido esperado:

1. Acepta invitación desde [auth/invite/page.tsx](../src/app/auth/invite/page.tsx) o variantes
2. Queda en destino limitado resuelto por rol
3. Ve perfil familiar
4. Usa calendario filtrado por hijos
5. Revisa mensajes sin entrar en flujos administrativos

Estado actual:

- Mucho más sólido que antes
- El calendario ya filtra por hijos y el perfil familiar ya muestra métricas reales
- Mensajes evita flujos de creación improvisados

## 4. Tests automatizados que ya respaldan estos recorridos

- [product-roles-navigation.test.ts](../tests/product-roles-navigation.test.ts)
  - navegación por rol
  - homes preferidos
  - acceso limitado a academy workspace
- [e2e-critical-flows.test.ts](../tests/e2e-critical-flows.test.ts)
  - aceptación de invitaciones
  - redirect correcto por rol
  - bloqueo cuando el email autenticado no coincide

## 5. Bloqueantes antes de abrir a primeros clientes

### Bloqueantes reales

- Hacer una ronda manual en navegador para `owner`, `coach` y `parent` con sesión real y datos reales
- Confirmar que el marketing y pricing no prometen módulos que siguen apagados por flag
- Revisar entorno productivo con `verify:production`, `validate:rls` y `audit:api-routes:strict`
- Rotar y verificar credenciales antes de despliegue público

### Bordes que todavía conviene corregir pronto

- Persistencia real para historial de reportes; hoy queda honestamente degradado
- Reemplazar `alert()` restantes fuera del flujo principal, sobre todo en componentes de marketplace, empleo, eventos y super-admin
- Revisar módulos secundarios con mocks o placeholders:
  - [lib/reports/class-report.ts](../src/lib/reports/class-report.ts)
  - [lib/reports/churn-report.ts](../src/lib/reports/churn-report.ts)
  - [lib/reports/coach-report.ts](../src/lib/reports/coach-report.ts)
- Revisar copy comercial en páginas públicas de `features`, `pricing` e integraciones para evitar prometer WhatsApp, reportes programados o analítica avanzada como si ya estuvieran disponibles

## 6. Post-lanzamiento razonable

- Reabrir `reportsHub` cuando haya:
  - persistencia real de ejecuciones
  - historial visible
  - programación estable
  - exportación auditada
- Reabrir `whatsapp` cuando haya:
  - proveedor validado
  - verificación real de credenciales
  - historial y reintentos
- Reabrir `paymentMethods` cuando Stripe esté cerrado end-to-end y probado con webhooks

## 7. Recomendación final

Con el estado actual, Zaltyko ya está cerca de un primer release defendible si el alcance comercial queda deliberadamente acotado a:

- owner + staff invitado
- operación de academia
- calendario, atletas, clases, eventos, anuncios, billing base y perfiles

La salida no debería incluir todavía analítica avanzada, hub de reportes, reportes programados, WhatsApp ni gestión avanzada de métodos de pago.
