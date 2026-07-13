---
status: active
owner: producto
last_reviewed: 2026-07-13
source:
  - ../ROADMAP.md
  - ../AGENTS.md
---

# Changelog interno

## 2026-07-13 - Cierre operativo: despliegue Git de Vercel sin falso rojo en GitHub Actions

- El workflow `Deploy` de GitHub ya no intenta usar la CLI de Vercel cuando faltan sus tres secretos de operación (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Un job de readiness no imprime valores y deja el deploy opcional como `skipped`; así el pipeline no informa un fallo que no representa al despliegue real por integración Git de Vercel.
- Cuando los tres secretos se configuren en GitHub, la ruta existente de `vercel pull/build/deploy` seguirá ejecutándose sin cambios. No se crearon ni rotaron secretos y no se alteró el despliegue automático de Vercel.
- Se actualizó `Estado actual de Zaltyko` con el cierre técnico: ledger SQL de 32 migraciones, limitación de mutaciones solo tras verificar tenant y corrección del empaquetado de `/api/docs` en Vercel.
- Validación local: formato YAML/Prettier, lint y typecheck pasan; el siguiente push a `main` debe mostrar el workflow alternativo como `skipped` mientras los secretos no estén configurados.
- Vault: `Estado actual de Zaltyko` y este changelog.

## 2026-07-13 - Corrección de entrega de OpenAPI en Vercel

- El smoke posterior al despliegue detectó que `GET /api/docs` devolvía 404 aunque la ruta compilaba localmente. La causa era la regla amplia `docs` en `.vercelignore`: también excluía `src/app/api/docs` de la subida a Vercel.
- Se ancló la exclusión a `/docs/`, preservando la documentación raíz sin eliminar la ruta API. Una prueba de regresión inspecciona la regla para que el bundle productivo conserve OpenAPI. La publicación y smoke de `/api/docs` se registran tras integrar esta corrección.

## 2026-07-13 - Cierre técnico autónomo: ledger SQL, límites verificados y CI honesta

- **Migraciones de producción**: se inspeccionó el changelog reciente de Supabase, se aplicó la migración aditiva `20260713200000_create_sql_migration_ledger.sql` y se hizo bootstrap explícito de 32 SQL reales. `zaltyko_schema_migrations` tiene RLS, deniega acceso a `anon`/`authenticated` y conserva nombre, SHA-256, fecha, actor y modo de ejecución. El runner transaccional con advisory lock termina en `OK: 32 migraciones verificadas; no hay pendientes`.
- **Legado preservado**: el runner usa el nombre completo del archivo como identidad porque el repositorio conserva dos migraciones legítimas `0009_*`; no se renombraron ni alteraron migraciones históricas.
- **Aislamiento y rendimiento**: cada mutación tenant recibe una segunda cuota por academia solo tras resolver ownership/membership en servidor. La primera barrera IP Edge se conserva; no se usa un tenant enviado por el cliente. La auditoría de producción mostró que el índice UNIQUE existente `memberships_user_academy_uq (user_id, academy_id)` ya cubría la consulta objetivo, por lo que no se creó un duplicado.
- **Build/CI**: Sentry usa su API de configuración actual y Swagger se aísla de imports dinámicos en el build. El build local terminó correctamente con 216 rutas. CI smoke/E2E público apunta al dominio canónico `https://zaltyko.com`; E2E autenticado queda condicionado a secretos de repositorio reales, sin imprimirlos ni generar cuentas ficticias.
- **Validación completa previa a integración**: `pnpm verify:production` pasó 279 APIs sin rutas riesgosas, RLS 65/65, 6+32 migraciones, lint, typecheck, 54 archivos/435 pruebas y build de 216 rutas. Playwright público contra producción pasó 6/6. El despliegue se registra al integrar esta rama.

## 2026-07-13 - Fase 4 desplegada y accesible en producción

- **Entrega**: PR #28 integrado en `main` como `b97d7a81`; Vercel publicó `dpl_BU9hYAp6KjwSxVkjREL85X5n2ZPJ` en estado `READY` con los dominios públicos `https://zaltyko.com` y `https://www.zaltyko.com`.
- **Smoke seguro**: la comprobación HTTP no envió formularios ni eventos. `/`, `/pricing` y `/contact?type=network` responden 200 en `zaltyko.com`; `/super-admin/growth` responde 307 a `/auth/login`. El alias interno de Vercel devuelve SSO, sin bloquear los dominios públicos.
- **Datos**: tras el despliegue se verificaron 0 `growth_events`, 0 `leads`, 0 `commercial_interviews` y 0 `academy_trials`; las 2 filas históricas de `subscriptions` no tienen `stripe_subscription_id`. No se introdujeron fixtures.
- **Siguiente gate**: la validación comercial sigue en 0/10 entrevistas y Fase 5 continúa bloqueada hasta completar y sintetizar las 10 entrevistas reales.

## 2026-07-13 - Fase 4 instrumentada: pricing, funnel y evidencia comercial

- **Baseline honesto**: producción tiene 2 academias y 0 leads, 0 eventos growth, 0 trials, 0 suscripciones con `stripe_subscription_id` y 0/10 entrevistas. No se insertaron entrevistas o conversiones ficticias durante QA.
- **Stripe live comprobado**: desde el entorno Vercel de producción se verificaron Prices activos de Starter 19 EUR/mes y Growth 49 EUR/mes, productos activos y metadata correcta. Network conserva contacto/onboarding acompañado y no tiene checkout autoservicio.
- **Fuente first-party**: nueva tabla `growth_events` y endpoint público con allowlist PII-free para pricing/contacto. Trial, checkout, activación/cancelación y conversión se registran desde el servidor con idempotencia y sin romper la acción de negocio si falla la telemetría.
- **Leads recuperables**: contacto y captura de email hacen upsert antes de enviar correo. Las antiguas policies globales de `leads` se reemplazan por acceso directo exclusivo de super-admin.
- **Entrevistas verificables**: `commercial_interviews` deduplica academia/país/ciudad y exige tamaño, herramientas, dolor, objeción, precios y fecha para contar `completed`. APIs CRUD protegidas con `withSuperAdmin`, validación Zod y audit log.
- **Cockpit de Growth**: `/super-admin/growth` muestra funnel, denominadores, progreso 0/10, precio medio solo con evidencia y formulario accesible de programación/edición. Sin histórico, las tasas dicen `sin base`.
- **Pricing/copy**: Starter y Growth muestran “Solicitar demo”; límites de modales de billing consumen el catálogo canónico; Network conserva atribución en contacto. Se retiraron promesas no sustentadas de “RGPD Compliant”, “respuesta 24h”, ahorro o resultados garantizados, conservación ilimitada, puesta en marcha inmediata e integración prioritaria con WhatsApp.
- **Migración**: `20260713170000_phase4_commercial_validation.sql` y Drizzle `0005`, aditivas. Rollback smoke, constraints, FKs, índices y RLS verificados; aplicada a Supabase sin seed global. El push final detectó el constraint histórico `coaches_slug_unique` ausente: se canceló antes de cualquier acción, se comprobaron 3 slugs nulos/0 duplicados y se reconcilió con la migración idempotente `20260713173000_reconcile_coaches_slug_unique.sql`, sin truncar ni modificar filas. Inventario: 6 Drizzle + 31 Supabase, 115 tablas y RLS 65/65.
- **Guard de migraciones remotas**: una segunda inspección de `drizzle-kit push` propuso desactivar RLS, borrar el ledger y cambiar una PK; se eligió `No, abort` y no se ejecutó SQL. `pnpm db:migrate` ahora solo admite PostgreSQL local; staging/producción usan `pnpm db:migrate:reviewed <sql>` hasta implementar un runner con ledger.
- **QA**: 279 APIs sin rutas riesgosas, 431/431 tests, lint/typecheck, `pnpm audit` completo/productivo sin vulnerabilidades y build de 216 páginas. Axe WCAG 2.2 AA pasa sin violaciones en pricing/contacto móvil y Growth autenticado; 375 px sin overflow.
- **Pendiente real**: completar 10 entrevistas distintas y sintetizarlas. Fase 4 no se declara cerrada comercialmente y Fase 5 no comienza.

## 2026-07-10 - Suite unitaria completa y limpieza de formularios

- **Validación global**: `pnpm test` PASS con 45 archivos y 391 pruebas. La ejecución dejó el watcher activo tras el resultado, pero todos los casos terminaron correctamente.
- **FormField**: ya no combina `defaultValue` con un `value` controlado; el valor mostrado se deriva correctamente del prop controlado o del estado no controlado, eliminando un warning de React y un comportamiento ambiguo.
- **Prueba de confirmación**: la resolución de la promesa pendiente se envuelve en `act`, eliminando el warning de actualización asíncrona de React/Radix durante el test.
- **Validación focalizada**: ESLint y `tests/components-critical.test.tsx` PASS 10/10; `git diff --check` limpio. Sin migraciones.

## 2026-07-10 - Historial de correo y cron de avisos corregidos

- **Historial de correo**: destinatarios, asuntos, errores y metadata pasan a estar disponibles solo para owner/admin/super-admin. La API valida `academyId`, paginación y límites en vez de usar `parseInt` sin cotas.
- **Cron programado**: una programación sin destinatarios resueltos se marca `failed`, no `sent`; evita que el producto afirme una entrega que no ocurrió. El fallback que indica “admin users” ahora filtra realmente perfiles owner/admin del tenant.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y batería focalizada PASS 13/13. No se crearon ni aplicaron migraciones.

## 2026-07-10 - Privacidad de historial y plantillas de comunicación

- **Historial**: se restringe a staff la lectura de registros que incluyen teléfono, cuerpo y metadata; crear registros requiere owner/admin/super-admin. Antes, un `parent` o `athlete` del tenant podía leerlos y crear entradas arbitrarias.
- **Plantillas**: listado, detalle y uso quedan disponibles para staff; crear, editar o borrar requiere owner/admin/super-admin. Se preserva la prohibición existente de borrar plantillas de sistema.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y `communication-panels`, `link-requests-api`, `product-roles-navigation` PASS 13/13. Sin migraciones nuevas ni aplicadas.

## 2026-07-10 - Endurecimiento de envíos y comunicaciones programadas

- **Contador de avisos**: `/api/notifications/unread-count` consulta ahora por `profile.id`, que es la clave foránea real de `notifications.user_id`; antes usaba el UUID de Auth y podía devolver cero pese a existir avisos sin leer.
- **Push y correo**: `/api/push/send` exige owner/admin/super-admin y comprueba que el perfil destinatario esté en el tenant activo. `/api/notifications/send` exige rol operativo, academia válida del tenant y membership owner/admin (salvo super-admin); además distingue JSON inválido de un payload inválido. No se detectaron consumidores internos del endpoint de correo, por lo que el contrato nuevo con `academyId` obligatorio no rompe llamadas existentes.
- **Programadas y grupos**: padres/atletas ya no pueden consultar o mutar grupos ni programación interna. Crear/cancelar requiere owner/admin/super-admin; lectura queda limitada a staff. La programación valida que grupo y plantilla pertenezcan al tenant antes de guardar sus IDs.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y las pruebas focalizadas existentes PASS 13/13. No se crearon ni aplicaron migraciones.

## 2026-07-10 - Segunda pasada de seguridad y experiencia de comunicación

- **Conversaciones familiares**: solo `super_admin` puede saltarse la comprobación de tenant. Antes, cualquier `admin` podía crear una conversación de atleta o grupo de otro tenant si conocía el ID.
- **P2P**: la reutilización de conversaciones exige ahora que emisor y destinatario sean exactamente los dos participantes y respeta la academia solicitada. Evita devolver por error una conversación P2P ajena que contenga solo al destinatario.
- **Anuncios**: los miembros normales ya no pueden consultar borradores o archivados mediante `status`; la API valida estado, categoría y paginación. Las notificaciones de anuncio usan el `tenantId` resuelto por `withTenant` y el enlace moderno `/app/[academyId]/announcements/[id]`.
- **Centro de notificaciones**: corregido el consumo del envelope `{ ok, data: { items } }`, que mantenía el modal emergente vacío aunque hubiera datos. Los deep links abren ahora consulta de directorio, conversación interna y anuncio en su destino correcto; solo se aceptan URLs internas `/app/` desde metadata.
- **Validación**: ESLint focalizado sin avisos, `git diff --check` limpio y `communication-panels`, `link-requests-api`, `product-roles-navigation` PASS 13/13. Playwright con owner renovado: `/messages`, `/comms` (incluida pestaña de notificaciones) y `/notifications` cargan 200 y muestran sus estados reales.
- **Límite E2E**: el guardado automatizado de sesión actualizó owner, pero el runner se bloqueó antes de completar coach/super-admin; no se consideran renovadas esas sesiones ni verificado un recorrido nuevo multirol. El servidor `next dev` se reinició tras el manifiesto HMR corrupto conocido; no hay migraciones creadas ni aplicadas.

## 2026-07-10 - Endurecimiento adicional de conversaciones internas

- **Aislamiento de tenant**: las operaciones de leer, actualizar, ocultar y enviar mensajes confirman ahora que la conversación pertenece al `tenantId` activo, además de exigir participación. La actualización del último mensaje mantiene el mismo filtro.
- **Integridad y validación**: límites de paginación acotados a 1–100, cursor inválido rechazado con 400 y una respuesta solo puede referenciar un mensaje de la misma conversación. `PATCH` devuelve 400 ante JSON inválido y conserva título compartido y preferencias privadas en sus tablas respectivas.
- **Validación ejecutada**: ESLint focalizado sin avisos; `link-requests-api`, `product-roles-navigation` y `communication-panels` PASS 13/13. `pnpm typecheck` sigue bloqueado exclusivamente en `vitest.config.ts` por dos versiones incompatibles de Vite (5.4.21 y 6.4.3), cambio ajeno a este módulo; no se modificaron dependencias.
- **Migraciones**: ninguna creada ni aplicada.

## 2026-07-10 - Correccion de solicitudes de vinculo para portal familiar

- **Causa raiz**: un `parent` o `athlete` sin academy/tenant activo recibia `TENANT_MISSING` al consultar `/api/link-requests?scope=incoming`; por ello no podia ver ni aceptar la solicitud que le daba acceso. Ademas, `scope=outgoing` no estaba implementado y devolvia erroneamente solicitudes entrantes.
- **Correccion**: `/api/link-requests` ahora permite el estado pre-vinculo de forma acotada y valida los scopes `incoming`, `outgoing` y `academy`; `outgoing` filtra por `requestedByProfileId`. Al aceptar, el perfil sincroniza `activeAcademyId` y `tenantId` desde la solicitud, requisito de las guardas del portal limitado.
- **Seguridad**: no se amplio el acceso a datos de academia: la lectura entrante queda filtrada por `targetProfileId`, la respuesta sigue validando ese mismo perfil, y las operaciones de academia siguen comprobando membership/tenant.
- **Validacion**: `tests/link-requests-api.test.ts` PASS 2/2; ESLint focalizado PASS. E2E manual: parent creado, solicitud saliente localizada y la API incoming ya devuelve la solicitud pendiente; queda reejecutar la aceptacion con una solicitud nueva para observar el redirect posterior a esta correccion.
- **Deep link legacy reparado**: `/dashboard/messages/[conversationId]` verificaba participación pero renderizaba la bandeja sin seleccionar la conversación. Ahora redirige a `/dashboard/messages?c=...`, el contrato que el componente de mensajes usa para abrirla.
- **Chequeo adicional**: `link-requests-api` + `product-roles-navigation` PASS 10/10; ESLint focalizado PASS.
- **Mutación de conversaciones corregida**: `PATCH /api/messages/conversations/[id]` mezclaba preferencias privadas de participante con campos de la conversación. Ahora valida payload estricto, actualiza solo el título compartido cuando el participante es owner/admin y persiste silenciamiento/notificaciones únicamente en `conversation_participants` del usuario actual; el título queda acotado al tenant activo.
- **Regresión cubierta**: el test de aceptación de vínculo ahora exige que el perfil destino reciba tanto `activeAcademyId` como `tenantId` de la solicitud. `link-requests-api` PASS 2/2 tras añadir la aserción.
- **Cierre técnico de ronda**: `git diff --check` limpio; batería focalizada `link-requests-api`, `product-roles-navigation` y `communication-panels` PASS 13/13.

## 2026-07-10 - Verificacion E2E parcial de comunicacion por roles

- **Owner y coach**: sesiones E2E regeneradas con cuentas de prueba; Playwright CLI confirma que ambos cargan `/app/[academyId]/messages` autenticados y con la bandeja interna. El owner ve el acceso separado a `contact-messages`; el coach no lo recibe en la interfaz.
- **Centro unificado**: owner validado visualmente en `/comms`; sus tabs Mensajes, Anuncios y Notificaciones cargan sus estados vacios reales sin usar el formato legacy de API ni mostrar errores de aplicacion.
- **Limitacion de cobertura**: no hay cuentas/sesiones E2E `parent` ni `athlete`, ni una segunda academia de prueba para ejercer aislamiento cross-academy. Por ello no se pudo verificar en navegador el flujo bidireccional staff↔familia, lectura de notificacion ni rechazo cross-tenant. La guarda de rutas limitada y las pruebas unitarias permanecen cubiertas, pero el QA humano/fixture de esos roles sigue pendiente.
- **Entorno**: el primer intento en `next dev` encontro un manifiesto HMR corrupto de Next (`__webpack_modules__[moduleId] is not a function`), no un fallo funcional reproducible; tras reiniciar servidor y regenerar sesiones las rutas de owner/coach cargaron correctamente.

## 2026-07-10 - Mensajeria interna y notificaciones conectadas y endurecidas

- **Ruta canonica corregida**: `/app/[academyId]/messages` deja de mostrar consultas del directorio y conecta la bandeja de conversaciones internas para cualquier miembro de la academia, incluidos `parent` y `athlete`. Las consultas publicas se conservan en `/app/[academyId]/contact-messages`, limitada a owner/admin/super-admin.
- **Centro unificado reparado**: Mensajes, Anuncios y Notificaciones consumian el envelope legacy `success/data`; ahora usan el contrato real `{ ok, data: { items } }`, muestran errores reales y respetan los nombres camelCase de la API.
- **Notificaciones reparadas**: la API deja de convertir query params ausentes (`null`) en errores Zod/500; paginacion sin duplicar la primera pagina; deep links distinguen consulta publica de conversacion interna. Marcar como leida y eliminar exige `tenantId + userId`, cerrando mutacion horizontal por ID dentro del mismo tenant.
- **Mensajeria endurecida**: creacion/listado filtra por academia; emisor y destinatarios deben pertenecer al mismo tenant y academia; envio usa Zod y valida que la conversacion pertenezca al tenant activo. El shortcut P2P evita duplicados por metadata JSON parcial y genera deep link a la conversacion.
- **Pruebas**: `communication-panels` + `product-roles-navigation` PASS 11/11; `pnpm typecheck` PASS; ESLint focalizado PASS; `pnpm check:migrations` PASS. Suite completa: 387/391 PASS; cuatro fallos preexistentes y ajenos al modulo en `audit-hardening` (timeout/membership mock) y `api-sport-migration` (timeout/mock `logger.apiError`). `pnpm validate:rls` confirma 100% de cobertura, pero EXIT 1 por policies duplicadas de `audit_logs` en las migraciones sin commit `20260709000000/20260709010000` de otra sesion; no relacionado con comunicacion y no se modifico.
- **Migraciones**: ninguna nueva ni modificada; las tablas de comunicacion ya estaban materializadas por `20260703000001_create_missing_messaging_tables.sql` y migraciones previas. Pendiente humano: QA real con parent/coach; pendiente de producto: disparador de aviso desde clase/sesion.

## 2026-07-09 - Correcciones P1 Super Admin tras auditoria

- **Perfil operativo corregido**: el boton "Ver como usuario" pasa a "Abrir perfil operativo" y usa `/dashboard/view/[profileId]`; la vista de perfil obtiene el email Auth del usuario objetivo para no mezclarlo con el email del Super Admin conectado. En coach/athlete se corrigio tambien el filtro para cargar el registro ligado al usuario objetivo, no el primer registro de la academia.
- **Acciones sensibles endurecidas**: la tabla de usuarios ya no cambia roles al instante; cualquier cambio de rol abre confirmacion con rol origen/destino. Los labels de rol visibles pasan a espanol (`Dueño`, `Entrenador`, `Super admin`). Los campos de contrasena temporal en crear usuario/academia quedan ocultos por defecto con mostrar/ocultar.
- **Lifecycle de academia decidido**: borrar una academia desde Super Admin conserva la cuenta personal del dueño. El dialogo de borrado lo comunica y el audit metadata marca `ownerAccountRetained: true`.
- **Audit logs preparados**: `logAdminAction` ahora acepta `resourceType`, `resourceId`, `resourceName`, `description`, `status` y metadata mas legible. Se agrego la migracion `20260709000000_allow_global_audit_logs.sql` para permitir logs globales con `tenant_id IS NULL`; no se ejecuto `drizzle-kit push`.
- **Validacion**: `pnpm typecheck` PASS; ESLint focalizado PASS con warnings existentes; `tests/audit-hardening.test.ts` PASS 12/12; `tests/e2e-role-smoke.spec.ts --project=chromium --workers=1` PASS 10/10; Playwright autenticado verifico contrasenas ocultas, confirmacion de rol y perfil operativo con email objetivo. Riesgo nuevo: `/api/profile/preferences` devuelve 500 en QA y queda en backlog.

## 2026-07-09 - E2E autenticado estabilizado + roles Coach/Super Admin verificados

- **Full academy E2E estabilizado**: `tests/e2e-zaltyko-full.spec.ts` separa el smoke de rutas criticas por pagina, usa modo serial y evita el loop unico que agotaba el timeout de Next dev. Tambien endurece navegacion ante `ERR_CONNECTION_RESET`/`ERR_NETWORK_IO_SUSPENDED`, valida `#main-content` por ruta, navega al detalle de atleta por `href` y sube timeout en billing/settings/PWA.
- **A11y E2E estabilizado**: `tests/a11y-zaltyko.spec.ts` usa `domcontentloaded`, esperas acotadas y retry de axe solo cuando se destruye el contexto por navegacion durante compilacion. No oculta violaciones WCAG: la asercion sigue siendo `results.violations === []`.
- **Role smoke sin flakes**: `tests/e2e-role-smoke.spec.ts` separa superficies Super Admin y Owner por ruta y mantiene Coach con validacion de no acceso a cobros/ajustes admin. Resultado final: PASS 10/10 con `E2E_OWNER_STORAGE_STATE=.auth/user.json`, `E2E_COACH_STORAGE_STATE=.auth/coach.json` y `E2E_SUPER_ADMIN_STORAGE_STATE=.auth/super-admin.json`.
- **Validacion final**: `pnpm exec eslint tests/e2e-role-smoke.spec.ts tests/a11y-zaltyko.spec.ts tests/e2e-zaltyko-full.spec.ts --quiet` PASS; `pnpm exec tsc --noEmit` PASS; `playwright test tests/e2e-zaltyko-full.spec.ts tests/e2e-zaltyko-public.spec.ts tests/a11y-zaltyko.spec.ts --project=chromium --workers=1` PASS 30/30; `playwright test tests/e2e-role-smoke.spec.ts --project=chromium --workers=1` PASS 10/10.
- **Nota de entorno**: `pnpm audit:sprint3 -- --project=chromium --workers=1` no es fiable porque pnpm pasa un `--` literal y Playwright corre con workers/proyectos no esperados. Para auditoria local usar `pnpm exec playwright test ... --project=chromium --workers=1` directo. En corridas muy largas Next dev puede reiniciarse por memoria; reiniciar el servidor antes de role smoke deja la validacion limpia.

## 2026-07-09 - Auditoria Super Admin profunda con sesion real de prueba

- **Super Admin operativo base**: dashboard, usuarios, academias, academias publicas y logs cargan sin errores. APIs `/api/super-admin/metrics`, `/users`, `/academies` y `/logs` responden 200. Owner y Coach no ven `/super-admin/*`; son redirigidos a `/app`.
- **CRUD temporal validado y limpiado**: crear usuario temporal, validar password corto, borrar usuario, crear academia temporal con dueño, abrir detalle API y borrar academia pasan. Hallazgo: borrar la academia no borra/desvincula automaticamente el owner creado en el flujo "Crear academia + dueño"; se limpio manualmente el usuario temporal residual.
- **Hallazgos UX/copy/seguridad**: "Ver como usuario" muestra perfil objetivo pero conserva correo del Super Admin; roles y estados mezclan ingles/tecnico (`Owner`, `Coach`, `Active`); contraseñas temporales se muestran en campos de texto; tablas mobile funcionan pero son densas; logs muestran JSON crudo. Ademas, `logAdminAction` fallo al insertar acciones sensibles (`user.created`, `user.deleted` y similares) aunque la operacion principal si completo.
- **Rutas ocultas**: `/super-admin/billing` y `/super-admin/settings` siguen como placeholders y deben permanecer fuera del menu. `/super-admin/support` redirige a `/dashboard`, comportamiento confuso si alguien accede directo.
- **Evidencia**: `output/super-admin-audit/RESUMEN.md`, `report.json` y capturas en `output/super-admin-audit/`.

## 2026-07-08 - Storage states E2E por rol + auditoria autenticada

- **Storage states por rol regenerados**: `pnpm test:e2e:auth` ahora prepara usuarios E2E con Supabase service role y genera sesiones para owner, coach y super-admin en `.auth/user.json`, `.auth/coach.json` y `.auth/super-admin.json`.
- **Variables E2E documentadas**: `.env.example`, README y docs QA incluyen `E2E_OWNER_STORAGE_STATE`, `E2E_COACH_STORAGE_STATE` y `E2E_SUPER_ADMIN_STORAGE_STATE`, ademas de emails/passwords por rol.
- **Smoke por roles**: `tests/e2e-role-smoke.spec.ts --project=chromium` PASS 3/3. Super-admin accede a superficies core, owner abre modulos criticos y coach abre dashboard/classes/assessments sin contenido admin de cobros/ajustes.
- **Guardas reforzadas**: `billing/page.tsx` bloquea contenido de cobros para perfiles/memberships no admin/owner; `settings/page.tsx` redirige/null-render para no admin. La evidencia HTTP con coach devuelve shell/dashboard, no contenido de cobros.
- **E2E principal**: `tests/e2e-zaltyko-full.spec.ts --project=chromium --workers=1` PASS con 9 passed y 1 flaky que pasa en retry (`critical academy pages render without route-level errors`, navegacion interrumpida por redirect dashboard durante `/athletes`).
- **Public smoke**: `tests/e2e-zaltyko-public.spec.ts --project=chromium --workers=1` PASS 6/6 tras actualizar copy esperado de "Facturacion" a "Cobros" y navegar con `domcontentloaded`.
- **A11y pendiente**: `tests/a11y-zaltyko.spec.ts --project=chromium --workers=1` FAIL autenticado. Public landing PASS; login fue flaky y paso en retry; dashboard y athletes fallan por axe con `aria-progressbar-name`, contrastes insuficientes y selects sin nombre accesible. Queda como deuda de accesibilidad, no como bloqueo de storage states.
- **Limitacion de entorno**: Firefox/WebKit no estan instalados localmente; las corridas validas se ejecutaron en Chromium. Un intento via `pnpm test:e2e -- --project=chromium` se corto porque pnpm paso `--` como argumento y Playwright intento tambien Firefox/WebKit.

## 2026-07-08 - Fix scroll publico + Growth pricing v3.0

- **Scroll global corregido**: `src/app/globals.css` cambia `html, body { height: 100%; }` por `min-height: 100%`. El bug fijaba el `documentElement` a la altura del viewport y dejaba el contenido largo en `body`, impidiendo scroll real en las paginas publicas.
- **Growth alineado con pricing v3.0**: `src/lib/plans/catalog.ts` deja Growth (`code: pro`) en `academyLimit: 1`, cambia el resumen a "Hasta 200 gimnastas · 1 academia" y elimina "Academias ilimitadas" de sus features.
- **Network reformulado como multi-sede acompanado**: el catalogo y el error de limite de academias reemplazan la promesa de academias ilimitadas autoservicio por "Multi-sede con onboarding acompanado", coherente con [[Pricing]] y [[Mensajes aprobados]].
- **Guardrails actualizados**: `tests/product-go-live-readiness.test.ts` ahora falla si Starter o Growth vuelven a prometer academias ilimitadas. `tests/limits.test.ts` tambien se actualizo, aunque sigue excluido por `vitest.config.ts`.
- **Validacion**: `pnpm exec vitest run tests/product-go-live-readiness.test.ts` PASS, `pnpm typecheck` PASS. QA manual con Playwright en `http://127.0.0.1:3000`: `/`, `/pricing`, `/features` y `/marketplace` hacen scroll en desktop y mobile; `/pricing` muestra Growth con "1 academia" y ningun plan contiene "Academias ilimitadas".
- **E2E autenticado recuperado**: el usuario Auth E2E no existia. Se creo con service role, email confirmado y password local de `E2E_AUTH_PASSWORD`; se creo perfil owner/membership para `Aurora Elite Demo`, se corrigio `E2E_ACADEMY_ID` local al ID real de esa academia y se regenero `.auth/user.json`. Validacion: `pnpm test:e2e:verify-supabase` PASS, `pnpm test:e2e:auth` PASS (chromium/firefox/webkit) y `tests/e2e-role-smoke.spec.ts --project=chromium` PASS para owner. Coach y super-admin quedan saltados hasta configurar `E2E_COACH_STORAGE_STATE` y `E2E_SUPER_ADMIN_STORAGE_STATE`.

## 2026-07-08 - QA en vivo (login real, super-admin, panel academia) + 7 bugs corregidos

**Sesion de QA en vivo con credenciales reales** (`mentessaas@gmail.com`, cuenta super_admin dueña de "MentesSaas Academy" en produccion). Se recorrio login, super-admin (dashboard/usuarios/academias/academias publicas/logs) y el panel completo de academia (dashboard, gimnastas, entrenadores, grupos, eventos, evaluaciones, mensajes, anuncios, cobros, ajustes) en desktop y mobile.

**Bugs P1 (rompian siempre, no intermitentes) encontrados y corregidos**:

- **`/api/dashboard/kpi-trends` devolvia 500 siempre**: `extractAcademyId()` en `src/lib/authz/endpoint-config.ts` tiene un regex `^\/api\/dashboard\/([^/]+)` pensado para rutas dinamicas `/api/dashboard/[academyId]/...`, pero tambien matcheaba la ruta estatica `/api/dashboard/kpi-trends` (que pasa `academyId` por query string) y devolvia el string literal `"kpi-trends"` como si fuera el academyId, rompiendo la query SQL (`academies.id = 'kpi-trends'`). Fix: revisar el query param `academyId` **antes** que el regex de pathname. Rompia el sparkline de tendencias del dashboard de academia.
- **`/api/contact-messages` devolvia 500 siempre**: mismo patron ya documentado en este changelog (ver settings, 2026-07-07) — `URLSearchParams.get()` devuelve `null` (no `undefined`) cuando falta un query param, y el schema Zod usaba `.optional()` (solo cubre `undefined`) en vez de `.nullable().optional()`. Rompia la carga de "Mensajes" en el panel de academia.
- **`/super-admin/users/[profileId]` (detalle de usuario) rompia siempre con "Error del Sistema"**: la Server Component hace un `fetch()` interno a su propia API (`/api/super-admin/users/[profileId]`, protegida con `withSuperAdmin`) pero no reenviaba las cookies de sesion (`headers: {}` vacio) — un `fetch()` server-side en Next.js **no hereda cookies automaticamente** aunque sea al mismo origen. La API respondia 401/403, `response.ok` era falso, y la pagina lanzaba `throw new Error("Failed to fetch user details")`. Fix: `headers: { cookie: cookieStore.getAll().map(c => \`${c.name}=${c.value}\`).join("; ") } }`. Comparar con el patron correcto ya usado en `academies/[academyId]/page.tsx`, que evita el self-fetch por completo llamando directo a una funcion de datos (`getSuperAdminAcademyDetail`) — mas robusto a largo plazo si se vuelve a tocar esta pagina.
- **Mismo detalle de usuario, segundo bug en cascada tras arreglar el primero**: `TypeError: Cannot read properties of undefined (reading 'length')` en `user.memberships.length`. Causa: la API envuelve la respuesta en `{ok, data}` (convencion `apiSuccess()`, ver nota en Security de este mismo repo) pero `page.tsx` hacia `const userData = await response.json()` sin desestructurar `{ data }`, pasando el objeto `{ok, data}` completo como si fuera el usuario. Mismo patron **repetido 4 veces mas** dentro de `SuperAdminUserDetail.tsx` (refresh tras activar acceso, guardar cambios, y dos acciones mas) — las 5 instancias corregidas con `const { data: refreshed } = await refreshResponse.json()`.
- **Busqueda/filtro roto en 3 tablas de super-admin** (usuarios, academias, logs): mismo patron de `{data}` sin desestructurar en `SuperAdminUsersTable.tsx`, `SuperAdminAcademiesTable.tsx` y `SuperAdminLogsTable.tsx` — el listado inicial (server-rendered) se veia bien, pero cualquier refetch client-side (filtro, busqueda, boton "Actualizar") devolvia lista vacia silenciosamente (`payload.items` era `undefined`, `?? []` lo enmascaraba sin error visible). Corregidas las 3.

Este patron (`{ok, data}` sin desestructurar) ya se habia documentado y corregido antes para el detalle de academia (2026-07-07) y para `useDashboardData` — son **7 recurrencias mas** del mismo error en el panel de usuarios. Vale la pena, en otra sesion, revisar si conviene un helper compartido tipo `apiFetch<T>()` que desestructure `{data}` automaticamente para evitar que siga repitiendose.

**P3 (cosmeticos, corregidos)**:

- `src/components/login-form/LoginForm.tsx` era codigo muerto (nunca se importaba, no habia `index.ts` en esa carpeta; el login real usa `src/components/login-form.tsx`) — eliminado.
- Textos sin traducir: "Active" → "Activo" en `PlanUsage.tsx` (dashboard, viene de `plan.status` de Stripe sin mapear); "/ month" → "/ mes" en `BillingPanel.tsx` (viene de `price.recurring.interval` de Stripe sin mapear, dos usos). Ambos con un mapa de traduccion local, no una libreria i18n nueva.

**Pendiente sin tocar (autorizacion insuficiente / guardado por diseño)**:

- Nombre de perfil "MenetesSaas" → "MentesSaaS": es un typo real en el dato, pero el propio formulario de edicion de usuario **bloquea intencionalmente** editar perfiles con `role === "super_admin"` (`disabled={... || user.role === "super_admin"}` en `SuperAdminUserDetail.tsx`). No se forzo saltandose esa guarda vía API directa.

**Hallazgo descartado (falso positivo)**:

- ~~Filas de la tabla `/super-admin/academies` sin accion al click~~ — si navegan bien a `/super-admin/academies/[id]` via `router.push`; el test inicial verifico la URL antes de que la navegacion async terminara (mismo timing gotcha que el submit de login mas abajo).

**Validacion**: `pnpm typecheck` PASS, `pnpm lint` PASS, `pnpm build` PASS, `pnpm exec vitest run` 388/388 PASS. Los 3 bugs de fetch (`kpi-trends`, `contact-messages`, `users/[profileId]`) y el de `.data` en cascada se verificaron en el navegador real, no solo por tipos — antes/despues en cada uno.

**Nota de entorno**: en `next dev` (no en build de produccion) navegar rapido entre rutas puede mostrar el CSS sin cargar (`document.styleSheets.length === 0`) por como Next 15 versiona el CSS por timestamp en cada request en modo dev. Verificado que **no reproduce en produccion** (`next build && next start`, CSS con hash de contenido, 200 OK). Es ruido de tooling, no bug de producto.

## 2026-07-07 - Refactor tecnico inicial + tooling pnpm/auditor API

- **Hardening demo/refactor senior**: creados `docs/REFACTOR_AUDIT.md`, `docs/FUNCTIONAL_AUDIT.md`, `docs/REFACTOR_PLAN.md`, `docs/QA_CHECKLIST.md`, `docs/DEMO_READY_CHECKLIST.md` y `docs/REFACTOR_REPORT.md` con auditoria por stack, roles, riesgos, plan y validacion.
- **Super admin sin metricas inventadas**: retirados fallback de meses 2025, tendencias fijas, revenue estimado con multiplicador y comparativa basada en planes/promedios. Cuando falta fuente real, la UI queda en estado vacio.
- **Posicionamiento no fiscal**: copy visible de cobros/billing/settings ajustado a cobros, cuotas, recibos internos y suscripcion. No se agrego VeriFactu, AEAT, firma fiscal ni logica de facturacion oficial.
- **QA autenticado pendiente**: Playwright ya no falla por worktrees, pero `.auth/user.json` actual redirige a `/auth/login`; regenerar storage state antes de demo comercial.
- **Validacion del bloque demo/refactor**: `pnpm typecheck` PASS, `pnpm lint` PASS, `pnpm exec vitest run` PASS (37 archivos, 354 tests), `pnpm build` PASS.

- **Tooling pnpm modernizado**: `pnpm.overrides` sale de `package.json` y pasa a `pnpm-workspace.yaml`, compatible con pnpm 11. Se declara `allowBuilds`/`onlyBuiltDependencies` para builds nativos aprobados y se agrega `confirmModulesPurge=false` en `.npmrc` para instalaciones no interactivas.
- **Lockfile reproducible**: la entrada del tarball oficial `xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` ahora incluye `integrity` sha512. `CI=true pnpm install --frozen-lockfile` vuelve a pasar.
- **Auditor API actualizado**: `scripts/audit-api-routes.ts` deja de buscar `proxy.ts` y detecta rate limit global desde `middleware.ts`. Tambien reconoce auth bearer por helpers actuales. Resultado: 265 rutas, 174 mutantes, 0 riesgos sin clasificar.
- **Refactor EventForm**: extraida logica pura a `src/components/events/event-form-model.ts` (schema Zod, defaults, initialData legacy y payload API) y UI a `src/components/events/EventFormSections.tsx`. `EventForm.tsx` queda como coordinador de react-hook-form/envio (227 lineas).
- **Refactor clases**: extraidas reglas puras de actualizacion a `src/lib/classes/update-class-helpers.ts` (grupos candidatos, sportConfig efectivo, aparatos, weekdays y horario final). La ruta `src/app/api/classes/[classId]/route.ts` conserva comportamiento y delega esas decisiones.
- **Refactor DashboardPage**: extraido fetch de checklist a `src/components/dashboard/useDashboardChecklist.ts` y secciones visuales a `src/components/dashboard/DashboardSections.tsx` (hero, distribucion deportiva, starter setup, navegacion rapida, onboarding y actividad reciente). `DashboardPage.tsx` baja a 631 lineas.
- **Refactor settings**: extraido modelo de configuracion de academia a `src/components/settings/academy-settings-model.ts` (tipos, defaults, normalizacion del payload API y editores deportivos activos). `settings/page.tsx` baja a 742 lineas.
- **Refactor AthletesTableView**: extraidas secciones visuales a `src/components/athletes/AthletesTableSections.tsx` (toolbar, empty state, tabla y paginacion). `AthletesTableView.tsx` queda como coordinador de estado, filtros, export CSV y dialogos (444 lineas).
- **Refactor EditClassDialog**: extraidos tipos/helpers a `src/components/classes/edit-class-dialog-model.ts` y secciones visuales a `src/components/classes/EditClassDialogSections.tsx`. `EditClassDialog.tsx` queda centrado en estado, compatibilidad por rama, submit y delete (426 lineas).
- **Tests nuevos**: `tests/event-form-model.test.ts` y `tests/lib/update-class-helpers.test.ts` cubren la logica extraida.
- **Validacion**: `tsc --noEmit` OK, `eslint ... --quiet` OK, `vitest run --passWithNoTests` 354/354 PASS, `audit-api-routes --strict` PASS, `next build` OK (201 paginas estaticas generadas).

## 2026-07-07 - Sesion super-admin CRUD + fixes de settings/env (5 PRs mergeados a main)

> Trabajo en paralelo al "Refactor tecnico inicial" de mas arriba (misma fecha, working tree compartido). Esta sesion trabajo sobre `main` con PRs propios: #15 (QA batch), #16 (CRUD), #17/#18 (campos de edicion academia + fix de refresh), #19 (fix 400 settings + env client-side). No toca los ~100 archivos del refactor senior (siguen sin commitear en el working tree al cierre de esta sesion).

**Auditoria de roles externa (Codex) verificada y remediada (PR #15, commit `8b60420`)**:

- Verificadas contra prod las cifras de una auditoria externa sobre permisos/roles: 41 `auth.users`, 45 `profiles`, 36 con rol global `owner`, 11 con `@zaltyko.local`, 3 con tenant mismatch — todas exactas.
- Causa raiz real: `src/lib/authz/permissions-service.ts` otorgaba `getAllPermissions()` a **cualquier** perfil con rol global `owner` (default de signup de todos) sobre **cualquier** academia, sin verificar `ownerId`. Escalada de permisos cross-tenant real, no teorica.
- El script de remediacion propuesto por la auditoria externa tenia un bug critico: incluia `DROP TRIGGER on_auth_user_created`, lo que habria roto el signup real (el registro depende 100% de ese trigger para crear el perfil; `register-form.tsx` no lo hace en codigo). Se descarto ese paso.
- Fix aplicado: `permissions-service.ts` ahora verifica `academies.ownerId === profile.id` o una membership `owner` explicita antes de otorgar permisos completos. Ver [[Registro de riesgos]].
- Purga de datos de test en produccion (transaccional, confirmada con el usuario via pregunta explicita por ser irreversible): 7 academias + 43 perfiles + 39 cuentas Auth de test eliminadas. Quedan solo 2 cuentas reales (super_admin + owner) y la academia real, sin huerfanos. Script `scripts/purge-test-data.ts` usado una vez y eliminado del repo (peligroso si se re-ejecuta).
- Fixes QA adicionales en el mismo lote: crash de `GymMetricsWidget` (props sin default en `reduce`), crash de detalle de academia super-admin (self-fetch sin cookies -> 401 -> throw, reemplazado por consulta directa a DB via `getSuperAdminAcademyDetail`), metricas de engagement fabricadas puestas a 0 con nota explicativa, hydration error #418 (quitar `Math.random()` de `revenueChartData`), validacion de fecha de nacimiento en `CreateAthleteDialog`, redirect de `/app/[academyId]` (antes 404), `/app` resolviendo la academia real via fetch en vez de depender de `useDevSession` (deshabilitada en prod), `verifyAcademyAccess` con bypass para `super_admin`, ocultados enlaces rotos/placeholder (Facturacion/Soporte/Configuracion) del sidebar y top-nav de super-admin, confirmacion antes de promover a `super_admin`.

**CRUD completo de super-admin (PR #16, commit `fda96e1`)**:

- A peticion explicita del usuario ("el super admin deberia poder crear/editar/modificar academias y usuarios... todo desde el panel"), alcance elegido: **todo**.
- Nuevo: crear academia + cuenta de dueño en un paso (`SuperAdminCreateAcademyDialog.tsx` -> `POST /api/super-admin/academies`), crear usuario con cualquier rol (`SuperAdminCreateUserDialog.tsx` -> `POST /api/super-admin/users`), eliminar usuario (`DELETE /api/super-admin/users/[profileId]`).
- Nuevas funciones en `src/lib/supabase/admin-operations.ts`: `createAuthUser`/`deleteAuthUser` (via `supabase.auth.admin`).
- Guardas: no auto-eliminacion, no eliminar el ultimo `super_admin`, confirmacion antes de borrar.

**Fix: campos de edicion de academia incompletos + bug de refresh tras guardar (PR #17/#18, commits `5163782`/`3906285`)**:

- El PATCH de edicion de academia ya aceptaba `academyType`/`country`/`region`/`city` pero el formulario del detalle solo exponia nombre y plan. Se agregaron los campos faltantes al formulario.
- Al verificar el fix en produccion contra la academia real (MentesSaas Academy), el guardado mostro "Sin nombre"/"Sin plan" tras guardar. **Investigado antes de asumir corrupcion**: se verifico directo contra la DB de prod (solo lectura) y los datos estaban intactos — era un bug de UI preexistente: `apiSuccess()` envuelve las respuestas en `{ok, data}` pero el componente usaba la respuesta cruda sin desempaquetar `.data`. Afectaba tambien al boton Suspender/Reactivar. Corregido en ambos flujos. El dato de prueba usado durante la verificacion se revirtio en DB tras confirmar el fix.

**Fix: 400 en Ajustes de la academia + validacion de env corriendo en el navegador (PR #19, commit `8c59c3d`)**:

- Reportado por el usuario: `PATCH /api/academies/[academyId]/settings` devolvia 400 en cada guardado desde `/app/[academyId]/settings`.
- Reproducido en vivo interceptando `window.fetch` en la consola del navegador: el formulario cliente envia `null` (no `undefined`) en `publicDescription` y en todos los campos de `contact` (website, email, telefono, direccion, redes) cuando estan vacios. El schema Zod del servidor solo declaraba `.optional()`, que NO acepta `null`. Se agrego `.nullable()` a esos campos; el codigo que mapea a la actualizacion ya trataba `null` correctamente (`data.x || null`), solo faltaba pasar la validacion.
- Bonus detectado en el mismo debug: el usuario reporto en consola `[env] Variables criticas no configuradas en produccion: STRIPE_SECRET_KEY, DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY` — pero corriendo en el **navegador**, no en el servidor. Causa: `src/lib/logger.ts` importa `isProduction()` de `src/lib/env.ts`, y `logger.ts` se usa desde `src/app/error.tsx` (`"use client"`), asi que `env.ts` completo (incluida la validacion Zod server-only) se bundlea y ejecuta tambien en el cliente. No hay fuga real de secretos (Next.js no inyecta esas variables al bundle del cliente), pero es codigo de servidor corriendo donde no deberia y logueaba un falso positivo. Fix: `serverEnv` ahora solo corre `validateServerEnv()` cuando `typeof window === "undefined"`; en cliente usa un stub con solo `NODE_ENV` (que si es seguro, Next.js lo inlinea).
- **Patron a vigilar**: cualquier modulo server-only importado transitivamente por un componente cliente (via `error.tsx`, `global-error.tsx`, o cualquier archivo `"use client"`) puede terminar en el bundle del navegador. Guardar logica que dependa de variables server-only con `typeof window === "undefined"`.

**Validacion**: `pnpm typecheck` limpio en cada PR. Deploy Vercel verificado Ready para cada uno; fix de settings verificado localmente contra el payload real capturado del navegador (`SettingsSchema.safeParse` pasa).

## 2026-06-26 - Upgrades de dependencias (VALIDADO Y COMMITEADO)

> **Estado: validado y commiteado** en `security/audit-remediation`. Validacion: `pnpm typecheck` limpio, `pnpm exec vitest run` 346/346 PASS, `pnpm build` exitoso. El riesgo de `jspdf` 2→4 quedo acotado: el codigo ya usaba la API funcional `autoTable(doc, {...})` (compatible con v4) en `AssessmentPDFExport`, `receipt-generator` y `reports/pdf-generator`. `xlsx` por tarball oficial sin romper export.

**Bumps de seguridad (pnpm overrides añadidos)**: `ws ^8.21.0`, `path-to-regexp ^8.4.0`, `protobufjs ^7.5.6`, `lodash ^4.18.1`, `immutable ^3.8.3`, `form-data ^4.0.6`. Cierran advisories transitivos.

**Bumps de versiones directas**:

- `next` 15.5.15 → 15.5.19 (+ `eslint-config-next`/`@next/eslint-plugin-next` alineados a 15.5.19).
- `@modelcontextprotocol/sdk` 1.22 → 1.29 y `mcp-handler` 1.0.4 → 1.1.0 (capacidades MCP de agentes).
- `drizzle-orm` 0.44.7 → 0.45.2.
- `jspdf` 2.5.2 → 4.2.1 (+ `jspdf-autotable` 5.0.7 → 5.0.8) — **cambio mayor**, revisar reportes/export PDF (attendance, financial).
- `xlsx` 0.18.5 → tarball oficial `cdn.sheetjs.com/xlsx-0.20.3` (la distribucion npm dejo de actualizarse; el oficial trae fixes de seguridad).
- `axios` 1.15 → 1.18.1, `form-data` 1.0.1 → 1.0.6.

**Riesgo**: `jspdf` 2→4 y `xlsx` por URL pueden romper export de reportes; correr `pnpm test` + smoke de export antes de mergear. Registrado en [[Backlog priorizado]] (P1) y [[Registro de riesgos]].

## 2026-06-26 - Fix CI + root routing 404 (commit `406c498`)

Cierre de 4 fallos de CI y del 404 en la raiz del sitio, sobre `security/audit-remediation`:

- **`pnpm check:migrations` FAIL → drizzle versionado**: el directorio `drizzle/` estaba en `.gitignore`. Se commitea (3 migraciones + meta journal) para que la verificacion de integridad pase en CI.
- **`pnpm validate:rls` FAIL → RLS sport_configs**: nueva migracion `drizzle/20260626000000_rls_sport_configs.sql` habilita RLS en `academy_sport_configs`, `athlete_sport_configs` y `coach_sport_configs` (3 tablas que faltaban). Cobertura **100% sobre 62 tablas tenant-scoped**.
- **Smoke tests FAIL → PATH**: el job pasa a invocar `pnpm exec tsx` (en vez de `tsx` directo) para resolver el binario en el runner de CI.
- **Root routing 404 → redirect**: `middleware.ts` redirige `/` a `/${locale}/gimnasia-artistica` (primera modalidad del catalogo). Cierra el 404 de la raiz. **Decision arquitectonica** registrada en [[Decisiones#2026-06-26 - Routing raiz redirige a primera modalidad]].

## 2026-06-26 - Auditoria tecnica completa de seguridad y calidad (PR #8, commit `cf092ef`)

> El trabajo de auditoria (Bloques 1-4) se mergeo a `security/audit-remediation` via **PR #8 (`cf092ef`)**. El detalle por items 1.x–4.x sigue siendo correcto.

**Bloque auditoria (PR #8 `cf092ef`)**:

- **[1.1]** `src/app/api/academies/[academyId]/settings/route.ts:462` ya no expone `stripeSecretKey` en GET; devuelve `stripeSecretKeyConfigured: !!academy.stripeSecretKey` (boolean). Cierra vector MITM/DevTools.
- **[1.2]** PATCH /settings valida string vacio antes de sobreescribir clave Stripe; columna sigue plano (sin libsodium) — pendiente como deuda tecnica en Backlog.
- **[1.3]** `idempotencyKey` aplicado a `stripe.customers.create()` (`customer_${userId}`) y `stripe.checkout.sessions.create()` (`checkout_${user}_${plan}_${ts}`) en checkout-service y checkout route. Evita pagos duplicados por timeout.
- **[1.4]** Race condition en customer creation resuelto con `onConflictDoUpdate` sobre `subscriptions.userId` + re-lectura del customerId post-upsert. Patron atomico correcto.
- **[1.5]** Cron `daily-alerts` ya no hace N+1: una sola query con `inArray(profiles.tenantId, tenantIds)` + `inArray(role, [...])` agrupa por tenantId en Map antes de iterar.
- **[2.1]** Exposicion de `error.message` en API responses: bajada de 30+ a 11 ocurrencias residuales. `api-error-handler.ts` ya no filtra stack ni message al cliente; usa `instanceof Error` + mensajes genericos.
- **[2.2]** `withTenant` en `authz.ts`: solo `super_admin` puede operar sin tenantId; `admin` ahora lo requiere obligatoriamente. Pendiente endurecer con `verifyAcademyBelongsToTenant(academyId, tenantId)` (funcion existe en `permissions.ts` pero no se aplica en `withTenant`).
- **[2.4]** Stack trace eliminado de `api-error-handler.ts`. Detras de flag `ENABLE_DETAILED_ERRORS` si se quiere re-habilitar en dev.
- **[3.3]** `React.memo` aplicado a los 4 componentes criticos: `AthletesTableView`, `BillingPanel`, `EventForm`, `EditClassDialog`. Total de componentes memoizados: 17 -> 21.
- **[3.5]** `loading.tsx` skeletons: 2 -> 23 archivos (40% cobertura de 57 rutas en `app/[academyId]`). Pendiente cubrir las 34 restantes en sprint dedicado.
- **[3.6]** `any` en TypeScript: 357 -> 227 ocurrencias (-36%). Patron `catch (error: unknown)` + `instanceof Error` aplicado a 73+41 archivos. Quedan 227, mayoritariamente tipos de librerias externas.
- **[4.4]** Stripe client: `timeout: 10000` (10s) en `new Stripe(secretKey, ...)`. Evita requests colgados indefinidamente en `billing/sync`.
- **[4.2]** `src/lib/env.ts` ahora emite warning explicito en produccion si faltan `STRIPE_SECRET_KEY`, `DATABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY`. Sigue siendo `.optional()` en el schema Zod para no romper dev local.
- **[7ace38c]** Catch blocks de 500s en `authz.ts`, lemonsqueezy webhook, mailgun, generate-sessions: `error.message` eliminado del cliente. `LimitError instanceof` check en academies/athletes/groups. `WEEKDAY_OPTIONS` centralizado en `lib/classes/constants.ts` (2 componentes deduplicados). 14 `loading.tsx` adicionales en rutas audit-logs, assessments, messages, evaluations, licenses, my-events, comms, my-dashboard, coach, dashboard, support, notifications, whatsapp, reports.

**Puntos abiertos de la auditoria** (documentados en [[Backlog priorizado]]):

- [1.2] Encriptacion de claves Stripe en BD con libsodium (deuda tecnica).
- [2.2] `verifyAcademyBelongsToTenant` aplicado en `withTenant` para todos los roles.
- [2.3] Cross-check `invoice.customer === subscription.stripeCustomerId` en `billing/sync`.
- [2.5] Rate limit por tenantId en middleware (actualmente solo por IP).
- [2.6] Indice `(userId, academyId)` en memberships.
- [3.1/3.2] Refactor de `DashboardPage` (983 lineas), `EventForm` (862), `AthletesTableView` (772), `EditClassDialog` (767).
- [3.7] Constantes `WEEKDAY_OPTIONS`/`LEVEL_OPTIONS`/`RELATIONSHIP_OPTIONS` aun no en `i18n/es.json`/`en.json`.
- [3.8] Accesibilidad: aria-label/aria-hidden (76 referencias actuales, objetivo >200).
- [4.1] Migracion planificada para eliminar columna `athletes.groupId` (deprecated, 15+ usos activos).
- [4.3] Tests edge en webhooks (duplicados, metadata malformada, timeout).
- [4.5] Cron auth con verificacion de IP Vercel ademas de Bearer token.

**Validacion**: typecheck no ejecutado en este lote. Recomendado correr `pnpm typecheck && pnpm build` antes de mergear.

## 2026-06-24 - Consolidacion del vault (cierre de coherencia critica)

> **Retrospectiva 2026-06-26**: este commit (`06a71dd chore: cerrar coherencia critica de Zaltyko`) consolido 17 notas con fecha en sus versiones canonicas. No se documento en su momento. Se documenta aqui para trazabilidad.

**Notas eliminadas (17)**:

| Borrada                                                                        | Reemplazo canonico                                               | Info critica preservada                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `vault/00-Inicio/Guia de trabajo para agentes.md`                              | `Workflow diario de la vault.md` + `Estado actual` + `AGENTS.md` | Si — reglas migradas                                                                                                |
| `vault/01-Producto/MVP exacto Zaltyko gimnasia.md`                             | `Inventario de producto.md`                                      | Si — consolidado                                                                                                    |
| `vault/01-Producto/Tarea - Sprint 0 decision v3.0.md`                          | `Inventario` + `Roadmap maestro` + `Pricing`                     | Parcial — los 6 bloques de implementacion especificos ya fueron ejecutados en `06a71dd`                             |
| `vault/01-Producto/Tarea - Onboarding y parent experience.md`                  | `Roadmap maestro` §Fase 3                                        | Parcial — referencia                                                                                                |
| `vault/01-Producto/Tarea - Skill tracking y make-up tokens MVP.md`             | `Roadmap maestro` + `Inventario`                                 | Parcial — referencia                                                                                                |
| `vault/03-Negocio/Tarea - Marketplace Zaltyko y multi-idioma.md`               | `Inventario` + `Roadmap` §Fase 4                                 | Parcial                                                                                                             |
| `vault/03-Negocio/Tarea - Pricing escalonado y plan gratis.md`                 | `Pricing.md` (v3.0) + `Decisiones.md`                            | Si — decision registrada                                                                                            |
| `vault/04-Marketing/Estrategia competitiva gimnasia.md`                        | `Competidores.md` + `Mensajes aprobados`                         | Si — absorbida                                                                                                      |
| `vault/04-Marketing/Matriz competitiva gimnasia.md`                            | `Competidores.md` (crecio 17 -> 434 lineas)                      | Si — absorbida                                                                                                      |
| `vault/05-Ventas-y-CS/Guia entrevistas academias gimnasia.md`                  | **Ninguno**                                                      | **NO — restaurada 2026-06-26** (preguntas + criterios de cierre no aparecen en Playbook demo ni Onboarding cliente) |
| `vault/06-Roadmap-y-Tareas/Cierre operativo pendientes agente - 2026-06-24.md` | `Roadmap maestro` + `Decisiones`                                 | Parcial — bloques de coherencia (pricing+portal, identidad+migraciones, legacy dashboard) perdidos como referencia  |
| `vault/06-Roadmap-y-Tareas/Plan operativo gimnasia.md`                         | `Roadmap maestro`                                                | Parcial                                                                                                             |
| `vault/07-Auditorias-y-Riesgos/Auditoria MVP gimnasia - 2026-06-23.md`         | `Auditorias consolidadas` + `Auditoria de producto real`         | Si — consolidada                                                                                                    |
| `vault/07-Auditorias-y-Riesgos/Auditoria copy publico - 2026-06-22.md`         | `Auditorias consolidadas` + `Mensajes aprobados`                 | Si — consolidada                                                                                                    |
| `vault/07-Auditorias-y-Riesgos/Auditoria de la vault - 2026-06-22.md`          | (obsoleta — vault reorganizada)                                  | Si — cerrada                                                                                                        |
| `vault/07-Auditorias-y-Riesgos/QA - Flujos P1 - 2026-06-22.md`                 | `QA - Flujos P1.md`                                              | Si — consolidada                                                                                                    |
| `vault/07-Auditorias-y-Riesgos/QA - Go Live SaaS - 2026-06-22.md`              | `Produccion y go-live.md`                                        | Si — consolidada                                                                                                    |

**Regla operativa violada y remediada**: AGENTS.md exige registrar todo cambio relevante (incluyendo consolidaciones) en `Decisiones.md` y `Changelog interno.md`. Esto se hizo recien el 2026-06-26 al auditar la rama `claude/hungry-shaw-f623bb`.

**Restauracion**: `Guia entrevistas academias gimnasia.md` restaurada el 2026-06-26 porque su contenido de discovery (perfil objetivo, 18 preguntas, criterios de cierre de 10 entrevistas) no aparece en `Playbook de demo.md` ni `Onboarding de cliente.md`. Quedan en [[Backlog priorizado]] los cruces pendientes con [[Buyer personas]] y [[Objeciones y respuestas]].

## 2026-06-24 - Sprint 7 Form refactor + i18n + Deuda tecnica

- **Sprint 7A.2 RHF+Zod en CreateClassDialog** (`src/components/classes/CreateClassDialog.tsx`): zod schema con `weekdays[]`/`apparatus[]`, useForm + zodResolver, Controller para Switch, defaultValues separados, errores per-field con role=alert, min-h-11 en botones. **Leccion**: usar `z.input<>` y `?? []` en watch; `.default([])` rompe el Resolver types de RHF (lesson aprendida en 7A.1 tambien).
- **Sprint 7A.3 RHF+Zod en EventForm** (`src/components/events/EventForm.tsx`): schema para 25+ campos (titulo, fechas, location, contactos, capacidades, notificaciones), Controller para LocationSelect/FileUpload/Switch, valueAsNumber para numeros, manejo custom de `competitionTypeCode` vs `eventType` segun sportConfig seleccionado, reset cuando cambia evento externo.
- **Sprint 7A.4 OnboardingChecklist**: evaluado y descartado para RHF. Es un widget sin form submission, el `useState` + fetch es el patron correcto. Documentado en [[Backlog priorizado]].
- **Sprint 7B.1 i18n en DashboardPage** (`src/components/dashboard/DashboardPage.tsx`): 3 KPIs localizadas (kpiCoaches, kpiGroups, kpiAttendance) consumiendo `useTranslation` + `locale`. 962 lineas sin tocar logica de negocio.
- **Sprint 7B.2 i18n en AthletesTableView** (`src/components/athletes/AthletesTableView.tsx`): 3 keys (`search`, `cancel`, `delete`) aplicadas a placeholder, option de menu y boton.
- **Sprint 7B.3 i18n en BillingPanel** (`src/components/billing/BillingPanel.tsx`): `getInvoiceStatusInfo` ahora recibe `locale` y traduce 6 estados (paid/pending/overdue/cancelled/draft/trialing).
- **Validacion**: `node_modules/.bin/tsc --noEmit --skipLibCheck` pasa limpio en los 5 archivos. ESLint solo reporta warnings pre-existentes. **5 commits nuevos** (bf8a937, c834473, 6ff8636, 8f72b9f, d9d3dbc) sobre main, sin regresiones.
- **Pendiente Sprint 7C/D**: setup Supabase local CLI (requiere Docker, no automatizable en este entorno sin decision); documentar y ejecutar decision `/dashboard` legacy redirects. Cerrar en sesion separada.

## 2026-06-23 - Sprint 0 (Quick Wins) ejecutado

- **Sitemap con fallback**: `next-sitemap.config.js` ahora usa `NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` para evitar URLs `undefined` si la variable no esta definida al ejecutar `pnpm sitemap`.
- **Contraste WCAG AA**: `text-light` en `tailwind.config.ts` cambia de `#94A3B8` (2.5:1 sobre blanco, falla AA) a `#64748B` (4.6:1, pasa AA). Aplica a 17 usos en billing components.
- **PWA theme_color alineado**: `public/manifest.json` `theme_color` pasa de `#0D47A1` (azul) a `#0F172A` (navy brand). Coherente con `layout.tsx:120` y `viewport.themeColor`.
- **Toggle anual claramente no comprable**: `src/app/(site)/pricing.tsx` invierte el toggle: "Mensual" se muestra activo (`aria-pressed="true"`) y "Anual" se muestra deshabilitado (`aria-disabled="true"`, `cursor-not-allowed`, `title` explicativo). Hasta que exista `stripePriceId` anual real en DB/Stripe, no se puede seleccionar.
- **Mailgun timing-safe**: `src/app/api/mailgun/route.ts` ahora compara firmas con `crypto.timingSafeEqual` sobre `Buffer.from(hash, "hex")` en vez de `hash !== signature`. Cierra vector de timing attack.
- **Validacion**: `pnpm typecheck` y `pnpm lint` pasan limpios. Sin regresiones en typecheck ni en eslint rules de la app.
- **Cierre de 4 quick wins + 1 accesibilidad** del plan maestro. Sin cambios de precio ni limites reales. Próximo: Sprint 1 (Seguridad CRITICAL).

## 2026-06-23 - Sprint 1 (Seguridad CRITICAL) ejecutado

- **C1 RLS `academy_link_requests`**: nueva migracion `supabase/migrations/20260624000000_rls_academy_link_requests.sql` con `ENABLE ROW LEVEL SECURITY` + 2 policies (`tenant_or_target_access` y `target_response`). Grant a `authenticated` y `service_role`. `pnpm validate:rls` ahora reporta **100% cobertura sobre 63 tablas tenant-scoped**.
- **C2 Middleware consolidado**: `proxy.ts` eliminado y su logica migrada a `middleware.ts`. El nuevo matcher cubre todas las rutas excepto static/favicon. Rate-limit global API mutante ahora se ejecuta fiablemente (antes dependia de `proxy.ts` que no es convencion Next.js estandar). Tambien rate-limita `/app/*` y `/super-admin/*`.
- **C3 JWT firma HMAC**: `middleware.ts` ahora verifica la firma HS256 del access token contra `SUPABASE_JWT_SECRET` con `crypto.timingSafeEqual` antes de validar `app_metadata.role`. Cierra el vector de aceptar tokens con firma invalida o manipulada en `/super-admin/*`. Fail-closed: si la env var falta, rechaza el acceso.
- **H4 ESLint en build**: `next.config.mjs` `eslint.ignoreDuringBuilds` pasa de `true` a `false`. Builds fallan si hay errores de lint.
- **T4 Smoke-test en CI**: job `smoke-test` descomentado y configurado en `.github/workflows/ci.yml`. Ejecuta `pnpm exec playwright install --with-deps chromium` + `tsx smoke-test.ts` contra `https://zaltyko.vercel.app`. Solo corre en `push` a `main` (no en PRs).
- **T5 Validate RLS en CI**: nuevo job `validate-rls` en `.github/workflows/ci.yml` que ejecuta `pnpm validate:rls` en cada push/PR. Falla el CI si la cobertura RLS baja del 100%.
- **Limpieza `package.json`**: scripts `lint:app` y `lint:fix` ya no referencian `proxy.ts` (eliminado).
- **Validacion**: `pnpm typecheck`, `pnpm lint` y `pnpm validate:rls` pasan limpios. Cierre de 6 issues CRITICAL/HIGH pre-produccion. Sin cambios funcionales visibles al usuario fuera del toggle anual. Próximo: Sprint 2 (Base de Datos).

## 2026-06-24 - Fix Vercel deploy: ESLint flat config + hreflang undefined

**Bug 1: ESLint v8 + flat config incompatible con Next.js 15.5**

- `eslint.config.mjs` (flat config con `FlatCompat`) hacia que Next.js pasara
  opciones legacy `--useEslintrc` y `--extensions` durante el build.
- ESLint v8.57.1 las rechaza cuando detecta flat config.
- Error: `ESLint: Invalid Options: - Unknown options: useEslintrc, extensions -
'extensions' has been removed.`
- Solucion: reemplazar `eslint.config.mjs` por `.eslintrc.json` legacy.
  Reglas react-hooks v5+ removidas (no existen en v4 instalada).
- Build ahora procede correctamente el step de ESLint.

**Bug 2: hreflang undefined en cluster pages (regresion Sprint 5 F12)**

- `MODALITIES[modality as ModalitySlug].en` con `modality = "artistic-gymnastics"`
  devolvia `undefined` (la clave es `"artistic"`, no el slug).
- Fallaba en build pero dev server silenciaba con error boundary client-side.
- Error real: `TypeError: Cannot read properties of undefined (reading 'en')`.
- Solucion: usar `modalityKey` y `countryKey` ya calculados (que SI son las
  claves) en vez del slug directo.

**Validacion**: `pnpm build` EXITOSO en 200s, 207 paginas pre-renderizadas.

**Deploy**: commit `5c77418` pusheado a main. Vercel auto-deploy deberia funcionar.

## 2026-06-24 - Sprint 6 (Code Splitting + Producto + Deuda tecnica + Validacion) ejecutado

**Sprint 6A - Code Splitting agresivo + form refactor:**

- **6A.1 Touch targets**: aplicado script Python selectivo que solo convierte h-9 w-9 / h-8 w-8 en contexto de <Button> (no SVGs como Loader2). 1 archivo adicional migrado.
- **6A.2 F6 RHF + Zod**: `QuickClassModal.tsx` migrado de useState+FormEvent a react-hook-form + zodResolver. Nuevo `quickClassSchema` (uuid + regex date) con validacion declarativa. Errors per-field con role=alert. submitError separado. min-h-[44px] en inputs/botones. Deps: +@hookform/resolvers 5.4.0.
- **6A.3 F7 i18n keys**: nuevo `src/i18n/extras.ts` con secciones common, dashboard, athletes, billing, classes, events, navigation (~80 keys bilingues). Helper `getExtraTranslations(locale)`. Pendiente migrar componentes individuales.
- **6A.4 Code splitting**: nuevo `EventsListLazy.tsx` con next/dynamic (ssr: false). `src/app/app/[academyId]/events/page.tsx` usa EventsListLazy. Loading state animate-pulse.

**Sprint 6B - Producto:**

- **6B.1 P3 comunicacion consolidada UI**: nuevo `/app/[academyId]/comms/page.tsx` + `CommunicationHub.tsx` con 3 tabs (Mensajes / Anuncios / Notificaciones). Cada panel carga via next/dynamic. States: loading/empty/error. ARIA: role=tablist/tab/tabpanel, aria-selected, aria-controls. min-h-[44px]. Paginas originales (/messages, /announcements, /notifications) siguen como deep links.
- **6B.2 P1/P2**: documentados en vault como pendientes no automatizables (decision humana + QA con usuarios).

**Sprint 6C - Deuda tecnica:**

- **6C.3 Policies permisivas endurecer**: migracion `20260625000002_harden_permissive_policies.sql` reemplaza `allow_authenticated` por policies especificas en: marketplace_listings, marketplace_ratings, empleo_listings, empleo_applications, tickets, ticket_responses, ticket_attachments, advertisements, featured_listings, push_subscriptions. Filtros por user_id, academy_id, o admin.
- **6C.1 + 6C.4 Tablas criticas faltantes**: migracion `20260625000003_create_critical_missing_tables.sql` crea con FKs, indices y RLS: event_registrations, event_waitlist, event_categories, event_payments, class_waiting_list, athlete_documents. Resuelve 6 de las 25 tablas TS que faltaban en DB.
- **6C.2 Migraciones pendientes**: tras analisis, todas las migraciones del filesystem estan aplicadas a Supabase. Sin accion requerida.

**Sprint 6D - Validacion pre-produccion:**

- **6D.1 pg-mem vs testcontainers**: Sprint 6 intento quitar `api-billing.test.ts` del exclude de vitest, pero los mocks vi.hoisted estan incompletos (1/3 pasa). El exclude original era justificado. Documentado en vitest.config.ts.
- **6D.2 testcontainers**: no implementado (requiere decision arquitectonica mayor: pg-mem con shim RLS, testcontainers, o Supabase local en CI). Pendiente para sprint dedicado.

**Validacion final**: validate:rls PASS 100% (63 tablas + 6 nuevas con RLS), check:migrations OK, tsc OK, vitest 353/353 PASS en tests incluidos. 2 tests pre-existentes fallan en `product-go-live-readiness.test.ts` (academiaLimit null en catalog y feature "acompanado" no aparece), no relacionados con Sprint 6.

## 2026-06-23 - Sprint 5 (Frontend + Negocio) ejecutado

**Frontend:**

- **F5 memoizacion**: 6 cluster sections (ClusterAcademies/Coaches/Events/Hero/CTA/Interlinking) y 4 dashboard widgets (KPISection, RecentActivity, UpcomingClasses, QuickActions) envueltos con `memo()`. Cada componente renombrado a `XImpl` y exportado como `memo(XImpl)` para mantener compat con imports nombrados. Reduccion esperada de re-renders en cluster pages y dashboard academy.
- **F8 lazy load DashboardPage**: `next/dynamic` en `src/app/app/[academyId]/dashboard/page.tsx` carga DashboardPage (942 lineas, ~30 widgets) con code-splitting. Skeleton `DashboardPageSkeleton` muestra placeholder animado durante carga. Reduccion estimada del bundle inicial del segmento dashboard en ~70%.
- **F10 touch targets**: 3 botones icon-only en `DashboardTopbar` (notificaciones, ayuda, opciones) cambiados de `h-9 w-9` (36x36) a `min-h-[44px] min-w-[44px] h-11 w-11` (44x44px). Cumple WCAG 2.5.5. Otros 59 botones pequenos en el resto de componentes quedan como follow-up.
- **F12 hreflang en cluster pages**: metadata `alternates.languages` ahora declara versiones ES y EN de cada cluster `[locale]/[modality]/[country]`. Mejora SEO internacional sin duplicar URLs canónicas.
- **F6/F7 diferidos**: RHF+Zod en 5 dialogos criticos y extraccion i18n del dashboard requieren refactor profundo. Quedan como P1 para sprints dedicados.

**Negocio:**

- **P3 comunicacion interna consolidada**: `/api/messages/send` ya consolida busqueda/creacion de conversacion + envio + in-app notification + push notification. Disparadores existentes desde Contactos de atleta y desde detalle de grupo ya operativos. Pendiente: consolidar announcements + mensajes + notificaciones en un solo centro de UI con tabs.
- **P4 clase de hoy para coach**: nuevo `src/components/coach/TodayQuickActions.tsx` con 3 acciones inline (pasar asistencia, evaluar progreso, aviso al grupo). Cada accion es un Link directo con `min-h-[44px]`. Empty state cuando no hay sesion. Pendiente: integrarlo en `CoachDashboardPage.tsx` pasando `todaySession` (ya disponible como prop).
- **P1 decision legacy `/dashboard/*`**: opciones A/B/C/D ya analizadas en `Decisiones.md`. PENDIENTE Elvis (requiere eleccion humana entre compatibilidad vs migracion).
- **P2 QA portal padres con usuarios reales**: implementado tecnicamente (allowlist + redirect + clean links). PENDIENTE sesion de prueba con `parent`/`athlete` reales para validar UX end-to-end. No automatizable.
- **P5 pricing freemium (10 entrevistas)**: 10 sesiones con academias siguen PENDIENTES. Hipotesis free + Growth + Pro documentada en `Pricing.md`. Sin automatizar; requiere coordinacion con equipo de growth.

**Validacion**: typecheck OK, lint OK, validate:rls PASS 100%, check:migrations OK, vitest 353/353 PASS (37 archivos, sin regresiones).

## 2026-06-23 - Sprint 4 (Testing) ejecutado

- **T2 placeholders eliminados**: `tests/components-critical.test.tsx` ahora tiene 10 tests reales con React Testing Library + user-event + jest-dom. Reemplaza los 20 placeholders `expect(true).toBe(true)`. Cubre FormField (5 tests: render, error externo, required, email, minLength) y ConfirmDialog (5 tests: render, onConfirm, onCancel, variant destructive, loading state).
- **T11 integridad de migraciones**: nuevo `scripts/check-migrations-integrity.ts` y `pnpm check:migrations`. Verifica journal consistency (SQL + snapshot por entrada). Job CI `check-migrations` añadido. Drift Drizzle via `db:generate` sigue requiriendo DB real - queda como follow-up.
- **T7 Playwright parallel + cross-browser**: `playwright.config.ts` con `fullyParallel: true` en CI, `workers: 3`, `maxFailures: 5`. Proyectos: chromium, firefox, webkit. Reporter `github` para annotations en PRs.
- **T8 coverage a Codecov**: job `test` ahora corre `pnpm vitest run --coverage` y sube `coverage/lcov.info` a Codecov via `codecov-action@v4`. Requiere `CODECOV_TOKEN` secret.
- **T10 E2E en CI**: jobs `e2e-public` y `e2e-auth` con secrets `E2E_*`. Solo corren en push a main. Generan storage state antes de correr tests autenticados.
- **T6 tests de validators**: `tests/validators.test.ts` con 19 tests cubriendo required, email, minLength, maxLength, pattern y combine. Reusable para todos los formularios que usen `FormField`/`validators`.
- **Deps nuevas**: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@vitejs/plugin-react@4.3.4`.
- **Vitest config**: setup file importa `@testing-library/jest-dom/vitest` para matchers. Tests `*.tsx` soportados via `@vitejs/plugin-react`.
- **Difierido**: T1 (pg-mem para 17 tests API excluidos) y T3 (testcontainers para tenancy) requieren setup de DB de prueba; se abordan en sprint dedicado cuando se decida estrategia de test DB.
- **Validacion**: `pnpm typecheck`, `pnpm lint`, `pnpm validate:rls` (PASS 100%), `pnpm check:migrations` (3 migraciones), `pnpm vitest run tests/components-critical.test.tsx tests/validators.test.ts` (29 tests pasan).

## 2026-06-23 - Sprint 3 (Arquitectura y DX) ejecutado

- **A3 i18n middleware consolidado**: `src/middleware-i18n.ts` (que Next.js nunca cargaba) eliminado. Logica de i18n redirect migrada a `middleware.ts` raiz con deteccion de locale por cookie/Accept-Language. Orden: exclude paths -> i18n redirect -> rate-limit API mutante -> rate-limit /app y /super-admin -> super-admin gate JWT con firma HS256.
- **A7 AuthorizationError consolidado**: `src/lib/authz/errors.ts` ahora extiende la jerarquia `AppError` de `src/lib/errors.ts`. Re-exporta `AppAuthorizationError` para compatibilidad. `src/lib/authz.ts` actualizado para usar `error.statusCode` (campo AppError) en vez de `error.status`. Una sola clase, un solo `instanceof` check.
- **A8 tracesSampleRate reducido**: `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` ahora usan `tracesSampler` con logica: 100% en errores 5xx, 10% en 2xx/3xx, 0% en `/api/stripe/webhook` y `/api/cron`. `replaysSessionSampleRate` reducido de 0.1 a 0.05 en cliente. Cierra riesgo de saturar quota Sentry en produccion.
- **A4 withErrorHandler mejorado**: ahora soporta el patron `withErrorHandler(withTenant(handler))` para composicion. Reconoce `AppError` (statusCode explicito) primero, luego ZodError, luego genericos. Acepta `RouteContext` con params Promise (Next.js 15). Aplicado como ejemplo en `/api/audit-logs/route.ts` con `apiSuccess`.
- **A1 withBearerTenant nuevo wrapper**: `src/lib/authz.ts` ahora exporta `withBearerTenant` que resuelve userId desde `Authorization: Bearer <token>` via `supabase.auth.getUser(token)` en lugar de cookies. Mantiene misma signature de contexto. Aplicado como ejemplo en `/api/push-tokens/route.ts` con `withErrorHandler(withBearerTenant(handler))`. Patron listo para migrar las 14 APIs bearer restantes en sprints siguientes.
- **A6 capa de repositorios iniciada**: `src/db/repositories/athletes.ts` con `listForAcademy`, `countForAcademy`, `findById`. Filtra siempre por `tenantId` (defensa en profundidad ademas de RLS). Patron para replicar a classes, events, billing, etc. en siguientes sprints.
- **Validacion**: `pnpm typecheck`, `pnpm lint` y `pnpm validate:rls` (PASS 100% sobre 63 tablas) limpios. Sin cambios visibles al usuario final.

## 2026-06-23 - Sprint 2 (Base de Datos) ejecutado parcialmente

- **S6 SELF_SIGNED_CERT_IN_CHAIN resuelto**: certificado CA raiz de Supabase extraido a `certs/supabase-root-ca.crt` (publico, commiteado al repo). `drizzle.config.ts` ahora carga `.env.local` ademas de `.env`. Nuevo script `scripts/db-migrate.ts` resuelve `NODE_EXTRA_CA_CERTS` a ruta absoluta y ejecuta `drizzle-kit push` con env vars correctas. `scripts/dump-schema.ts` y `scripts/check-fks.ts` con SSL fix para diagnostico. `scripts/apply-migration.ts` ya funcionaba en `NODE_ENV=production` por su `ssl: { rejectUnauthorized: false }`. `.env.example` documenta `NODE_EXTRA_CA_CERTS`.
- **S3 drift Drizzle↔SQL parcialmente cerrado**: `pnpm db:migrate` ahora conecta. Dump del schema real revela que **25 tablas del schema TS NO EXISTEN en DB** (academy_link_requests creado en Sprint 1, academy_roles, assessment_rubrics, athlete_documents, class_exceptions, class_waiting_list, competition_results, event_categories, event_payments, event_registrations, event_waitlist, federative_licenses, leads, leak_action_history, message_groups, message_history, message_templates, notification_preferences, push_tokens, role_members, rubric_criteria, scheduled_notifications, scheduled_reports). Migracion `20260625000000_apply_pending_migrations.sql` crea el modulo leak-profitability (academy_diagnostics, academy_expenses, churn_reasons, coach_compensation) que estaba pendiente desde 0001 y registra 0001/0002 en `__drizzle_migrations`. Drift menor en `academy_diagnostics` (score/yes_count) queda documentado.
- **S4 añadir tablas faltantes DIFERIDO**: `drizzle-kit push --force` propone cambios destructivos (borrar `__drizzle_migrations`, truncar tablas, cambiar PK). Requiere plan de migracion manual tabla por tabla. Backlog P0 para sprint dedicado.
- **S2 RLS modulos laterales cerrado**: migracion `20260625000001_rls_lateral_modules.sql` habilita RLS en `announcements`, `announcement_read_status`, `conversation_messages`, `conversation_participants`, `message_read_receipts` con policies por tenant/user. Tablas con policy permisiva `allow_authenticated` documentadas en backlog para endurecer (marketplace*\*, empleo*\_, tickets\_\_, advertisements, featured_listings, push_subscriptions).
- **S5 mover claves Stripe a Vault DIFERIDO**: `supabase_vault` extension instalada y disponible. `academies.stripe_secret_key` y `academies.stripe_webhook_secret` existen como columnas pero 0 academias tienen datos. Las claves Stripe de Zaltyko (cuenta SaaS) estan en env vars, no en la tabla. Backlog P1 para cuando se implemente Stripe Connect por academia.
- **Validacion**: `pnpm typecheck`, `pnpm lint` y `pnpm validate:rls` (PASS 100% cobertura sobre 63 tablas) limpios. 2 migraciones SQL nuevas aplicadas a Supabase. Sin cambios de UI.

## 2026-07-07 - Segunda tanda hardening demo/roles

- Confirmado bloqueo real de E2E autenticado: las credenciales `E2E_AUTH_*` actuales no autentican en Supabase Auth (`Invalid login credentials`), por lo que no se pudo regenerar `.auth/user.json`.
- Agregado smoke E2E minimo por rol (`tests/e2e-role-smoke.spec.ts`) para super admin, owner y coach; queda preparado y salta explicitamente hasta tener storage states validos.
- Endurecido permiso de coach en asistencia/progreso: `/api/attendance` y `/api/assessments` validan clase/atleta asignado mediante helpers centralizados en `src/lib/permissions.ts`, `src/lib/attendance/service.ts` y `src/lib/progress/service.ts`.
- Endurecido scoping familiar inicial: `/api/family/children` usa `getFamilyChildrenForUser()` con rol familiar, tenant y relaciones permitidas; quedan endpoints familiares/bearer restantes para una pasada posterior.
- Eliminado `src/app/app/[academyId]/my-dashboard/page.js` duplicado tras validar que `page.tsx` mantiene la ruta y `pnpm build` pasa.
- Preparado dataset demo dev-session para Espana: academia, gimnastas, grupo, clase, entrenadores, asistencia, cobros internos y progreso. Smoke HTTP owner paso en dashboard, gimnastas, grupos, clases, cobros, settings y my-dashboard.
- Validacion actual: `pnpm exec tsc --noEmit --pretty false` PASS, `pnpm lint` PASS, `pnpm exec vitest run` PASS (40 archivos, 358 tests), `pnpm build` PASS (201 paginas).

## 2026-06-23

- Creada estrategia competitiva para gimnasia artistica/ritmica con comunicacion interna primero y WhatsApp secundario/futuro.
- Creada matriz competitiva inicial de 10 competidores y documento draft de MVP exacto Zaltyko gimnasia.
- Actualizados pricing, mensajes aprobados, competidores, backlog y decisiones para reflejar hipotesis freemium accesible sin cambiar precios ni limites reales.
- Iniciada investigacion competitiva operativa: matriz ampliada con Pike13, WellnessLiving, Clupik pricing, senales de reviews publicas y dolores por area. Pricing actualizado con hipotesis de empaquetado Free/Growth/Pro a validar.
- Auditado MVP real contra codigo: detectado bloqueo probable del portal moderno de padres/atletas por `canAccessAcademyWorkspace`; creado backlog P0 para resolver acceso limitado seguro y backlog P1 para comunicacion interna/flujo entrenador.
- Creado [[Plan operativo gimnasia]] con fases de ejecucion y [[Guia entrevistas academias gimnasia]] para validar dolores, MVP y pricing con 10 academias.
- Implementado primer desbloqueo tecnico del portal padres/atletas: allowlist de rutas limitadas en `/app/[academyId]`, home moderno para parent/athlete, navegacion limitada, redirect de invitacion/home a `my-dashboard` y tests de roles/flujo critico actualizados.
- Limpiados enlaces internos del panel personal que apuntaban a rutas administrativas (`billing`, `attendance`, `assessments`, `calendar`, `athletes`) y retirado CTA directo de WhatsApp para sostener comunicacion interna primero.
- Conectada `/app/[academyId]/messages` al centro interno de mensajes directos para perfiles `parent`/`athlete` miembros; owners/admin mantienen la bandeja de mensajes de contacto publicos.
- Agregado primer disparador operativo de comunicacion interna familiar: desde Contactos del detalle de atleta, staff puede abrir/crear una conversacion interna validada con un tutor que tenga acceso al portal.
- Agregado disparador de comunicacion interna por grupo: desde el detalle de grupo, staff puede abrir/crear una conversacion con los tutores del grupo que ya tienen acceso al portal.
- Implementado registro abierto por rol inicial (`owner`, `coach`, `parent`, `athlete`, `provider`), perfil global al confirmar/callback de auth, rutas globales por rol y soporte inicial para proveedores en marketplace.
- Registrada decision de identidad global + vinculos aceptados por academia; backlog actualizado con la entidad pendiente de solicitudes de vinculo a usuarios existentes.
- Implementada base tecnica de solicitudes de vinculo a usuarios existentes: tabla `academy_link_requests`, busqueda por email exacto via `auth.users`, creacion pendiente por academia, notificacion interna y aceptacion/rechazo por el usuario con creacion de `membership`.
- Agregada UI basica de solicitudes de vinculo: staff puede crear solicitudes desde `/dashboard/users`, ver solicitudes pendientes y usuarios globales pueden aceptar/rechazar desde su perfil.
- Implementada desvinculacion segura de usuarios por academia: `DELETE /api/academy-memberships/[membershipId]` elimina solo `membership`, conserva `profiles`, limpia `activeAcademyId` si aplica, notifica al usuario y bloquea auto-desvinculacion/ultimo owner. UI conectada en `/dashboard/users`.
- Ejecutado smoke Playwright autenticado de solicitudes de vinculo: migraciones `20260623100000_add_provider_profile_role.sql` y `20260623103000_create_academy_link_requests.sql` aplicadas en sandbox; `tests/e2e-link-requests-ui.spec.ts` PASS en Chromium validando `/dashboard/users` y `/dashboard/profile`.
- Conectado email opcional para solicitudes de vinculo ademas de notificacion interna; si Brevo/email falla, la solicitud no se rompe y queda logueada la incidencia.
- Corregido onboarding de perfil para aceptar `provider` desde `/auth/register`; smoke Playwright publico valida los 5 roles iniciales.
- Registrada decision de mantener `membership_role` simple en v1 (`owner`, `coach`, `viewer`) y mapear `admin` global a acceso de owner hasta necesitar permisos granulares.
- Estado real: faltan QA manual con dos usuarios reales, validacion de cuentas reales por rol y barrido completo de copy "borrar" vs "desvincular" en pantallas especificas de atletas/tutores/entrenadores.

## 2026-06-24 - Migraciones produccion aplicadas y verificadas

- Aplicadas en Supabase produccion `jegxfahsvugilbthbked`: `20260622153000_add_sport_config_rls.sql` y `20260624000000_rls_academy_link_requests.sql`.
- Verificado que las piezas criticas ya estan presentes en produccion: columnas de assessments, campos comerciales de clases, `billing_invoices`, role `provider`, `academy_link_requests`, tablas leak-profitability, RLS lateral, policies endurecidas de marketplace/empleo/push y tablas criticas de eventos/documentos.
- Corregida la migracion RLS de `academy_link_requests`: `get_current_profile()` devuelve `profiles`, asi que las policies deben comparar `target_profile_id` con `(get_current_profile()).id`.
- `pnpm check:migrations` sigue en verde. No se hizo push ni cambios en Stripe productivo.

## 2026-06-24 - Limpieza warnings Vercel build

- Eliminado `vercel` como devDependency porque Vercel lo ignora en builds remotos y el workflow ya instala el CLI globalmente.
- Convertido `tailwind.config.ts` a `tailwind.config.mjs` para evitar el warning ESM/CJS al cargar Tailwind en Vercel.
- Corregido CI: `pnpm/action-setup` ya no fija `version: 9` porque `package.json` define `packageManager` con `pnpm@9.15.3`.
- `pnpm lint` y `pnpm build` pasan; quedan solo warnings historicos de lint no bloqueantes.

## 2026-06-24 - Cierre CI PR coherencia critica

- Ancladas como devDependencies directas `playwright` y `@vitest/coverage-v8` para que `pnpm typecheck`, scripts E2E y `pnpm vitest run --coverage` no dependan de transitive deps en CI.
- `scripts/check-migrations-integrity.ts` ahora soporta runners sin carpeta local `drizzle/`: valida `supabase/migrations` y mantiene la validacion Drizzle completa cuando `drizzle/meta/_journal.json` existe.
- Corregido `tests/api-academy-settings-sport-config.test.ts`: mock de `logger`, cadenas Drizzle mockeadas con `groupBy`, forma correcta de `apparatus` y timeouts locales para coverage de ruta Next pesada.
- `coverage/` queda ignorado como artefacto local de pruebas.
- Validacion local final: `pnpm typecheck`, `pnpm lint`, `pnpm check:migrations`, `pnpm vitest run --coverage` (39 archivos, 376 tests) y `pnpm build` pasan.
- Fix adicional de CI Build: onboarding `parent`/`athlete`/`coach` crea el cliente Supabase solo en `handleFinish`, evitando que el prerender falle cuando el runner no tiene `NEXT_PUBLIC_SUPABASE_URL`/anon key.
- Validado con `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= pnpm build`.

## 2026-06-22

## 2026-06-22 - Cierre Go-Live SaaS v1 con sandbox real

- Ejecutado QA P1 real contra Supabase sandbox: `tests/e2e-zaltyko-p1-flows.spec.ts` **5/5 PASS** en 9.7 min con academia `9ec3ea79-73e9-4604-8e4a-ddf1d6469cbb` y storage state `.auth/user.json`.
- Endurecido E2E P1 para crear datos minimos: atleta, clase, enrollment, sesion, evaluacion, asistencia, reporte/export, comunicacion y billing base.
- Corregido fallback local de rate limit cuando faltan variables KV, manteniendo fail-closed en produccion.
- Corregidos bugs detectados por QA real: compatibilidad `classes.weekday`, conteo de `class_enrollments`, `rubric_id` en assessments, params opcionales null en comunicacion, placeholder Stripe en checkout y schema `billing_invoices`.
- Aplicadas/sincronizadas migraciones sandbox: technical guidance, assessments, sport config RLS, class commercial fields y billing invoices.
- Backlog P1 actualizado a Resuelto para onboarding/trial, evaluaciones, asistencia/reportes y comunicacion consolidada dentro del alcance v1.
- Riesgo residual documentado: cobro self-serve masivo requiere price real Stripe y corrida webhook/portal/upgrade/downgrade/cancel/past_due; mientras haya placeholders, checkout degrada a `STRIPE_NOT_CONFIGURED`.

## 2026-06-22

## 2026-06-22 - Cierre de bugs P1 y actualizacion de QA

- Auditoria completa de la vault (51 notas, 0 links rotos, 8 huerfanos legitimos). Notas nuevas: `Auditoria de la vault - 2026-06-22`, `Auditoria copy publico - 2026-06-22`, `QA - Flujos P1 - 2026-06-22`.
- Bug A CERRADO: `/api/reports/attendance/export` ahora responde 200 + PDF. Fix: quitar `academyId` del schema (ya viene de `withTenant`) y permitir `null` en params opcionales con `.nullable().optional()`. Ajuste posterior: `?? undefined` en `filters` para que tsc acepte.
- Bug B CERRADO: `/app/[id]/athletes/[athleteId]/assessments` ya no muestra "Failed query". Causa: DB desincronizada con schema TS (faltaban `assessment_type`, `total_score`, `tenant_id`). Fix: nueva migracion `supabase/migrations/20260622140000_sync_athlete_assessments_schema.sql` aplicada via `scripts/apply-migration.ts`.
- Bug C CERRADO: caracteres chinos `提醒` en `FeaturesSection.tsx:130` sustituidos por "recordatorios".
- Bug D CERRADO: paginas publicas (`marketplace`, `empleo`, `events`) ya no apuntan a `/dashboard/*` legacy. `/api/auth/check` ahora devuelve `academyId`; `PublicPageHeader` usa `dashboardHrefTemplate` con placeholder `{academyId}`.
- Suite E2E `tests/e2e-zaltyko-p1-flows.spec.ts`: **3/3 PASSED** en 1 minuto.
- Suite E2E `tests/e2e-zaltyko-full.spec.ts`: **10/10 PASSED** en ~7.6 min (6 tests rapidos 3.5 min + 4 tests pesados 4.1 min). Genera screenshots responsive en `test-results/sprint-3/`.
- Typecheck investigado: **no es tsc el problema del build**. `pnpm typecheck` termina en 13s limpio y pasa sin errores (incluyendo los fixes de Bug A). El `pnpm build` se cuelga en una fase posterior (probable static generation de rutas dinamicas). No bloquea dev ni QA.
- Decision pendiente: rutas legacy `/dashboard/*` (opciones A/B/C/D registradas en `Decisiones.md` con pros/contras). Pendiente de Elvis.
- Decisiones pendientes adicionales: cifras del Hero, pricing anual, testimonios, FAQ retencion 30 dias.

## 2026-06-22

- Creada vault Obsidian versionada en `vault/`.
- Añadida estructura operativa para producto, tecnologia, negocio, marketing, ventas, roadmap, auditorias y referencias.
- Definida regla: cambios relevantes deben actualizar vault.
- Ejecutados los primeros 5 pasos de operativizacion: estados corregidos, pricing auditado, backlog convertido en tareas, auditoria de producto real y workflow diario documentado.
- Corregido downgrade Stripe pago -> pago para usar subscription item real.
- Corregida paginacion de notificaciones.
- Añadido checklist QA para evaluaciones, asistencia y onboarding.

## 2026-06-22 - Go-live SaaS v1

- Growth queda limitado a 1 academia en v1 comercial; Network conserva multi-sede solo con onboarding acompanado.
- Eliminadas promesas vendibles de "academias ilimitadas" en Growth y actualizado pricing/copy de marketing.
- Agregado guardrail `tests/product-go-live-readiness.test.ts` para feature flags apagadas y posicionamiento de planes.
- Ampliado `tests/e2e-zaltyko-p1-flows.spec.ts` con smoke de comunicacion y billing.
- Agregada migracion `20260622153000_add_sport_config_rls.sql`; `pnpm validate:rls` pasa con 62 tablas tenant y 100% de cobertura.
- Registrada decision en [[Decisiones#2026-06-22 - V1 comercial con una academia por cliente]] y checklist en [[QA - Go Live SaaS - 2026-06-22]].
- Configurado E2E autenticado local: usuario owner, academia fixture, storage state de Playwright ignorado por git y suite `pnpm test:e2e` en verde con 10 tests.
- Preparado deploy Vercel: `pnpm build` pasa, ESLint queda como validacion explicita con `pnpm lint`, TypeScript sigue bloqueando build y `.vercelignore` excluye `.env*`/`.auth`.

## Como actualizar

Registrar cambios humanos y relevantes: releases, decisiones, cambios de pricing, nuevas features, cambios de arquitectura, migraciones importantes, hallazgos de auditoria y riesgos cerrados.

## 2026-07-09 - Auditoria E2E roles y a11y autenticada

- Regeneradas y verificadas sesiones Playwright E2E para owner, coach y super-admin; `tests/e2e-role-smoke.spec.ts --project=chromium --workers=1` pasa 3/3.
- Corregidos fallos axe autenticados en dashboard/athletes: nombres accesibles de progressbar/selects, contraste de sidebar/topnav/widgets/badges y estados de tabla.
- `tests/a11y-zaltyko.spec.ts --project=chromium --workers=1` pasa 4/4 incluyendo dashboard y athletes autenticados.
- Corregida configuracion Playwright: `testDir` ahora apunta a `./tests`, evitando que el runner escanee todo el repo y arboles pesados.
- Corregida interaccion de tabs en `/features`: `FeaturesSection` queda controlado en cliente y el smoke publico espera hidratacion antes de interactuar. Test aislado de tabs pasa.
- Estado E2E completo tras segunda pasada Chromium: roles PASS 3/3, a11y PASS 4/4, public smoke PASS 6/6 dentro del rerun amplio; suite principal `tests/e2e-zaltyko-full.spec.ts` queda con 1 fallo persistente en "critical academy pages render without route-level errors" por timeout del dev server al recorrer muchas rutas, y 2 flakies que pasaron en retry.

## 2026-07-09 - Correccion de preferencias y smoke por roles

- Alineado `src/db/schema/user-preferences.ts` con Supabase: `user_preferences` usa `user_id` como clave primaria y no expone columna `id`.
- Actualizado onboarding para consultar y actualizar preferencias por `user_id`.
- Ajustado el smoke de Coach para tolerar cancelaciones de navegacion propias del dev server y verificar la pantalla final.
- Validacion: smoke de Coach PASS 1/1; smoke combinado de Super Admin, Owner y Coach PASS 10/10 en el rerun completo.

## 2026-07-09 - Trazabilidad Super Admin aplicada

- Aplicada en Supabase la migracion `20260709000000_allow_global_audit_logs.sql`.
- La migracion alinea `audit_logs` con el schema: agrega de forma no destructiva los campos descriptivos faltantes y conserva los datos existentes.
- Ajustadas las policies para que las entradas globales sin academia no queden disponibles para usuarios normales de una academia.
- Verificada una insercion completa de auditoria en una transaccion revertida: no se conservaron datos de prueba.

## 2026-07-09 - Aislamiento de audit logs endurecido

- Aplicada la migracion `20260709010000_scope_audit_logs_to_super_admin.sql`.
- Las policies de `audit_logs` ahora reservan el bypass global para `is_super_admin()`; una cuenta normal solo puede acceder a filas de su tenant.
- Pruebas RLS transaccionales: un owner no pudo leer un log global, un Super Admin sí pudo, y el owner pudo crear y leer un log de su propio tenant. No quedo ningun dato de prueba.

## 2026-07-09 - Acciones sensibles y E2E ampliado

- Los diálogos de Super Admin para cambiar rol, suspender/reactivar o borrar usuarios/academias exigen un motivo de al menos 5 caracteres.
- Las APIs de Super Admin rechazan esas acciones sin motivo y lo almacenan en `audit_logs`; las fichas de detalle también solicitan el motivo si cambia el acceso.
- E2E por roles: PASS 10/10. Smoke público aislado: PASS 6/6. Accesibilidad aislada: PASS 4/4.
- La pasada combinada de 30 pruebas mostró inestabilidad específica de `next dev` durante recompilación intensa; los fallos públicos no se reprodujeron al ejecutar la suite aislada. Pendiente estabilizar el servidor de pruebas antes de usar la combinación como gate único.

## 2026-07-10 - Gate E2E completo en servidor de produccion

- Generado un build limpio y regeneradas sesiones de producción para owner, coach y super-admin; autenticacion PASS 3/3.
- Ejecutada en Chromium con un worker la pasada conjunta de flujos completos, páginas públicas, accesibilidad y roles: PASS 40/40, sin contextos de error en `test-results`.
- Estabilizado el guardado de sesiones esperando la hidratacion y comprobando que email y contraseña sigan presentes antes de enviar el formulario.
- Corregidos los detalles demo públicos de marketplace y empleo para resolver sus datos de forma directa y construir enlaces con el origen real de la petición.
- Relajada la validación de identificadores de atletas al formato UUID que admite PostgreSQL y estabilizada la navegación E2E esperando la hidratación antes del clic.
- Validaciones adicionales: build, typecheck, chequeo de migraciones y `audit-hardening` PASS 12/12.
- Quedan documentados como deuda no bloqueante los avisos repetidos de métricas GR no disponibles y el intento de formatear `Sin días asignados` como fecha.

## 2026-07-12 - Nomenclatura federativa por país/disciplina: diagnóstico y arranque de Fase 0

- **Origen**: el usuario pidió que el panel de cada academia use la nomenclatura real de su país y disciplina (RFEG en España, FMG en México, etc.), en vez de un vocabulario genérico. Análisis confirmó que ya existe una arquitectura completa para esto en `src/db/schema/sport-config.ts` (`countries` → `sportDisciplines` → `sportBranches` → `sportLocaleConfigs` → `terminologyDictionary`/`apparatus`/`programs`/`levels`/`categories`/`competitionTypes`, más `academySportConfigs` para activación por academia) — no se rediseñó el modelo de datos, solo se auditó su contenido y conexión.
- **Hallazgos de diagnóstico** (ver plan en `~/.claude/plans/lo-que-me-interesa-jolly-creek.md` del usuario para el detalle completo):
  - `SPORT_CONFIG_SEEDS` en `src/lib/sport-config/catalog.ts` solo tiene 3 entradas, todas de España (`ES:artistic_female`, `ES:artistic_male`, `ES:rhythmic`), y modela la Vía Olímpica de GAF con 3-4 niveles cuando la normativa real vigente tiene 10.
  - Bug de robustez confirmado: `getSportConfigSeedByVariant()` (catalog.ts) devuelve `null` sin aviso cuando el `countryCode` de una academia no tiene seed sembrado; `activateAcademySportConfig()` (seed.ts) propaga ese `null` sin error, y tanto el onboarding (`src/app/api/onboarding/owner/route.ts`) como el endpoint de settings siguen adelante sin avisar al dueño. Cualquier academia fuera de España se queda silenciosamente sin nomenclatura especializada.
  - `getSpecializedNavigationLabel()` (`src/lib/specialization/registry.ts`) solo traduce 2 de ~14 claves del menú lateral; el resto usa labels hardcodeados pese a que el sidebar ya recibe el contexto de especialización.
  - Inconsistencia real entre `DEFAULT_TERMINOLOGY` (`sport-config/terminology.ts`) y el default usado por `specialization/registry.ts` — no son solo shapes distintos, tienen valores distintos para el mismo concepto (ej. "Atleta" vs "Gimnasta").
  - `src/types/athlete-edit.ts` mantiene un catálogo legacy paralelo (`CATEGORY_OPTIONS`, `LEVEL_OPTIONS`) usado como fallback en `AthleteLevelForm.tsx`, compitiendo con el sistema dinámico.
- **Fase 0 (investigar y corregir la normativa de España) — INICIADA, NO CERRADA**: se intentó extraer los PDFs oficiales de normativa técnica RFEG 2025/2026 (GR y programa técnico por edades) — ambos fetches devolvieron contenido vacío, no se pudo leer el PDF directamente. El research con fuentes secundarias (blogs especializados, federaciones autonómicas) confirmó con solidez razonable que la Vía Olímpica de GAF tiene 10 niveles ligados a la edad, pero encontró **contradicciones reales sin resolver** en el número de niveles del Programa Base de GAF (una fuente dice 2, otra dice 10, otra sugiere al menos 3) y en las categorías de edad exactas de gimnasia rítmica (3 listados distintos entre fuentes). Documentado completo con cada fuente y contradicción en `vault/07-Auditorias-y-Riesgos/Normativa RFEG 2025-2026 - borrador.md`.
- **Decisión de riesgo tomada**: NO se modificó `src/lib/sport-config/catalog.ts` con estos datos contradictorios. El riesgo de que un dueño de academia española vea niveles/categorías incorrectos presentados como oficiales es mayor que el beneficio de corregir ahora con datos sin confirmar. Queda pendiente que un humano con conocimiento federativo real (o una herramienta de extracción de PDF distinta) confirme los puntos marcados como contradictorios antes de tocar el catálogo de producción.
- **Pivote de esta sesión**: dado el bloqueo de datos en Fase 0, se pasó a ejecutar la Fase 1 (arreglar el fallback silencioso para países sin seed), que no depende de resolver la normativa española y es trabajo de lógica/código verificable de forma independiente.
- **Fase 1 completada (mismo día)**: `getSportConfigSeedByVariant()` (`src/lib/sport-config/catalog.ts`) ya no devuelve `null` en silencio cuando el país de una academia no tiene seed sembrado — busca un fallback genérico explícito (nuevas entradas `GENERIC:artistic_female`/`GENERIC:artistic_male`/`GENERIC:rhythmic`/`GENERIC:general`, con `federation: ""` y solo aparatos estándar FIG, nunca una federación inventada) marcado con `isGenericFallback: true`. `activateAcademySportConfig()` (`seed.ts`) propaga ese flag y el `configVersion` real en su valor de retorno. `createAcademy()` (`academies.lib.ts`) y ambos endpoints que activan sport-config (`onboarding/owner/route.ts`, `academies/[academyId]/settings/route.ts`) dejaron de adivinar `federationConfigVersion`/`specializationStatus` con un ternario hardcodeado por país+variante; ahora leen el resultado real de la activación y marcan la academia como `specializationStatus: "generic_fallback"` (nuevo valor, añadido a `AcademySpecializationStatus` en `specialization/registry.ts`) en vez de `"configured"` cuando no hay catálogo real para su país. El onboarding también expone `sportConfigFallback` en la respuesta de la API para que el frontend pueda mostrar un aviso (el aviso de UI en sí queda para la Fase 2, no se tocó ningún componente visual en esta sesión).
- **Validado**: `pnpm typecheck` limpio, `pnpm lint` limpio. Tests ejecutados: `academy-specialization.test.ts` (9), `api-academy-settings-sport-config.test.ts` (4), `api-billing-sport-filters.test.ts` (2), `api-charges-sport-config.test.ts` (2), `api-financial-reports-sport-config.test.ts` (2), `sport-config-catalog.test.ts` (8, incluye 3 casos nuevos para el fallback genérico) — 27/27 PASS. `tests/api-academies.test.ts` está excluido de la config de vitest (requiere entorno aparte), no se corrió. No se corrió `check:migrations` porque no hay cambios de schema/migraciones en este trabajo (solo TS de aplicación).
- **No ejecutado / pendiente**: no se corrió ningún seed contra la base de datos real ni Supabase — los cambios son de código de aplicación (catálogo en memoria + lógica de fallback); las entradas `GENERIC:*` se insertarán en `sport_locale_configs`/`terminology_dictionary`/etc. la próxima vez que `seedSportConfigurations()` corra en cualquier entorno (se dispara automáticamente al llamar `activateAcademySportConfig`, no requiere paso manual aparte). No se tocó ninguna migración SQL.
- Vault: actualizadas `Normativa RFEG 2025-2026 - borrador.md` (nueva), `Backlog priorizado.md` (fila 3.9 nueva + re-encuadre de 3.7), `Changelog interno.md` (esta entrada).

## 2026-07-12 (tarde) - Fase 0 cerrada con datos oficiales confirmados + hallazgo de tercer sistema paralelo

- **El usuario proporcionó los 3 PDFs oficiales de la RFEG** (descargados desde su propio navegador, sin el CAPTCHA que bloqueaba el acceso automatizado): `PROGRAMA-TECNICO_GAF_2026.pdf`, `PROGRAMA-TECNICO-NIVELES_GAM_2026.pdf`, `NORMATIVA-TECNICA-GR-2026.pdf` (los 3 "Aprobado JD 26 septiembre 2025"). Se leyeron completos con la herramienta de lectura de PDF (requirió `brew install poppler` para renderizar páginas, no estaba instalado).
- **`src/lib/sport-config/catalog.ts` actualizado con datos confirmados, ya no estimados**:
  - GAF: Programa Base = **10 niveles** (Base 1-10, no 3-4 como antes) y Vía Olímpica = 10 niveles con nombre/edad exactos (VO1 Pre-Benjamín ≤8 años ... VO10 Sénior Élite 16+). El orden Sénior(VO8) antes de Júnior(VO9) es real, no error.
  - GAM: Programa Base = **5 niveles** (Base 1-5) con edades propias — confirmado que GAM NO comparte estructura con GAF (antes ambos usaban las mismas constantes `ES_ARTISTIC_LEVELS`/`ES_AGE_CATEGORIES`, error real corregido). Vía Olímpica GAM queda sin confirmar (el PDF proporcionado solo cubre Base).
  - GR: categorías individuales del Campeonato de España reemplazadas por las reales (Benjamín 2017-18, Alevín 2015-16, Infantil 2013-14, Júnior 2011-12, Sénior 2010-, 1ª Categoría, Júnior/Sénior Honor, Máster). El programa de niveles Base de GR queda sin confirmar (documento leído es de competición individual, no de Base).
  - Se separaron las constantes compartidas (`ES_AGE_CATEGORIES`/`ES_ARTISTIC_PROGRAMS`/`ES_ARTISTIC_LEVELS`) en `GAF_*`, `GAM_*` y `GR_AGE_CATEGORIES` propias — ya no hay una sola lista genérica reutilizada entre las 3 configuraciones de España.
  - Todo lo no confirmado queda comentado inline en el código citando la fuente exacta y qué falta, en vez de inventarse.
- **Tests corregidos por la actualización de datos** (comportamiento correcto, no regresión): `tests/lib/sport-config-catalog.test.ts` esperaba `programs: ["recreativo","base","via_olimpica"]` para GAF — "recreativo" no existe en la normativa real, se quitó del assert. `tests/api-academy-settings-sport-config.test.ts` usaba el código `"recreativo"` como programa-no-usado-para-forzar-conflicto; se cambió a `"via_olimpica"` (sigue siendo un código real y sigue siendo distinto del que está en uso, mismo efecto de test). 27/27 tests PASS tras el fix, `pnpm typecheck`/`pnpm lint` limpios.
- **Hallazgo nuevo, no anticipado por el plan original**: existe un **tercer sistema paralelo y activo** para categorías/niveles de España, independiente de `sport-config`: `src/db/schema/templates/*` + `src/db/seeds/templates/espana-ga.ts`/`espana-gr.ts` (sembrado manual vía `pnpm db:seed` → `scripts/seed.ts`), consumido en vivo por `src/lib/athletes/age-category.ts` → `src/app/api/athletes/route.ts`. Ese seed está comentado en el propio código como "normativa RFEG 2022-2024" y asume (incorrectamente, según los PDFs de hoy) que GAF y GR comparten las mismas categorías de edad. Documentado en detalle en `Normativa RFEG 2025-2026 - borrador.md`. **No se tocó** — es alcance de arquitectura para decidir antes de la Fase 2 (cuál de los 3 sistemas — `sport-config`, `templates`, o las constantes hardcodeadas de `athlete-edit.ts`/`GymMetricsWidget.tsx` — es la fuente única de verdad a futuro).
- **No ejecutado / pendiente**: no se corrió ningún seed contra DB real (ni `seedSportConfigurations()` ni `pnpm db:seed`). Sigue pendiente confirmar el programa Base de GR (Base 1-N, si existe) contra fuente primaria.
- Vault: actualizada `Normativa RFEG 2025-2026 - borrador.md` (sección de confirmación + hallazgo del tercer sistema), `Changelog interno.md` (esta entrada). Backlog: fila 3.9 actualizada con el estado de cierre de Fase 0.

## 2026-07-12 (noche) - Vía Olímpica GAM confirmada, Fase 0 prácticamente cerrada

- El usuario compartió una carpeta adicional (`documentos normativos por pais/España/`) con 6 PDFs oficiales más de la RFEG 2026, incluyendo `NORMATIVA-TECNICA-GENERAL_GAM_2026.pdf` — el documento que faltaba para confirmar la Vía Olímpica de GAM (el PDF leído antes solo cubría el programa Base).
- **GAM Vía Olímpica confirmada**: 8 categorías (Benjamín 7-9 años, Alevín ≤11, Infantil ≤13, Cadete ≤15, Juvenil ≤17, Sénior 16+, Júnior 15-18, Sénior Élite 18+) — estructura distinta a las 10 categorías de GAF (GAM tiene "Cadete", GAF no; GAF tiene variantes "Pre-", GAM no). Aplicado a `src/lib/sport-config/catalog.ts` (`GAM_AGE_CATEGORIES` ahora tiene 8 entradas reales en vez de las 5 categorías Base que tenía provisionalmente; `GAM_ARTISTIC_PROGRAMS`/`GAM_ARTISTIC_LEVELS` ahora incluyen tanto Base (5) como Vía Olímpica (8), igual que GAF).
- **Cross-check de GAF**: `NORMATIVA-TECNICA_GAF_2026.pdf` (documento distinto al ya leído) repite la misma tabla de Vía Olímpica de GAF con edades idénticas — confirmación cruzada entre 2 fuentes oficiales independientes, máxima confianza para ese dato.
- **Test nuevo añadido**: `tests/lib/sport-config-catalog.test.ts` — "reflects the real RFEG 2026 level/category structure per branch", verifica los conteos exactos (GAF 10+10, GAM 5+8, GR 9 categorías) y que GAF/GAM nunca compartan la misma lista de niveles. 9/9 tests del archivo PASS, `pnpm typecheck` limpio.
- **Sigue pendiente** (no crítico, alcance menor): el programa/niveles Base de GR (el documento `NORMATIVA-TECNICA-GR-2026.pdf` cubre competición individual, no el nivel Base) — hay un PDF "Listado ascensos Nivel Base" sin leer. La modelación de "aparatos distintos por categoría" en GR (Benjamín solo 2 aparatos, Sénior 3, 1ª Categoría los 4) sigue como simplificación conocida no corregida (requiere evaluar cambio de schema).
- No se leyeron los PDFs de Liga Iberdrola (GAF/GR) ni el Reglamento General de Competiciones de esta carpeta — son normativa de competición/liga de clubes, no afectan nomenclatura de niveles/categorías, quedan disponibles para cuando se aborde esa parte del producto (si aplica).
- Vault: actualizada `Normativa RFEG 2025-2026 - borrador.md` (GAM ya CONFIRMADO, cross-check GAF), `Changelog interno.md` (esta entrada). Backlog: no requiere cambio adicional a la fila 3.9 (el estado ya reflejaba "GAF/GAM/GR" en progreso con detalle).

## 2026-07-12 (noche) - Eliminado el cálculo muerto de `ageCategory`/`templateId` en creación de atletas

- **Revisión del tercer sistema paralelo** (`templates`/`espana-ga.ts`/`espana-gr.ts`) encontrado antes: se confirmó que `programCode`/`levelCode`/`categoryCode` (los campos reales, validados contra `academySportConfigs` via `isProgramCodeAllowed`/etc. en `src/app/api/athletes/route.ts`) YA son la fuente de verdad funcional para nivel/categoría de un atleta — el formulario `EditAthleteDialog.tsx`/`AthleteLevelForm.tsx` ya saca sus opciones dinámicamente de `sport-config`, así que las correcciones de datos de hoy (GAF/GAM/GR reales) ya se reflejan ahí sin tocar nada más.
- **El campo `ageCategory`/`templateId` (calculado desde `templates` por fecha de nacimiento) resultó ser código muerto en la práctica**: se rastreó cada referencia en el código — se escribe al crear un atleta, se transporta en tipos y selects de `coach/page.tsx` y `/api/coaches/[coachId]/athletes`, pero **nunca se renderiza en ningún JSX real**. El único componente que lo mostraba, `AthleteProfileHeader.tsx`, no está importado por ningún otro archivo del proyecto — está huérfano, inalcanzable.
- **Fix aplicado**: `src/app/api/athletes/route.ts` ya no llama a `calculateAgeCategoryForAthlete()` ni hace el `SELECT` extra a `academies` que solo existía para alimentarlo, ni escribe `templateId`/`ageCategory` al crear un atleta (import de `calculateAgeCategoryForAthlete` eliminado). Esto ahorra 1-2 queries por creación de atleta y deja de escribir un dato calculado con normativa desactualizada (2022-2024) que además asumía incorrectamente que GAF y GR comparten categorías de edad.
- **No se tocó** (deliberado, fuera de alcance de este fix puntual): el schema `templates`/`templateAgeCategories`/etc., los seeds `espana-ga.ts`/`espana-gr.ts`/`espana-ga-elements.ts`/`espana-gr-elements.ts` (podrían sembrar otras cosas no relacionadas con `ageCategory`, no se auditaron a fondo), ni el componente huérfano `AthleteProfileHeader.tsx`. Quedan como deuda de limpieza menor, no urgente — no afectan a ningún usuario real hoy.
- **Validado**: `pnpm typecheck` y `pnpm lint` limpios tras el cambio. `tests/api-athletes.test.ts` está excluido de la config de vitest (requiere entorno con DB real, igual que `api-athletes.test.ts`/`api-academies.test.ts` ya documentado antes) — no se pudo correr en este entorno; se verificó manualmente que no queda ninguna referencia a `ageCategory`/`templateId` en el archivo modificado.
- Vault: `Changelog interno.md` (esta entrada). No requiere cambio en Backlog priorizado (no era un ítem del backlog, fue un fix puntual dentro de la revisión de la fila 3.9).

## 2026-07-12 (noche) - Arranca Fase 2: unificación de terminología + sidebar completo

- **Fase 2.1 (unificación)**: `DEFAULT_TERMINOLOGY` (`src/lib/sport-config/terminology.ts`) ya no es un objeto propio con valores distintos a `BASE_TERMINOLOGY` (`sport-config/catalog.ts`, ahora exportado) — antes divergían en el mismo concepto (ej. "Atleta" vs "Gimnasta"), lo que hacía que el fallback "sin config de deporte" (usado en `GenerateChargesDialog.tsx`, `ScholarshipForm.tsx`, `ScholarshipList.tsx` cuando no reciben `terminology` por prop) mostrara un vocabulario distinto al de cualquier academia real ya configurada. Ahora `DEFAULT_TERMINOLOGY = BASE_TERMINOLOGY` (una sola fuente). Test actualizado en `tests/lib/sport-config-terminology.test.ts` para reflejar "Gimnasta" como el fallback correcto (coherente con el 100% de las configs reales de España).
- **Fase 2.2 (sidebar)**: `getSpecializedNavigationLabel()` (`src/lib/specialization/registry.ts`) ahora traduce también `coaches` y `groups` (antes solo `athletes`/`classes`), usando un helper nuevo `pluralizeFirstWord()` que pluraliza solo la primera palabra de la etiqueta (evita el bug que habría introducido un "+s" ciego sobre labels compuestas como "Grupo de entrenamiento" → habría dado "Grupo de entrenamientos" en vez de "Grupos de entrenamiento"). El resto de claves de navegación (events, assessments, messages, notifications, announcements, reports, billing, settings, dashboard, my-dashboard) se dejaron **deliberadamente sin traducir**: son conceptos de producto genéricos sin campo equivalente en `SpecializedLabels`, y forzar una traducción (ej. "Eventos" → "Competiciones") sería incorrecto porque esa sección ya mezcla competiciones con actividad no competitiva a propósito. No es una laguna pendiente, es una decisión de alcance documentada en el propio código.
- **Tests añadidos**: `tests/academy-specialization.test.ts` — 2 casos nuevos (rítmica: "Entrenadoras"/"Grupos de entrenamiento", pluralización con vocal final; artística masculina: "Entrenadores"/"Grupos", pluralización con consonante final) más una aserción de que las claves genéricas (billing/settings) mantienen su label por defecto.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. 33/33 tests PASS (7 archivos: sport-config-catalog, sport-config-terminology, academy-specialization, api-academy-settings-sport-config, api-billing-sport-filters, api-charges-sport-config, api-financial-reports-sport-config).
- **Sigue pendiente de la Fase 2** (próxima sesión): hook único `use-sport-terminology.ts`, auditoría del dashboard (ya parcialmente conectado), y los módulos con mayor densidad de texto hardcodeado (athletes/classes/events/groups/assessments — incluye finalmente eliminar el catálogo legacy paralelo de `athlete-edit.ts` `CATEGORY_OPTIONS`/`LEVEL_OPTIONS`, que hoy casi nunca se activa pero sigue existiendo).
- Vault: `Changelog interno.md` (esta entrada). Backlog: no requiere cambio (la fila 3.9 ya cubre "Fase 2 pendiente" en términos generales).

## 2026-07-12 - Sprint 0 de producto real: seguridad, contratos y release gate

- Corregido `middleware.ts`: el rate limit ya no devuelve 429 incondicional; propaga headers cuando permite, bloquea solo al superar limite y localiza unicamente rutas que tienen handler localizado. `/pricing`, `/app/*` y otras rutas reales dejan de redirigirse a variantes inexistentes.
- Cerrado aislamiento tenant: `admin` global ya no es cross-tenant; `academyId` se resuelve mediante `academies.owner_id` o `memberships`, con 403 explicito en `withTenant` y `withBearerTenant` cuando no existe acceso.
- PWA endurecida: SW v2 no cachea APIs ni HTML privado, purga caches antiguos y elimina background sync; la cola de mutaciones offline queda deshabilitada hasta disenar idempotencia/conflictos. Manifest deja de anunciar shortcuts legacy y `/api/share` inexistente.
- Catalogo v3.0 unificado con la decision activa: `free`=Free, `pro`=Starter 19/75, `premium`=Growth 49/200; Network 99 es `network` comercial, multi-sede acompanada y sin checkout. Limites, seed, pricing, billing y upsells consumen el mismo contrato.
- Navegacion y layout consumen membership efectiva: owner/coach/viewer ya no heredan privilegios de un rol global ajeno a la academia; familias conservan solo `my-dashboard`, mensajes y avisos.
- Auditorias: 2 stubs raiz clasificados como deprecated; auditoria API estricta queda en 0 mutaciones desconocidas. RLS valida duplicados por fuente (snapshot e historial no se confunden). Migraciones valida 3 Drizzle + 26 Supabase.
- `verify:production` reemplazado por gate real: preflight, 272 APIs, RLS, migraciones, typecheck, lint, Vitest y build. `.env.example` documenta secretos JWT/Auth internos y KV necesarios sin incluir valores reales.
- Copy publico corregido: sin “100% seguro”, RGPD garantizado, puesta en marcha en 2h ni descuento anual calculado. Free lleva a registro; planes pagados a demo; Network a onboarding.
- Hallazgo E2E y fix adicional: antes de hidratar React, contacto podia caer en submit GET y poner datos personales en URL. El boton espera hidratacion; E2E publico Chromium 6/6.
- Validacion final: `verify:production` PASS; 48 archivos/407 tests PASS; build PASS 213 paginas; E2E publico Chromium 6/6. Warnings residuales: opciones Sentry deprecadas, dependencia dinamica swagger-jsdoc y dashboard 621 kB First Load JS.
- No se aplicaron migraciones ni seeds a Supabase. No se hizo deploy, commit ni push.
- Trabajo paralelo de nomenclatura deportiva preservado; el cambio de `src/app/api/athletes/route.ts` se integro en una seccion distinta sin revertir la eliminacion de `ageCategory`/`templateId`.
- Vault: actualizadas `Estado actual de Zaltyko`, `Arquitectura`, `Runbook migraciones`, `Pricing`, `Mensajes aprobados`, `Registro de riesgos`, `Backlog priorizado`, `Decisiones` y `Changelog interno`.

## 2026-07-12 - Cierre federativo antes de Fase 1: RFEG v2 sincronizado en Supabase

- Se releyo el trabajo paralelo de nomenclatura y se contrastaron directamente los seis PDF
  oficiales locales con `pdftotext`: GAF VO 1-10, GAM 8 categorias de campeonato y las nueve
  categorias individuales GR coinciden con `catalog.ts`. Base GR sigue explicitamente sin
  confirmar; no se inventaron datos.
- Se detecto que el seed idempotente hacia upsert pero dejaba activos los codigos retirados.
  `seedSportConfigurations()` ahora desactiva programas, niveles, categorias y tipos de
  competicion ausentes del catalogo vigente, sin borrar historia.
- Los catalogos espanoles pasan a `rfeg-2026-v2`. Se anadio
  `pnpm db:sync-sport-configs`, con dry-run por defecto, bloqueo si una academia conserva
  selecciones retiradas y `--apply` explicito.
- Supabase verificado en PostgreSQL 17.6. Dry-run: una academia, seleccion `via_olimpica`
  valida y cero mapeos manuales. Aplicacion: siete configuraciones sincronizadas (tres RFEG y
  cuatro fallbacks genericos), metadata de una academia actualizada. Segundo dry-run: cero
  diferencias. No hubo migracion de schema ni se ejecuto el seed global.
- Los documentos oficiales quedan preservados bajo `documentos normativos por pais/España/`;
  artefactos locales de herramientas, capturas y prompts permanecen fuera de Git.
- Vault: actualizados `Runbook migraciones`, `Backlog priorizado`, `Changelog interno` y la
  nota normativa.

## 2026-07-12 (noche) - Fase 2.3: hook único `use-sport-terminology`

- `AcademySpecializationContext`/`SpecializationRegistryEntry` (`src/lib/specialization/registry.ts`) ganan un campo `terminology: SportTerminology`, derivado del mismo seed (`config.terminology` en el REGISTRY, `BASE_TERMINOLOGY` en `DEFAULT_ENTRY` — reutiliza la unificación de la Fase 2.1, no un tercer valor). Antes el contexto de especialización solo exponía `labels` (frases compuestas); ahora también expone el diccionario simple palabra-por-palabra sin necesitar un fetch adicional.
- Nuevo `src/hooks/use-sport-terminology.ts`: hook por defecto para componentes nuevos — `const t = useSportTerminology()` da acceso a `t.athlete`, `t.coach`, `t.labels.dashboardHeadline`, etc., derivado de `useAcademyContext().specialization`. Documentado explícitamente que NO refleja `terminologyOverrides` por academia (eso lo siguen resolviendo los componentes que ya reciben `sportConfigs` por props, como `EditAthleteDialog.tsx`, vía `getTerminology()` directo) — este hook es el default de disciplina/país, para componentes que hoy no tienen esa data ya resuelta.
- **Validado**: el cambio se mantuvo separado del trabajo concurrente de billing/trial y no alteró sus archivos. La validación integrada posterior deja `pnpm typecheck` limpio. 27/27 tests relevantes PASS en la comprobación original.
- Vault: `Changelog interno.md` (esta entrada).

## 2026-07-12 - Fase 1: trial, Stripe y permisos listos para promoción

- Trial Starter de 7 días sin tarjeta persistido por academia, con una activación cada 365 días, expiración a Free, conversión al contratar y avisos del día 5/fin. Nuevo endpoint owner-only y cron diario; la lectura lazy también corrige expiraciones.
- Checkout, portal, estado, historial y sync de suscripción quedan limitados al owner/super-admin. Checkout usa metadata explícita de academia e idempotencia; bloquea una segunda suscripción activa. Los endpoints manuales legacy responden 410.
- Webhooks Stripe ahora registran cada evento antes de procesar, permiten reintento tras error/lease vencido y rechazan snapshots anteriores. La suscripción se actualiza bajo lock transaccional; contexto e invoices exigen academia+tenant coherentes.
- CRUD real de roles personalizados: crear/editar/borrar, herencia sin ciclos, asignar/quitar miembros y permisos por módulo. La matriz de rutas críticas se integra en `withTenant`/`withBearerTenant`; billing de suscripción permanece owner-only.
- Supabase: aplicada y verificada `20260712230000_phase1_trial_and_billing_events.sql`; 27 migraciones Supabase, RLS 64/64. No se ejecutó el seed global. `db:generate` se canceló sin escribir por drift histórico no relacionado, registrado en backlog.
- Planes DB sincronizados sin diferencias; productos/prices Stripe live conservan 19/49 EUR y usan nombres/metadata Starter/Growth. Secrets de cron/webhook rotados en Vercel sin exponer valores; endpoint anterior de Stripe se conserva solo hasta el smoke de producción.
- Gate final local verde: auditoría estricta 275 APIs y 0 mutaciones riesgosas, RLS 64/64, 3+27 migraciones, typecheck, lint, 49 archivos/413 tests y build de 214 páginas. El gate limita Vitest a 4 workers para evitar timeouts falsos por saturación; conserva timeouts por test.
- Cambios paralelos de nomenclatura preservados: hook único y KPI sport-aware permanecen intactos y se validarán/commitearán por separado.

## 2026-07-13 - Fase 2: auditoría del dashboard, primer fix (`KPISection.tsx`)

- Auditoría acotada de `src/components/dashboard/` (grep de "Atleta"/"Gimnasta" hardcodeado en los ~35 archivos del directorio): 3 hallazgos.
  - `KPISection.tsx` (tarjetas KPI del dashboard) — **arreglado**: títulos "Atletas"/"Entrenadores" hardcodeados pese a que el componente ya recibía `labels` (`SpecializedLabels` completo) como prop desde `DashboardPage.tsx` sin usarlos para esas dos tarjetas. Además, la tarjeta de grupos ya usaba `labels.groupLabel` pero con el mismo bug de pluralización ciega (`${label}s`) que ya se había corregido en el sidebar — para Rítmica habría mostrado "Grupo de entrenamientos" en vez de "Grupos de entrenamiento". Las 3 tarjetas ahora usan `labels.athletesPlural` y `pluralizeFirstWord(labels.coachLabel / labels.groupLabel)`.
  - `pluralizeFirstWord()` (antes privada en `specialization/registry.ts`, usada solo por el sidebar) pasa a exportarse para reutilizarse aquí — evita reimplementar la misma lógica de pluralización en cada componente.
  - `AdvancedMetrics.tsx` ("Atletas activos" hardcodeado) — **no tocado**: el componente está completamente huérfano, no lo importa ningún otro archivo del proyecto. Mismo patrón que `AthleteProfileHeader.tsx` encontrado antes. Deuda de limpieza menor, no urgente.
  - `QuickPaymentModal.tsx` (`charge.athleteName || "Atleta"`) — **no tocado a propósito**: es un fallback de bajísima visibilidad para cuando falta el nombre del atleta en un cargo, no vale la pena enhebrar `labels` a través del modal para ese caso extremo.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. No existe harness de test de componentes React en este proyecto (solo tests de API/lib) — no se añadió test dedicado a `KPISection.tsx`; la corrección se apoya en `pluralizeFirstWord()`, que ya tiene cobertura en `tests/academy-specialization.test.ts`.
- **Alcance restante de la auditoría de dashboard**: no se revisaron a fondo los ~30 archivos restantes del directorio (solo se grepeó por el patrón "Atleta"/"Gimnasta" literal, que no detecta términos ya abstraídos incorrectamente de otras formas, ej. "Grupo"/"Equipo" sueltos). Queda pendiente una pasada más completa si se decide seguir invirtiendo aquí.
- Vault: `Changelog interno.md` (esta entrada).

## 2026-07-13 - Fase 2: módulos athletes/classes/events/groups/assessments conectados a terminología

- Auditoría de los 27 archivos de `src/components/{athletes,classes,events,groups,assessments}/` con menciones de "atleta"/"entrenador"/"gimnasta" (grep case-insensitive; una primera pasada con `\b` dio falsos negativos en plurales como "entrenadores" — corregido a mitad de la auditoría, ver más abajo).
- **Módulo `groups` completado al 100%** (5/5 archivos): `GroupView.tsx`, `UpdateGroupCoachesDialog.tsx`, `UpdateGroupMembersDialog.tsx`, `EditGroupDialog.tsx`, `GroupsDashboard.tsx`. `pluralizeFirstWord()` (creado para el sidebar en la sesión anterior) se reutiliza aquí en vez de reimplementar sufijos ad-hoc.
- **Módulo `athletes`**: 8 archivos arreglados (`DocumentUploadModal.tsx`, `CreateExtraClassDialog.tsx`, `AthletesKanbanView.tsx`, `AthleteAccountSection.tsx`, `AthleteClassesSection.tsx`, `AthleteBaseClassesSection.tsx`, `AthleteExtraClassesSection.tsx`, `guardians/GuardiansSection.tsx`, `AthletesTableSections.tsx` — este último ya recibía `terms` como prop, solo faltaba aplicarlo en 2 sitios).
- **Módulo `events`**: `InvitationCard.tsx` arreglado (distingue invitación de atleta vs guardián).
- **Módulo `assessments`**: `AthleteEvaluationsTab.tsx`, `AssessmentTypeSelector.tsx` (constante de nivel de módulo convertida en función que recibe el término), `AssessmentPDFExport.tsx`.
- **Patrón recurrente encontrado**: varios componentes (`AthleteBasicInfoForm.tsx`, `AthleteHistoryView.tsx`, `AddAthleteToClassDialog.tsx`) ya tenían un prop `athleteLabel`/`athletesLabel` con default hardcodeado ("atleta") — pero el caller real (`EditAthleteDialog.tsx`, `ClassDetailView.tsx`, páginas de historial) YA pasa el valor correcto de `terms`/`specialization`. Estos no se tocaron, el default nunca se ve en producción real.
- **Código muerto encontrado, no tocado** (mismo patrón que `AthleteProfileHeader.tsx` de sesiones anteriores): `EnrollmentManager.tsx` y `EventRegistrationsPanel.tsx` no los importa ningún otro archivo del proyecto — huérfanos, inalcanzables.
- **Decisión deliberada de no tocar** `AssessmentsClientView.tsx` y `ImportExportPanel.tsx`: ambos pueden renderizar sin `academyId`/fuera del árbol de `AcademyProvider` (vistas legacy multi-academia / herramienta a nivel de tenant) — forzar `useAcademyContext()` ahí rompería esos casos en vez de arreglarlos.
- **Corrección de metodología a mitad de la auditoría**: la primera verificación de "archivo limpio" usaba `grep -i "entrenador\b"`, cuyo `\b` no matchea el plural "entrenadores" (no hay límite de palabra entre "r" y "e"). Esto dejó pasar 3 menciones sin arreglar en `GroupView.tsx` que se creían ya cerradas; se detectaron y corrigieron en una segunda pasada sin `\b`. Repetir esta verificación sin `\b` si se continúa esta auditoría en otros módulos.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. 33/33 tests relevantes PASS (sport-config-catalog, sport-config-terminology, academy-specialization, api-academy-settings-sport-config, api-billing-sport-filters, api-charges-sport-config, api-financial-reports-sport-config).
- **Sigue pendiente**: `classes` module solo tiene código muerto/ya-resuelto (nada más que hacer ahí salvo que aparezca un componente nuevo); no se auditó el resto del árbol de `src/components/` fuera de estos 5 directorios y `dashboard/` (billing, reports, coaches — menor prioridad según el plan original).
- Vault: `Changelog interno.md` (esta entrada).

## 2026-07-13 - Fase 2 cerrada: billing/reports/coaches + hallazgo de copy de pricing inconsistente

- Auditoría de los 16 archivos restantes en `src/components/{billing,reports,coaches}/`.
- **Hallazgo real en `billing`, no solo cosmético**: el copy de límites de plan usaba "atletas" en 4 sitios (`PlanSelector.tsx`, `BillingSummary.tsx` x2, `DowngradeModal.tsx`, `PlanComparison.tsx`) mientras el resto del módulo (y el propio `Pricing.md`/`Decisiones.md`/`Mensajes aprobados.md` del vault) usa consistentemente **"gimnastas"** como término aprobado para los límites de plan ("Free hasta 30 gimnastas", decisión de negocio explícita, no un label de UI que deba variar por disciplina). Se corrigieron esos 4 sitios a "gimnastas" — **esto NO se conectó a `useAcademyContext()`**, es copy comercial fijo aprobado, a propósito distinto del resto de la Fase 2 (que sí usa terminología dinámica por disciplina/país). Ver `Security`/reglas del proyecto: no tocar pricing sin alinear con esos documentos — se verificó primero, no se asumió.
- **`reports`**: `ProgressReport.tsx` (ya tenía `specialization`, solo faltaba 1 mensaje de error), `FinancialReport.tsx`, `ChurnReport.tsx`, `ScheduledReports.tsx` (el label de tipo de informe "Entrenadores" ahora usa `pluralizeFirstWord(coachLabel)`). `CoachReport.tsx`: los nombres de archivo descargados (`reporte-entrenadores-*.pdf`) se dejaron sin tocar a propósito — es un slug técnico, no prosa, y el riesgo de romper el nombre de archivo con un término que tenga espacios/acentos no compensa el beneficio.
- **`coaches`**: `CertificationsSection.tsx`, `CoachNotesManager.tsx`, `NoteForm.tsx`, `CoachTodayView.tsx` conectados. `CoachAssignmentsPanel.tsx` confirmado huérfano (nadie lo importa) — mismo patrón que los demás componentes muertos encontrados en esta Fase 2, no tocado.
- **Con esto se completó el barrido de todo `src/components/` señalado por el plan original** (athletes, classes, events, groups, assessments, dashboard, billing, reports, coaches). No se auditaron otros directorios de `src/components/` fuera de estos 9 (ej. `super-admin/`, `provider/`, `public/`) — quedan fuera del alcance original de la Fase 2, que se centraba en el panel de la academia.
- **Validado**: `pnpm typecheck`/`pnpm lint` limpios. 33/33 tests relevantes PASS.
- **Fase 2 se da por cerrada** en su alcance original. Queda pendiente, fuera de esta fase: decidir qué hacer con el sistema paralelo `templates` (ver hallazgo de sesiones anteriores) y unificar `COUNTRY_NAME_BY_CODE`/`COUNTRY_CODE_BY_NAME` (`specialization/registry.ts`, hoy solo ES/MX/AR hardcodeados) con `countryRegions.ts` antes de agregar el primer país nuevo en la Fase 3.
- Vault: `Changelog interno.md` (esta entrada). Backlog: pendiente marcar fila 3.9 como Fase 2 completa (siguiente paso).

## 2026-07-13 - Fase 3 arrancada: unificación de mapas de país + investigación de México bloqueada por intranet

- **Prerequisito resuelto**: `COUNTRY_NAME_BY_CODE`/`COUNTRY_CODE_BY_NAME` (`src/lib/specialization/registry.ts`) ya no son una tercera lista paralela solo-ES/MX/AR — se derivan de `countryRegions.ts` (los ~20 países hispanohablantes que el resto del producto ya soporta en selects de país/región). `getCountryNameFromCode("DO")` antes devolvía literalmente `"DO"`, ahora devuelve `"República Dominicana"`. Tolerancia a texto con/sin acentos preservada (`stripDiacritics` genérico en vez de los 2 casos hardcodeados que había). Test nuevo en `academy-specialization.test.ts` cubre esto. `pnpm typecheck`/`pnpm lint` limpios, 11/11 tests del archivo PASS.
- **Documento nuevo**: `vault/00-Inicio/Patron para agregar pais federativo nuevo.md` — checklist repetible de 7 pasos derivado de la experiencia real cerrando España, para que agregar cualquier país futuro no dependa de releer todo el historial de Changelog.
- **Investigación de México (candidato siguiente, sin confirmar aún)**: confirmado que `fmgimnasia.org` es el sitio real de la Federación Mexicana de Gimnasia (verificado: clasificación a París 2024, estados afiliados, contacto `.org.mx`). **Confirmada en la práctica la trampa de dominio ya anticipada**: `fmgimnasia.com` es la Federación **Madrileña** de Gimnasia (España) — una búsqueda genérica devolvió sus PDFs "normativa FMG 2026" presentándolos como si fueran mexicanos.
- **Bloqueado**: la FMG no publica su normativa técnica (niveles/edades/categorías) en el sitio público — vive detrás de un intranet de afiliados (`intranet.fmgimnasia.org`, requiere login). A diferencia de la RFEG (normativa pública, solo bloqueada por CAPTCHA para descarga automatizada), aquí no hay ninguna versión pública accesible. No se intentó acceder sin credenciales.
- **No se tocó `catalog.ts`** — no hay ningún dato de México confirmado que agregar todavía. Se le preguntó al usuario cómo proceder (¿tiene contacto/documento de la FMG, o prefiere otro país como siguiente candidato?).
- Vault: `Patron para agregar pais federativo nuevo.md` (nuevo, con el hallazgo del intranet), `Changelog interno.md` (esta entrada).

## 2026-07-13 - Cierre productivo de Fase 1 y Fase 2 de roles/comunicación

- **Drift DB/ORM cerrado**: creada, inspeccionada, aplicada y verificada `20260713090000_reconcile_phase1_schema_drift.sql`; `push_tokens` queda materializada, las FKs de perfiles y los índices únicos coinciden con Drizzle. Inventario final: 113 tablas, 4 migraciones Drizzle + 28 Supabase y RLS 64/64. Se ejecutó rollback smoke y no se usó el seed global.
- **Stripe productivo**: rotación completada a un único endpoint activo; webhook sin firma sigue fallando cerrado. La migración de Fase 1 y los contratos de trial/billing/permisos quedan operativos.
- **Portal familiar limitado**: `my-dashboard` acota todas las lecturas por tenant, academia y relaciones autorizadas; corrige el join de coach y elimina enlaces a superficies administrativas o WhatsApp. Si no hay personas vinculadas, presenta un estado útil con acceso a mensajería interna.
- **Comunicación desde la clase**: nueva API `POST /api/messages/group-alert`, protegida con `withTenant`, Zod, scope de coach por clase y rate-limit 10/min. Solo notifica cuentas de familia/gimnasta vinculadas a inscritos; reutiliza una conversación contextual por sesión y no crea historial vacío cuando faltan destinatarios.
- **UI y preferencias**: `TodayQuickActions` quedó integrado en el dashboard de entrenador; mensajes aceptan contexto de sesión y muestran compositor accesible. Preferencias de notificación alineadas al envelope estándar, merge anidado correcto y etiquetas accesibles; avisos de grupo enlazan al historial interno. WhatsApp permanece oculto por feature flag.
- **Auditoría owner**: dashboard, mensajes y preferencias cargan con el flujo dev opt-in. Se corrigieron pluralización, terminología por deporte y sesiones sin fecha. El portal familiar redirige correctamente al owner; falta una sesión humana con credencial parent/athlete real vinculada.
- **Gate completo**: 276 APIs auditadas sin rutas riesgosas, TypeScript y lint limpios, 422/422 tests (51 archivos), build Next.js de 214 páginas. Persisten advertencias no bloqueantes ya registradas de Sentry y `swagger-jsdoc`.
- Vault: `Estado actual de Zaltyko`, `Plan operativo gimnasia`, `Runbook migraciones`, `Registro de riesgos`, `Backlog priorizado`, `Decisiones` y este changelog.

## 2026-07-13 - Cierre de dependencias y deployment definitivo de Fase 2

- El aviso de Dependabot de la rama por defecto se contrastó contra el lockfile actual. La auditoría inicial de esta rama mostró un moderado de esbuild y dos bajos de webpack en producción, además de Vitest/Vite críticos/altos en desarrollo.
- `drizzle-kit` pasó de dependencia runtime a desarrollo; se materializó webpack corregido y se actualizaron Vite a 6.4.3 y Vitest/coverage a 3.2.6. Drizzle CLI sigue operativo.
- Resultado final: `pnpm audit --prod` y `pnpm audit` completo con 0 vulnerabilidades; gate con 276 APIs, RLS 64/64, migraciones 4+28, 422/422 tests y build de 214 páginas.
- Deployment limpio `dpl_AYKBXmfi88CK2MeqWvZMqKjo3Bee` desde `47228ee5`, `READY` y aliasado a `zaltyko.com`. Smokes finales: pricing 200, privado 307, APIs privadas/cron 401 y webhook sin firma 400.

## 2026-07-13 - Fase 3 cerrada y desplegada: cockpit de clase de hoy

- **Una sola superficie de trabajo**: nueva ruta `/app/[academyId]/coach/today/[sessionId]` con cabecera contextual, estado 0/3–3/3 y tabs de asistencia, progreso y aviso. Dashboard, acciones rápidas y vista diaria de coach apuntan al mismo workspace.
- **Asistencia operativa**: acción masiva “todas presentes”, excepciones, notas y búsqueda. GET/POST validan tenant, academia, sesión y clase asignada; un coach ya no puede listar toda la asistencia de la academia sin `sessionId`.
- **Progreso con trazabilidad**: `athlete_assessments.session_id` conserva la sesión de origen; la API comprueba que la gimnasta pertenece a la clase, que modalidad/aparato son compatibles y deriva `assessedBy` del perfil autenticado. El cliente no envía `coachId`.
- **Modelo de miembros corregido**: `getClassAthletes` combina `classes.groupId`, `class_groups`, `group_athletes`, el vínculo legacy `athletes.groupId` y matrículas extra, siempre acotado por tenant/academia y sin borrados lógicos.
- **Migración**: Drizzle `0004_link_assessments_to_sessions.sql` y Supabase `20260713150000_link_assessments_to_class_sessions.sql`, aditivas y nullable con FK `ON DELETE SET NULL` e índice. Aplicada a PostgreSQL 17.6, rollback smoke y verificación de columna/FK/índice correctos. No se ejecutó seed global.
- **QA real**: storage state de coach y fixture temporal en la academia demo. Se persistieron 5 asistencias con una excepción tarde, una evaluación ligada a sesión+coach y un aviso con historial; después se purgaron sesión, atletas, vínculos, conversación, notificaciones y registros, verificando cero restos.
- **Accesibilidad y responsive**: Playwright autenticado 2/2; axe WCAG A/AA/2.2 AA sin violaciones tras corregir un contraste 4,43:1; viewport 375×667 sin overflow. La prueba queda parametrizada por `E2E_ACADEMY_ID`, `E2E_COACH_SESSION_ID` y storage state.
- **Integración paralela preservada**: se mergeó `bd2bb95a`, incluyendo terminología federativa en atletas, grupos, cobros, reportes y coaches. `CoachTodayView` conserva tanto sus labels sport-aware como el enlace al nuevo cockpit.
- **Gate integrado**: 276 APIs sin rutas riesgosas, RLS 64/64, 5 Drizzle + 29 Supabase, TypeScript/lint limpios, 425/425 pruebas, build de 214 páginas y `pnpm audit` con 0 vulnerabilidades.
- **Publicación**: commit funcional `9da6f020`, merge integrado `0a023880`, rama `codex/phase3-coach-today` y PR borrador #27. Deployment `dpl_68XGuYVFtQnrLbjWjhv17NtMpxH8` `READY`, alias `zaltyko.com`; smokes pricing 200, workspace privado 307 y APIs privadas 401. Escaneo de errores del deployment sin hallazgos.
