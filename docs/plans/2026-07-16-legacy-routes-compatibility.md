# Compatibilidad y retirada controlada de rutas legacy

Fecha: 2026-07-16  
Decisión: Opción A de `vault/06-Roadmap-y-Tareas/Decisiones.md`

## Regla

`/app/[academyId]/*` y `/super-admin/*` son las superficies canónicas. Las URLs `/dashboard/*` no se eliminan durante seis meses: se mantienen solo para bookmarks, emails e integraciones antiguas.

## Clasificación

| Familia | Estado | Comportamiento |
| --- | --- | --- |
| `/dashboard` | Redirect | Resuelve el home por rol; owner/admin/coach aterrizan en su workspace moderno, parent/athlete en su portal y superadmin en su panel. |
| `/dashboard/athletes`, `classes`, `events`, `assessments`, `announcements`, `coaches`, `classes/groups`, `classes/calendar`, `athletes/new`, `events/new` | Redirect | Resuelven `activeAcademyId` o membership y redirigen al módulo canónico `/app/[academyId]/...`. |
| `/dashboard/billing`, `/dashboard/settings`, `/dashboard/messages` | Redirect | Desde 2026-07-16 resuelven academia y redirigen a `/app/[academyId]/billing`, `/settings` o `/messages`; sin academia vuelven a la compatibilidad global de academias. |
| `/dashboard/academies`, `/dashboard/profile`, `/dashboard/users` | Compatibilidad global | Se mantienen porque gestionan cuenta, multi-academia, perfil y administración transversal; no existe un equivalente tenant exacto. |
| `/dashboard/calendar`, `/dashboard/sessions/*`, `/dashboard/plan-limits` | Compatibilidad global | Se mantienen temporalmente porque todavía tienen capacidades globales o no existe una ruta moderna equivalente completa. |
| `/dashboard/marketplace/*`, `/dashboard/empleo/*` | Compatibilidad de producto | Se mantienen fuera del workspace de academia para provider/marketplace/empleo; no se redirigen a una ruta inventada. |
| `/super-admin/*` | Canónico | No depende de `/dashboard`; el middleware valida la sesión y el perfil de superadmin. |

## Criterios para retirar

- medir accesos legacy durante seis meses;
- revisar enlaces externos, emails e integraciones;
- contar con redirect permanente o equivalente probado para cada ruta;
- validar permisos owner/admin/coach/parent/athlete antes de eliminar un archivo;
- registrar la retirada y actualizar el inventario de producto.

## QA ejecutada

- Playwright en build de producción local verificó los destinos modernos de owner, parent, athlete y superadmin.
- Capturas comparativas baseline legacy/moderno en `test-results/comparativa-ux/`.
- No se borraron rutas ni se cambiaron contratos backend.
