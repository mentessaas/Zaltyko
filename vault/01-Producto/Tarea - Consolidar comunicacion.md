---
status: active
owner: producto
last_reviewed: 2026-06-22
source:
  - ../src/app/app/[academyId]/messages/page.tsx
  - ../src/app/app/[academyId]/notifications/page.tsx
  - ../src/app/app/[academyId]/whatsapp/page.tsx
  - ../src/app/api/communication/history/route.ts
  - ../src/app/api/notifications/route.ts
---
# Tarea - Consolidar comunicacion

## Objetivo

Convertir mensajes, notificaciones y WhatsApp en una experiencia coherente para academia y familias.

## Estado detectado

- `/messages` gestiona mensajes de contacto del directorio publico.
- `/notifications` tiene lista, filtros, preferencias y acciones de lectura.
- `/whatsapp` existe pero depende de feature flag `whatsapp`; si no esta activo muestra unavailable state.
- Existen APIs de communication, templates, scheduled notifications, notifications y WhatsApp.

## Riesgos concretos

- "Centro de comunicacion" puede sonar mas completo que la experiencia actual.
- WhatsApp no debe venderse como activo si el feature flag esta apagado para primeros clientes.
- En `notifications/page.tsx`, el calculo de `offset` parece incorrecto: `((reset ? 1 : page) - 1 * limit)` deberia revisarse como paginacion.

## Criterios de aceptacion

- Navegacion clara entre mensajes de contacto, notificaciones y WhatsApp.
- Copy publico distingue notificaciones/email/mensajes auditables de WhatsApp cuando este no este activo.
- Paginacion de notificaciones funciona correctamente.
- Acciones read/read-all/delete actualizan estado y UI.
- Preferencias se guardan y aplican.

## Pruebas

- QA de `/messages`, `/notifications`, `/whatsapp`.
- API tests para notifications read/read-all/delete.
- Verificar feature flag WhatsApp en entorno demo/produccion.

## Resultado 2026-06-22

- Corregido calculo de offset en `/app/[academyId]/notifications/page.tsx` a `(pageToLoad - 1) * limit`.
- ESLint focal limpio para la pagina de notificaciones.
- WhatsApp se mantiene detras de feature flag; no se activo ni se cambio la promesa publica.
