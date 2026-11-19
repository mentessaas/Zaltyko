# Revisión estática de cierre Owner — 2026-11-04

## Alcance y estado

- Checkout: `/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025`
- Rama: `codex/mvp-main-bridge-20261025`
- HEAD revisado: `2599bf89b3842f9780d9839df40250e64542f27c`
- Revisión estática de signup, alta de academia, operaciones esenciales Owner y claims de lanzamiento. No se ejecutaron pruebas, navegador, CI, builds, servicios ni llamadas remotas.
- Se conservaron los cambios locales preexistentes de legal, vault y demás archivos sin seguimiento. La única modificación de producto de esta revisión es el copy de `src/app/(site)/onboarding/parent/page.tsx`; quedó sin commit.

## Hallazgos

### P0/P1 — Sin bloqueos estáticos demostrados en el flujo esencial Owner

El recorrido está conectado en el código: el alta Owner configura el callback para continuar por `/auth/redirect` (`src/components/RegisterForm.tsx:218-235`); `resolveUserEntry` conduce la cuenta nueva con rol Owner a `/owner/setup` (`src/lib/auth/resolve-user-entry.ts:64-72`); la página comprueba autenticación, evita duplicar una academia anterior y presenta el formulario (`src/app/owner/setup/page.tsx:17-23, 25-77, 91-108`). El formulario conserva body y clave de idempotencia cuando el resultado es incierto y, al recibir un recibo válido, dirige al dashboard (`src/components/owner-dashboard/OwnerSetupForm.tsx:38-86, 89-135`). La ruta de bootstrap valida la sesión, registra el consentimiento y ejecuta `bootstrapOrganization` (`src/app/api/v1/organizations/bootstrap/route.ts:29-72, 93-116`).

También existen páginas y endpoints Owner para grupos, clases, inscripciones y asistencia. Esto acredita presencia y conexión estática de las piezas; no demuestra que la secuencia funcione en runtime.

La ficha pública esencial describe pagos familiares manuales y dice expresamente que no inicia cargos automáticos (`src/lib/launch/essential-public-catalog.ts:19-22, 30-35`). El contenido antiguo bajo `/modules` se redirige a `/features` (`src/app/(site)/modules/layout.tsx:1-5`), así que no lo conté como claim activo.

### P2 — Claim de portal identificado en HEAD y corregido localmente

En el HEAD base `2599bf89b3842f9780d9839df40250e64542f27c`, `src/app/(site)/onboarding/parent/page.tsx:122-146` prometía seguimiento “en tiempo real” de progreso, evaluaciones, asistencia, eventos, calendario y alertas. El flujo de registro de ese rol apunta a `/onboarding/parent` (`src/lib/auth/registration-paths.ts:14-17`; `src/lib/auth/resolve-user-entry.ts:98-106`). La copia pública esencial se limita a la asociación de familias (`src/lib/launch/essential-public-catalog.ts:2-7`) y la ruta no aparece en el sitemap esencial (`src/app/sitemap.ts:5-23`).

**Corrección aplicada en el árbol de trabajo:** sustituí esas promesas por copy sobre asociación de la cuenta, datos disponibles y permisos que habilite la academia; las cuatro preferencias quedaron con etiquetas neutrales. Se conservan layout, controles, claves de estado, callbacks, rutas y acciones. El cambio solo elimina claims; no añade funcionalidad. Está sin commit y no acredita despliegue ni disponibilidad del portal.

## NO VERIFICADO

- **Ejecución real de signup → confirmación → creación de academia → primera operación:** no se comprobó con una cuenta autenticada ni con datos sintéticos. Paso concreto cuando se autorice ese entorno: E2E autenticado aislado que cree la academia y complete una operación esencial, conservando evidencia de cada paso.
- **Disponibilidad del claim familiar en un despliegue:** no se consultó preview ni producción. La evidencia anterior solo confirma el código en HEAD.



## Integración del coordinador y revisión independiente
QA revisó el diff: claves, controles, rutas y callbacks intactos. El coordinador conservó los nombres semánticos de las preferencias y reformuló asociación/permisos como requisitos, sin afirmar un flujo de invitación ni una pantalla de administración de permisos verificados. Revisión estática del diff y git diff --check sin errores; sin pruebas, CI, commit ni publicación. El copy local no pertenece al artefacto2599.
