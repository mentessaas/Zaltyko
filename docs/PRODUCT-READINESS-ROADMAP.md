# Zaltyko — Product Readiness Roadmap

Fecha de auditoría: 2026-09-15

Este documento separa hechos verificados en el repositorio, inferencias de producto y puntos que requieren una prueba externa. No sustituye una prueba con academias reales.

### Publicación de shell responsive para Super Admin — 15/09/2026

La publicación `dpl_4TPg61AGHERGjK8yx5U8ijF6f7ho` está **READY** y aliasada a `zaltyko.com`. En tablet, Super Admin deja de intentar encajar ocho módulos en una barra que podía recortarse: el escritorio usa el sidebar completo y los anchos intermedios muestran un menú accesible con los ocho destinos. Se conserva la navegación por teclado/lector y se evita que el desplazamiento horizontal oculte enlaces.

Verificado: en la sesión autenticada de 805 px el encabezado muestra el botón de menú, el drawer lista los ocho módulos completos y la consola no registra errores ni warnings. TypeScript, ESLint, contratos focales de navegación/Super Admin (8/8) y `git diff --check` pasan; el gate integral inmediatamente anterior a este ajuste CSS-only permanece en **305 archivos PASS + 1 omitido; 1.857 tests PASS + 2 omitidos; 324 APIs sin riesgos; RLS 71/71; 57 variables; build 230/230**. Sigue **NO VERIFICADO** el E2E de alta con cuentas nuevas por cada rol, entregabilidad externa, WCAG manual, privacidad/retención de menores, Stripe Live/webhooks, pagos locales y cohortes reales.

### Publicación de acabado de producto, formulario de atletas y métricas SaaS — 15/09/2026

La publicación `dpl_8ec1mNSdWrkXxWWrPZnd2vev19Ke` está **READY** y aliasada a `zaltyko.com`. La home refuerza la propuesta de valor con un primer viewport más claro y CTA visible; el alta de gimnastas prioriza el contacto familiar obligatorio y mantiene categoría, nivel y estado como configuración opcional; el modal largo tiene scroll interno y footer estable. Super Admin ya consulta y representa la serie mensual de facturas SaaS pagadas cuando existe, y muestra un estado vacío explícito cuando no hay ingresos SaaS sincronizados, sin confundir cobros internos de academias con revenue de Zaltyko. Las tarjetas de tendencia anuncian que el porcentaje compara con el periodo anterior.

Verificado: assets CSS/chunks live devuelven 200; home, alta de atleta y Super Admin se visualizaron en sesión autenticada sin errores ni warnings de consola; el contacto familiar se alcanza mediante scroll sin solapamiento del footer; el panel muestra “Sin facturas SaaS pagadas por mes” y no el placeholder anterior. Gate completo: **305 archivos PASS + 1 omitido; 1.857 tests PASS + 2 omitidos; 324 APIs sin riesgos; RLS 71/71; 57 variables; dependencias y migraciones íntegras; TypeScript, ESLint y build 230/230**. `git diff --check` pasa tras esta entrada. Sigue **NO VERIFICADO** el E2E de alta con cuentas nuevas por cada rol, entregabilidad externa, WCAG manual, privacidad/retención de menores, Stripe Live/webhooks, pagos locales y cohortes reales.

### Publicación de alta por rol, aliases de registro y alta de gimnastas — 14/09/2026 (23:38 CEST / 21:38Z)

La publicación `dpl_BKHq1pZYnwwEb9X9YA6Vpn9gGgfT` está **READY** y aliasada a `zaltyko.com`. Se añadieron `/signup`, `/registro` y `/register` como aliases de conversión hacia `/auth/register`, preservando un `?role=` válido. El resolver de alta ya no manda a coach, padre o atleta al wizard de owner: continúa al onboarding específico; proveedor continúa al área de marketplace. El formulario de alta de gimnasta muestra desde el inicio el contacto familiar obligatorio y, si se intenta guardar incompleto, abre el bloque y presenta el error visible. También se cubrió el envío de avisos de facturación Stripe con `profileId` y tipo de preferencia, y se activó Dependabot semanal para npm y GitHub Actions.

Verificado: build y deployment READY; aliases live devuelven `307` a `/auth/register` (incluido `/signup?role=coach`); `/`, `/pricing`, `/ayuda`, `/super-admin/support`, `/app` y `/api/health` devuelven 200; health confirma database y `cronAuth` `ok`; sitemap live contiene **81 `<loc>`** e incluye las siete landings `/modules/*` (el hallazgo de 8 URLs estaba desactualizado); UI autenticada de `/athletes/new` muestra “Datos del contacto familiar · obligatorio” y consola sin errores. Gate completo final: **304 archivos (1 omitido); 1.855 tests PASS (2 omitidos); 324 APIs sin riesgos semánticos; RLS 71/71; 57 variables; dependencias y migraciones íntegras; TypeScript, ESLint y build 230/230**; `git diff --check` limpio. Sigue **NO VERIFICADO** el E2E de alta con cuentas nuevas por cada rol, entregabilidad externa, WCAG manual, privacidad/retención de menores, Stripe Live/webhooks, pagos locales y cohortes reales.

### Publicación de normalización de preferencias legacy y panel canónico — 14/09/2026 (22:56 CEST / 20:56Z)

La publicación `dpl_9ac5cuVSqnYdKj6j4ECmLE188m3T` está **READY** y aliasada a `zaltyko.com`. El panel canónico de preferencias normaliza aliases históricos (`classReminders`, `paymentReminders`, `events`, `billing`, `class_cancellations`, entre otros) al mostrar los switches actuales; el componente avanzado legacy queda como wrapper compatible para evitar dos contratos de guardado distintos. La política compartida de entrega sigue siendo la fuente única para email e in-app.

Verificado: build prebuilt y deployment READY; `/api/health` 200 con base de datos y `cronAuth` `ok`; `vercel inspect` confirma alias `zaltyko.com`; la pantalla autenticada de Preferencias muestra switches in-app, email y ventanas 24h/1h con consola sin errores ni avisos. TypeScript, ESLint, tests focalizados y `git diff --check` pasan tras esta iteración. El gate completo previo permanece en **301 archivos; 1.845 tests PASS (2 omitidos); 324 APIs sin riesgos semánticos; RLS 71/71; build 227/227**. Sigue **NO VERIFICADO** la entregabilidad externa, E2E por rol real, WCAG manual, privacidad/retención de menores, Stripe Live/webhooks, pagos locales y cohortes reales.

### Publicación de preferencias de notificaciones de extremo a extremo — 14/09/2026 (22:27 CEST / 20:27Z)

La publicación `dpl_4iJiwrMNCZAq1ThGLvNtwsUQJfR7` está **READY** y aliasada a `zaltyko.com`. Las preferencias visibles por tipo ya se aplican en el emisor común de email y en la creación de notificaciones in-app; recordatorios de clase, pagos, eventos, cancelaciones, alertas de asistencia y avisos programados propagan el `profileId` del destinatario. Los aliases históricos (`events`, `billing`, etc.) se respetan para no romper cuentas existentes. El guardado de preferencias sincroniza también los switches globales legacy de email/in-app, y el recordatorio manual de pago deja de afirmar “enviado” cuando el destinatario lo desactivó.

Verificado: **301 archivos de test (1 omitido); 1.845 tests PASS (2 omitidos)**, 324 APIs sin riesgos semánticos, RLS 71/71, TypeScript, ESLint y build 227/227; `git diff --check` limpio. Smoke live: `/`, `/pricing`, `/ayuda`, `/super-admin/support` y `/app` 200; `/api/health` 200 con base de datos y `cronAuth` `ok`; logs de deployment sin errores. Verificación visual autenticada de `/app/:academyId/notifications`: tabs Lista/Preferencias, switches in-app/email/recordatorios y consola sin errores. No se hicieron migraciones ni cambios de datos reales. Sigue **NO VERIFICADO** la entregabilidad externa, preferencias de cuentas sin perfil (contactos familiares legacy), E2E por rol real, WCAG manual, privacidad/retención de menores, Stripe Live/webhooks, pagos locales y cohortes reales.

### Publicación final de navegación contextual — 14/09/2026 (21:31 CEST / 19:31Z)

La publicación `dpl_DdajaQmWP41gv95HqEBDLGc4Dm88` está **READY** y aliasada a `zaltyko.com`. El breadcrumb ahora conserva el contexto: el inicio de Super Admin vuelve a `/super-admin/dashboard` y el de una academia vuelve a su dashboard de academia; la interfaz también mantiene “Soporte” y las etiquetas frecuentes en español.

El gate completo pasa **299 archivos (1 omitido); 1.841 tests PASS (2 omitidos)**, con 324 APIs sin riesgos semánticos, RLS 71/71, TypeScript, ESLint y build 227/227; además pasa `git diff --check`. Smoke live: rutas públicas y Super Admin 200, `/api/health` 200 con base de datos y `cronAuth` `ok`, CSS 200 y logs recientes sin errores. Verificación visual autenticada: navegación global, Soporte, filtro `Abierto`, breadcrumb contextual y consola sin errores ni avisos. No se hicieron migraciones ni cambios de datos reales. Sigue **NO VERIFICADO** la activación anónima completa, Stripe Live/webhooks/settlement, entregabilidad externa, E2E por rol con cuentas reales, WCAG manual, privacidad/retención de menores, pagos locales y cohortes reales.

### Publicación de soporte global operativo y copy final — 14/09/2026 (21:14 CEST / 19:14Z)

La publicación `dpl_EeqjDUwVx2qxD5s3aHeVkLwcYZxW` está **READY** y aliasada a `zaltyko.com`. La vista de Soporte Super Admin dejó de depender de una consulta Supabase con columnas obsoletas (`fullName`, `email`): ahora usa el esquema Drizzle vigente, cuenta respuestas y aplica filtros de estado, prioridad, categoría y academia. El breadcrumb ya muestra **Soporte** y se normalizaron rutas frecuentes en español.

El gate completo pasa **299 archivos (1 omitido); 1.841 tests PASS (2 omitidos)**, con 324 APIs sin riesgos semánticos, RLS 71/71, TypeScript, ESLint y build 227/227; además pasa `git diff --check`. Smoke live: rutas públicas y Super Admin 200, `/api/health` 200 con base de datos y `cronAuth` `ok`, CSS 200 y logs recientes sin errores. En sesión autenticada se verifican Soporte, filtro `Abierto`, navegación global y breadcrumb en español, sin errores ni avisos de consola. No se hicieron migraciones ni cambios de datos reales. Sigue **NO VERIFICADO** la activación anónima completa, Stripe Live/webhooks/settlement, entregabilidad externa, E2E por rol con cuentas reales, WCAG manual, privacidad/retención de menores, pagos locales y cohortes reales.

### Publicación de navegación global unificada — 14/09/2026 (20:51 CEST / 18:51Z)

La publicación `dpl_F1xYvvwTv3VhJsfQVdtpPGJLwxwD` está **READY** y es el deployment vigente de `zaltyko.com`. La navegación Super Admin ya usa un único registro compartido por header global, sidebar y menú móvil: Inicio, Usuarios, Academias, Academias Públicas, Cobros, Soporte, Configuración y Logs aparecen de forma consistente, incluido el ancho intermedio donde antes se ocultaban las tres superficies nuevas. La sesión autenticada de Super Admin confirma Cobros globales, catálogo y estados reales; consola sin errores ni avisos.

El gate completo pasa **299 archivos (1 omitido); 1.841 tests PASS (2 omitidos)**, con 324 APIs sin riesgos semánticos, RLS 71/71, TypeScript, ESLint y build 227/227; además pasa `git diff --check`. Smoke live: rutas públicas y Super Admin 200, `/api/health` 200 con base de datos y `cronAuth` `ok`, tres CSS 200 y logs recientes sin errores. No se hicieron migraciones ni cambios de datos reales. Sigue **NO VERIFICADO** la activación anónima completa, Stripe Live/webhooks/settlement, entregabilidad externa, E2E por rol con cuentas reales, WCAG manual, privacidad/retención de menores, pagos locales y cohortes reales de activación.

### Publicación de cierre de producto y superficies Super Admin — 14/09/2026 (20:30 CEST / 18:30Z)

La publicación `dpl_CHim4CGhT1JQEm4a4rqs3xRsaA1V` está **READY** y es el deployment vigente de `zaltyko.com`. Se cerraron residuos de copy y terminología en español (acentos, pluralización y lenguaje neutral de staff) y se sustituyeron los placeholders de Super Admin: **Cobros** ahora muestra métricas globales provenientes de la fuente real, distribución de planes/estados y catálogo comercial de referencia; **Configuración** muestra flags efectivos y catálogo de planes en modo de gobernanza de solo lectura. La navegación de Super Admin ya incluye Cobros, Soporte y Configuración.

El gate completo pasa **299 archivos (1 omitido); 1.841 tests PASS (2 omitidos)**, con 324 APIs sin riesgos semánticos, RLS 71/71, TypeScript, ESLint y build 227/227. Smoke live: `/`, `/pricing`, `/features`, `/ayuda`, `/integraciones`, la landing de gimnasia artística, `/super-admin/billing`, `/super-admin/settings` y `/api/health` responden 200; la salud de producción confirma base de datos y `cronAuth` `ok`, los CSS públicos responden 200 y no hay errores recientes en logs. En sesión autenticada de Super Admin se visualizaron **Cobros globales**, **Configuración global**, los enlaces de navegación nuevos y cero errores/avisos de consola. No se hicieron migraciones ni cambios de datos reales; se retiraron únicamente dos deployments atascados sin alias para desbloquear la cola de Vercel. Sigue **NO VERIFICADO** la activación anónima completa, Stripe Live/webhooks/settlement, entregabilidad externa, E2E por rol con cuentas reales, WCAG manual, privacidad/retención de menores, pagos locales y cohortes reales de activación.

### Publicación final de consistencia semántica y lenguaje — 14/09/2026 (19:21 CEST / 17:21Z)

La publicación `dpl_9EivbG82fq1zhFxR4cqTB8VKWuk9` está **READY** y aliasada a `zaltyko.com`. La última auditoría corrigió artículos y pronombres que podían contradecir las etiquetas por disciplina: “la entrenamiento”, “los entrenadoras” y “Revísalas” pasan a lenguaje gramatical o neutral en creación, edición, detalle, asignaciones, reportes y vista diaria. También se eliminó la pluralización residual que podía formar `entrenamientoss` en presets de fallback.

El gate completo pasa **299 archivos (1 omitido); 1.841 tests PASS (2 omitidos)**, con 324 APIs sin riesgos semánticos, RLS 71/71, TypeScript, ESLint y build 227/227. Smoke live: rutas públicas y `/api/health` 200, base de datos y `cronAuth` `ok`, los tres CSS 200 y logs recientes sin errores. Club Ursel autenticado confirma “Revisa estos entrenamientos”, “Sin responsables asignados”, “Todo el staff” y “Nuevo miembro del staff”, sin “entrenamientos creadas”. No se hicieron migraciones ni cambios de datos reales. Sigue **NO VERIFICADO** la activación anónima completa, Stripe Live/webhooks/settlement, entregabilidad externa, E2E por rol con cuentas reales, WCAG manual, privacidad/retención de menores, pagos locales y cohortes reales de activación.

### Publicación de coherencia de lenguaje operativo — 14/09/2026 (18:50 CEST / 16:50Z)

La publicación `dpl_Bn3zvQ9xRZFZL1vLkMhyCzBFSHEW` está **READY** y aliasada a `zaltyko.com`. Se corrigieron las últimas inconsistencias visibles de número y género en grupos, entrenamientos, staff, reportes, filtros, asistencia, WhatsApp, competiciones, licencias y perfiles. El helper compartido `pluralizeFirstWord()` conserva frases compuestas (`Grupo de entrenamiento` → `Grupos de entrenamiento`) y admite etiquetas inclusivas (`Entrenador/a` → `Entrenadores/as`); los estados de UI usan lenguaje neutral para no producir mensajes como “entrenamientos creadas” o “Nuevo entrenadora”.

Verificación: `pnpm verify:production` pasa **299 archivos (1 omitido); 1.840 tests PASS (2 omitidos)**, con 324 APIs sin riesgos semánticos, RLS 71/71, TypeScript, ESLint y build 227/227. Smoke live: `/api/health` 200 con base de datos y `cronAuth` `ok`, las rutas públicas principales 200, los tres CSS referenciados responden 200 y los logs recientes no contienen errores. La sesión autenticada de Club Ursel confirma en producción “Grupos de entrenamiento”, copy de plantilla neutral, “Sin responsable asignado”, “Nuevo miembro del staff” y estados sin errores de pluralización. No se hicieron migraciones ni cambios de datos reales. Sigue **NO VERIFICADO** la activación anónima completa, Stripe Live/webhooks/settlement, entregabilidad externa, E2E por rol con cuentas reales, WCAG manual, privacidad/retención de menores, pagos locales por país y cohortes reales de activación.

### Publicación de coherencia de academia, perfil y activación de modalidades — 14/09/2026 (17:59 CEST / 15:59Z)

La publicación `dpl_AqBgShnfewwg6NsmsBUVZXkhKdgn` está **READY** y aliasada a `zaltyko.com`. La navegación de academia y el dashboard comparten ahora la suscripción efectiva (incluido trial), por lo que Club Ursel muestra **Starter** de forma consistente en sidebar y tarjeta de plan, con **1/75 gimnastas** y **3/20 entrenamientos**. El límite de academias del perfil también usa la cuota efectiva, evitando ofrecer una academia adicional cuando el plan ya está completo. El perfil traduce el rol real (`Super administrador`, `Administrador` o `Propietario`) y los estados de suscripción a lenguaje de producto. Las páginas de modalidades aún no disponibles incluyen ahora una CTA honesta para contar la necesidad y priorizar el lanzamiento.

El gate completo pasa **299 archivos de test (1 omitido); 1.839 tests PASS (2 omitidos)**, con 324 APIs sin riesgos, RLS 71/71, TypeScript, ESLint y build 227/227. Smoke live: `/api/health` devuelve base de datos y `cronAuth` `ok`; los tres CSS referenciados por el HTML responden 200, los logs recientes no tienen errores, el dashboard autenticado de Club Ursel y el perfil global muestran las etiquetas corregidas y la página acrobática muestra la nueva CTA. No se hicieron migraciones, cambios de datos ni acciones destructivas. Sigue **NO VERIFICADO** la activación anónima completa, Stripe Live extremo a extremo, entregabilidad externa, QA manual WCAG, métodos de pago locales y cohortes reales.

### Publicación definitiva tras endurecimiento de Stripe Connect — 14/09/2026 (17:04 CEST / 15:04Z)

La publicación `dpl_3guRBDN7oGia7ZJZFa5egrt7YsjL` está **READY** y aliasada a `zaltyko.com`. Se cerró el último drift de estados técnicos en la tarjeta de Stripe Connect: `pending`, `onboarding`, `enabled`, `restricted` y `disabled` se presentan como estados de producto; los estados de recibos desconocidos también usan un fallback seguro. Smoke live final: Super Admin muestra **Activo**; Club Ursel Billing carga **Starter · En período de prueba**, límites **75/20** y planes **Free/Starter/Growth**.

El gate completo pasa **298 archivos de test (1 omitido); 1.836 tests PASS (2 omitidos)**, con 324 APIs sin riesgos, RLS 71/71, TypeScript, ESLint y build 227/227. `/api/health` devuelve base de datos y `cronAuth` `ok`; logs de error recientes sin entradas. No se hicieron migraciones ni acciones destructivas sobre datos reales.

### Cierre de coherencia de facturación y publicación definitiva — 14/09/2026 (16:50 CEST / 14:50Z)

La publicación `dpl_uYBcqjagmiJWSgdzcEs3VZSzJ9xZ` está **READY** y aliasada a `zaltyko.com`. La última pasada amplía la coherencia a todas las superficies de billing y detalles: el estado de suscripción se traduce con un resolver compartido y los estados desconocidos tienen fallback seguro; no se filtran valores Stripe/DB en Billing Summary, Billing Panel, Super Admin ni el dashboard de academia. Smoke live: Super Admin muestra **Activo**; Club Ursel muestra **Starter · En período de prueba · 1/75 gimnastas · 3/20 entrenamientos**; Billing muestra **Free, Starter y Growth**.

El gate completo pasa **298 archivos de test (1 omitido); 1.836 tests PASS (2 omitidos)**, con 324 APIs sin riesgos, RLS 71/71, TypeScript, ESLint y build 227/227. `/api/health` en la publicación devuelve base de datos y `cronAuth` `ok`; logs de error recientes sin entradas. No se hicieron migraciones ni acciones destructivas sobre datos reales.

### Cierre de localización de estados y publicación — 14/09/2026 (16:36 CEST / 14:36Z)

La publicación `dpl_7D1RYLTEjaQ2yZcy3txXBqS1UUsj` está **READY** y aliasada a `zaltyko.com`. Se eliminó el último estado técnico visible en el gráfico de suscripciones del Super Admin: `active`, `trialing`, `past_due`, cancelaciones y estados terminales pasan por un resolver público en español; el mismo resolver se comparte con el resumen del plan de la academia. La verificación live muestra **Activo** en el gráfico del Super Admin y Club Ursel mantiene **Starter**, **En período de prueba** y **1/75 gimnastas, 3/20 entrenamientos**.

El gate completo pasa **298 archivos de test (1 omitido); 1.836 tests PASS (2 omitidos)**, con 324 APIs sin riesgos, RLS 71/71, TypeScript, ESLint y build 227/227. `/api/health` en la publicación devuelve base de datos y `cronAuth` `ok`; los logs de error recientes no contienen entradas. No se hicieron cambios destructivos ni se eliminaron cuentas: los 23 dueños sin academia siguen siendo un indicador operativo para activación.

### Cierre de coherencia entre plan y límites — 14/09/2026 (16:22 CEST / 14:22Z)

La publicación `dpl_7JZATgcBJDc9EWzc7D9f1ZdhKM8n` está **READY** y aliasada a `zaltyko.com`. En la verificación live de Club Ursel, el dashboard muestra ahora **Starter**, estado **En periodo de prueba** y el resumen **1/75 gimnastas, 3/20 entrenamientos**, alineado con las cuotas efectivas; antes mostraba Free con límites Starter. La causa era una segunda consulta de suscripción que podía devolver una fuente distinta durante un trial. El dashboard usa ahora la misma suscripción efectiva que calcula los límites.

El gate completo pasa **297 archivos de test (1 omitido); 1.833 tests PASS (2 omitidos)**, con 324 APIs sin riesgos, RLS 71/71, TypeScript, ESLint y build 227/227. `/api/health` en la nueva publicación devuelve base de datos y `cronAuth` `ok`; logs de error recientes sin entradas. La publicación anterior `dpl_GM3pnoRwnKjzNuumg7b2pp6BHWWz` queda como despliegue inmediatamente anterior, también `READY`.

### Cierre de consistencia comercial y publicación — 14/09/2026 (16:08 CEST / 14:08Z)

La publicación `dpl_GM3pnoRwnKjzNuumg7b2pp6BHWWz` está **READY** y aliasada a `zaltyko.com`. Se eliminó el último drift visible de nombres de plan: onboarding, límites, facturación, dashboard, sidebar, notificaciones en tiempo real, emails y respuestas de límite usan el resolver público único (`Free`, `Starter`, `Growth`, `Network`) y nunca convierten códigos persistidos a mayúsculas. La verificación live de Club Ursel muestra `Starter`, `Free`, `Growth` y no expone `pro`/`premium`.

El gate completo pasa **296 archivos de test (1 omitido); 1.831 tests PASS (2 omitidos)**, con 324 APIs sin riesgos, RLS 71/71, TypeScript, ESLint y build 227/227. `/api/health` en la nueva publicación devuelve base de datos y `cronAuth` `ok`; no hay entradas de error recientes. El despliegue directo quedó comprimido con `--archive=tgz` porque el builder remoto anterior se atascó durante la compilación; ese despliegue sin alias fue retirado y el dominio conserva la nueva publicación precompilada.

### Cierre de iteración de activación y operación — 14/09/2026 (15:24 CEST / 13:24Z)

La publicación `dpl_DhAGLBMzLK6ztMxnhrc5JSz6Pxaz` está **READY** y aliasada a `zaltyko.com`. El Super Admin muestra ahora el indicador real **“Dueños sin academia”** (23 en la comprobación live), traduce `pro`/`premium` a **Starter/Growth** en dashboard, listados y detalles, y mantiene las tablas operativas alineadas en viewports estrechos con acciones accesibles. El gate final pasa **295 archivos de test (1 omitido); 1.829 tests PASS (2 omitidos)**, con 324 APIs sin riesgos, RLS 71/71, TypeScript, ESLint y build 227/227. `/api/health` continúa con DB y `cronAuth` `ok`, y no hay errores en logs recientes.

### Cierre de verificación de release — 14/09/2026 (14:53 CEST / 12:53Z)

El deployment vigente `dpl_AhwhcCQgEgF4V3EQ5gjgiu2tubHq` continúa **READY** y aliasado a `zaltyko.com`. El gate completo `pnpm verify:production` pasa **293 archivos de test (1 omitido); 1.822 tests PASS (2 omitidos)**, con 324 APIs auditadas sin riesgos semánticos, RLS 71/71 (100 %), contrato de 57 variables, dependencias sin vulnerabilidades conocidas, migraciones íntegras, TypeScript, ESLint y build **227/227**. Esta ejecución final incluye el contrato de identidad visual móvil/PWA y confirma que no quedan warnings de mocks de Vitest.

La comprobación live read-only de la misma publicación conserva `/api/health` con base de datos y `cronAuth` operativos, `manifest.json` con fondo/tema `#0F172A` e iconos PNG 192/512 respondiendo 200. Los pendientes de cierre no se presentan como resueltos: Stripe Live E2E, entregabilidad real de Brevo/WhatsApp/push y cron, E2E móvil/por rol con cuentas reales, WCAG manual, privacidad/retención de menores, métodos de pago por país y cohortes reales de activación.

### Actualización de calidad de repositorio — 14/09/2026 (12:31Z)

Se alinearon billing, pricing, onboarding y posicionamiento competitivo con `src/lib/plans/catalog.ts`; las propuestas históricas quedaron marcadas como no vinculantes. Además, las suites que dependían del hoisting futuro de Vitest migraron a `vi.doMock`/`vi.doUnmock` y el caso de autenticación de billing quedó cubierto en el punto correcto. La verificación completa queda en **292 archivos; 1.820 tests PASS + 2 omitidos**, sin warnings de mocks, 324 APIs sin riesgos, RLS 71/71 y build 227/227. No cambia el runtime del deployment `dpl_3d6G71H9fGLvgDxPaTAMu7dYa1KZ` ya verificado en producción.

La auditoría visual móvil detectó y corrigió assets de distribución que aún eran placeholders planos: icono, adaptive icon, splash, notificación y favicon ahora usan la marca real de Zaltyko; el manifest PWA comparte el fondo navy y cinco referencias a `icon-192x192.png` fueron corregidas a la ruta existente. El contrato de assets valida dimensiones, peso, colores y rutas. `pnpm --dir mobile typecheck`, `pnpm --dir mobile test` (**14 archivos; 330 tests**) y `pnpm --dir mobile doctor` pasan sin warnings.

### Actualización de release — 14/09/2026 (12:44Z)

La publicación `dpl_AhwhcCQgEgF4V3EQ5gjgiu2tubHq` está **READY** y aliasada a `zaltyko.com`. Incluye la identidad visual móvil/PWA y los fallbacks de notificación corregidos. Verificación externa: `/api/health` devuelve base de datos y `cronAuth` `ok`; `manifest.json` expone fondo y tema `#0F172A`; los iconos 192/512 responden 200 con `image/png`; logs de error del deployment sin entradas en los últimos 10 minutos.

### Actualización de release — 14/09/2026 (14:09 CEST / 12:09Z)

La publicación `dpl_3d6G71H9fGLvgDxPaTAMu7dYa1KZ` está **READY** y aliasada a `zaltyko.com`. El panel Super Admin deja de mostrar la fecha de la última academia como si fuera la última alta de usuario: ahora ambas tarjetas usan su fuente real (`academies.created_at` y `profiles.created_at`) y conservan un estado vacío honesto si no hay registros.

El gate completo pasa **292 archivos; 1.820 tests PASS + 2 omitidos**, con API authorization sin riesgos, RLS 71/71, TypeScript, ESLint y build de producción **227/227**. Smoke live: `/api/health` 200 con base de datos y cronAuth `ok`; Super Admin autenticado muestra “Última academia” y “Último usuario” correctamente, sin errores ni warnings de consola.

### Actualización de release — 14/09/2026 (13:50 CEST / 11:50Z)

La publicación `dpl_2DRyunzveXFstazhehCG8TPK42zu` está **READY** y aliasada a `zaltyko.com`. Se conectó la atención del dashboard con lotes reales de importación CSV, mostrando estado, filas afectadas y un CTA que abre el lote correspondiente; la ruta de importación puede abrirse directamente desde ese CTA. Las evaluaciones ahora usan etiquetas y colores canónicos, consumen de forma segura el envelope `{ ok, data }`, conservan el día de calendario en todos los historiales y toman la fecha inicial desde la zona de la academia. También se eliminó una consulta server-side de evaluaciones que se ejecutaba y luego se descartaba, y el historial recuperó el filtro “Fecha Fin”. Finalmente, el endpoint de historial normaliza filtros opcionales ausentes (`null` a `undefined`), evitando el 500 de Zod y el “Unexpected end of JSON input” que aparecía al abrirlo sin filtros.

El gate completo pasa **291 archivos; 1.818 tests PASS + 2 omitidos**, con API authorization sin riesgos, RLS 71/71, TypeScript, ESLint y build de producción **227/227**. Smoke live: `/api/health` 200 con base de datos y cronAuth `ok`, dominio público 200 y dashboard sin sesión 307. Club Ursel autenticado, en pestaña limpia de escritorio, confirma dashboard, evaluaciones e historial con “Fecha Fin”; las tres superficies quedan sin errores ni warnings de consola.

### Actualización de release — 14/09/2026 (05:32 CEST / 03:32Z)

La publicación `dpl_EXU97UU7mEHxfMmSBt8c4Zwp3djt` está **READY** y aliasada a `zaltyko.com`. Se corrigió el último bloqueo real del flujo de sesiones: la página de configuración recurrente ya no recibe callbacks de servidor dentro de un Client Component, por lo que deja de caer en “No pudimos cargar esta sección”. El destino de “Generar sesiones” abre ahora la configuración operativa real y muestra “Generar sesiones manualmente”.

El gate completo (`pnpm verify:production`) pasa, `vercel build --prod --yes` genera **227/227** páginas, y los contratos focales de semántica, CTAs y frontera server/client pasan **12/12**. La verificación live de la ruta recurrente en Club Ursel confirma breadcrumb, configuración automática y botón manual visibles, sin errores ni warnings de consola. Smoke live: `/api/health`, `/status`, `/`, `/pricing` = 200; dashboard sin sesión = 307; atención protegida = 401.

### Actualización de release — 14/09/2026 (05:07 CEST / 03:07Z)

La publicación `dpl_B3Hmk1NRGXED9MuUt6aRPmkWakWq` está **READY** y aliasada a `zaltyko.com`. El dashboard distingue ahora sesiones reales de entrenamientos base recurrentes: no presenta plantillas como clases ya programadas y explica cuándo falta generar las sesiones. El cálculo semanal usa las claves de fecha locales de la zona IANA efectiva de cada academia. Las CTAs de puesta a punto de grupos y clases son contextuales y llevan a entrenadoras, grupos o la lista operativa según el bloqueo real.

La verificación de esta iteración pasa `pnpm verify:production`, `vercel build --prod --yes` (**227/227** páginas), TypeScript, ESLint focal y `git diff --check`; los contratos focales de semántica y CTAs pasan **11/11**. Smoke live: `/api/health`, `/status`, `/`, `/pricing` = 200; dashboard sin sesión = 307; atención protegida = 401. Dashboard, clases y grupos autenticados se revisaron en pestaña limpia con árbol de accesibilidad y sin errores ni warnings de consola.

Continúan **NO VERIFICADO** las pruebas E2E móvil y por rol con academias reales, WCAG manual, Stripe Live completo, entregabilidad de Brevo/WhatsApp/push y cron, privacidad/retención de menores, métodos de pago por país y cohortes reales de activación. La recomendación de negocio permanece: piloto controlado con 1–2 academias antes de abrir tráfico amplio.

### Actualización de release — 14/09/2026 (04:37 CEST / 02:37Z)

La build `dpl_DCRJCVuNzKzTEC9YPiqHaNF3Vt1q` está **READY** y aliasada a `zaltyko.com`. La corrección de calendario ya cubre también el servidor: sesiones y horas se combinan en la zona IANA de la academia con `fromZonedTime`, y una zona horaria inválida vuelve al país configurado como fallback seguro. El dashboard del dueño deja de terminar en un estado vacío sin siguiente paso y ofrece “Abrir planificación” cuando no hay clases hoy. El gate de producción pasa, el build genera **227/227** páginas y las suites focales de fechas, atención y acciones pasan **18/18**.

### Actualización de release — 14/09/2026 (03:15)

La build `dpl_8mt2jtxtiQZwPqZXJCr5UwDo9ieH` está **READY** y aliasada a `zaltyko.com`. Además de la corrección de fechas internacionales, el dashboard ya traduce los estados de fuente a lenguaje de producto: no expone SQL ni nombres internos de tablas al dueño de la academia, y comunica de forma clara cuándo un indicador aún no está disponible o necesita reintento. El gate de esta iteración queda en **282 archivos PASS + 1 omitido; 1.791 tests PASS + 2 omitidos**, con **324 APIs (215 mutantes), 0 riesgos y RLS 71/71**. El smoke live confirma `/api/health`, `/status`, `/`, `/pricing` y la entrada de dashboard en 200; la atención protegida responde 401 sin sesión.

### Actualización de release — 14/09/2026 (03:00)

La build `dpl_BYhdNbXQbV1RWRTNAh7MVVwLPh5k` está **READY** y aliasada a `zaltyko.com`. El dashboard operativo ahora resuelve la zona horaria explícita de `academies.timezone` y usa el país solo como fallback; además, las sesiones y pendientes de asistencia se consultan por la fecha de calendario exacta de `class_sessions.session_date`, evitando perder clases por comparar un tipo `DATE` contra timestamps UTC. El gate de esta iteración queda en **281 archivos PASS + 1 omitido; 1.790 tests PASS + 2 omitidos**, con **324 APIs (215 mutantes), 0 riesgos y RLS 71/71**. El smoke live confirma público 200, dashboard sin sesión 307 y atención protegida 401.

### Actualización de release — 14/09/2026 (02:27)

La build `dpl_H7m5gTf9ahxeRYSwdALDrtnDQRMD` está **READY** y aliasada a `zaltyko.com`. El ciclo de vida de atletas archivados ya es coherente: “Archivado” lista los registros reales, las filas ofrecen “Restaurar” con una mutación tenant-scoped y el Kanban muestra los cinco estados con selección, edición o restauración según corresponda. La restauración y el archivado usan transacciones y auditoría; las carreras de datos fuerzan rollback. El gate de esta iteración queda en **281 archivos PASS + 1 omitido; 1.788 tests PASS + 2 omitidos**, con **324 APIs (215 mutantes), 0 riesgos y RLS 71/71**.

### Actualización de release — 14/09/2026 (02:06)

La build `dpl_FPv4SxTxEsfUeNra96ggj7f4Tj1h` está **READY** y aliasada a `zaltyko.com`. El endpoint de archivado masivo de gimnastas ahora revierte toda la operación dentro de la transacción si detecta una carrera de datos, evitando archivados parciales bajo concurrencia. El gate de esta iteración queda en **281 archivos PASS + 1 omitido; 1.786 tests PASS + 2 omitidos**, con **323 APIs (214 mutantes), 0 riesgos y RLS 71/71**.

### Actualización de release — 14/09/2026 (01:56)

La build `dpl_A6cwhvaG23FyJywVHLe38JL3jtKc` está **READY** y aliasada a `zaltyko.com`. Además del dashboard operativo con CTAs honestas (pasar lista hoy, “Ver clase” en futuras y “Configurar sesiones” cuando aún no existen sesiones), las acciones masivas de gimnastas ahora archivan de forma atómica conservando historial y exportan únicamente la selección; se retiraron controles de “Eliminar” y “Enviar mensaje” que no ejecutaban una operación real. El smoke autenticado de Club Ursel confirmó los enlaces de configuración de sesiones y la pantalla de atletas sin errores de consola. El gate de esta iteración queda en **281 archivos PASS + 1 omitido; 1.786 tests PASS + 2 omitidos**, con **323 APIs (214 mutantes), 0 riesgos y RLS 71/71**.

### Actualización de release — 14/09/2026 (01:37)

La build `dpl_DKhEkyy4gKuFRX8JCcfrQRcfKbkm` está **READY** y aliasada a `zaltyko.com`. La carga inicial del dashboard de academia baja de 614 kB a **407 kB First Load JS** al diferir sparklines, widgets secundarios, routing puro de onboarding y realtime de Supabase. Las CTAs de clases de hoy llevan directamente a la hoja de asistencia; las clases futuras mantienen “Ver clase” para no sugerir que una sesión futura ya está lista para pasar lista. El smoke autenticado de Club Ursel confirmó los widgets hidratados sin errores de consola. El gate de esta iteración queda en **280 archivos PASS + 1 omitido; 1.781 tests PASS + 2 omitidos**.

### Corte base anterior al release final — 14/09/2026

El árbol local final pasa `pnpm verify:production`: 278 archivos de test pasan (1 omitido), 1.775 tests pasan (2 omitidos), `pnpm gate:all`, TypeScript, ESLint, auditoría estricta de APIs y build de producción (227 páginas generadas) están en verde. La auditoría estricta cubre 322 rutas (213 mutantes), con 0 riesgos y 0 revisiones manuales pendientes; RLS está cubierta 71/71. La suite del release gate se ejecuta con un worker único para evitar carreras entre mocks y datos compartidos. La auditoría a11y final reproducida contra el servidor correcto pasa 6/6 en Chromium (público y autenticado); la ejecución multibrowser concurrente no se considera evidencia por una combinación de puerto/configuración y artefactos de Playwright. El copy de portal familiar, la trazabilidad y el rollback de importaciones CSV, los tokens visuales corregidos, el texto accesible del H1 animado, los valores Sí/No de la tabla comparativa, la comparación de planes sin límites ficticios, el progreso honesto del onboarding (Paso 1 de 5), la selección de rol móvil en dos columnas, la disponibilidad honesta de idiomas, la consistencia de envelopes `{ ok, data }` y la fidelidad de pantallas operativas están cubiertos por contratos focales. La segunda pasada además normaliza billing, descuentos, campañas, recibos, mensajería, notas de coach, onboarding de roles, guardianes, skills, eventos e inscripciones; el gestor legado de matrículas quedó alineado con la API canónica de clases y con el scope de academia. Las altas y ediciones de clases ahora rechazan rangos horarios imposibles y las superficies existentes muestran “Horario por revisar” en vez de presentar una hora de fin anterior como válida. Los reportes financieros ahora tienen endpoints reales separados para resumen, mensual, morosidad y proyecciones, todos con wrapper tenant; antes el frontend llamaba a tres rutas inexistentes y recibía 404. El dashboard Super Admin distingue catálogo de planes de suscripciones por plan y tiene timeout/fallback de refresh para conservar el último corte válido. También se corrigió el componente legado de checkout para usar el endpoint tenant canónico y exigir la respuesta `{ ok, data.checkoutUrl }`, en vez de apuntar a una ruta inexistente y al redirect antiguo de Stripe.js. La lista de espera ya promociona usando la ruta real `/api/class-waiting-list/:entryId` y valida el envelope de respuesta, en lugar de llamar a un sufijo `/promote` inexistente. El smoke local de `/`, `/features`, `/pricing`, `/api/health` y `/status` responde 200. La comprobación externa read-only del 14/09 confirma el deployment vigente `dpl_EQcFmwAoNhG4BdgfZVPWJ1gjvYya` en `READY` y aliasado a `zaltyko.com`; `/api/health` y las rutas públicas responden 200, mientras los tres endpoints financieros sin sesión responden 401 (no 404) y la ruta de lista de espera existe y permanece protegida. El smoke autenticado en pestaña limpia confirmó Super Admin sin errores de consola; el panel muestra “SUSCRIPCIONES POR PLAN” y “2 planes con suscripciones”. El release también incorpora navegación responsive en breakpoint `lg`, un onboarding inicial más corto, el siguiente paso del dashboard junto a los KPIs, enlaces accesibles a detalle de academia, una preferencia de idioma que no presenta traducciones no disponibles como activas, un estado público que distingue automatizaciones configuradas de ejecuciones verificadas y límites de espera para que los pulsos operativos no queden cargando indefinidamente. El resumen ejecutivo ya queda añadido como comentario en Paperclip en `ZAL-1279`.

## Objetivo de producto

Una academia debe poder registrarse, crear su espacio, organizar una primera clase, añadir atletas, pasar lista y cobrar una cuota sin ayuda externa.

Métrica norte propuesta: **academias activadas semanalmente** = academia que crea una clase, añade al menos un atleta y registra una asistencia durante sus primeros siete días.

## Estado actual

### Verificado en código

- Separación explícita entre cuenta de usuario y academia durante el registro/onboarding.
- Resolución de home por rol y contexto de academia.
- Aislamiento tenant/academy en rutas auditadas.
- Límites de lecturas: `pnpm gate:reads` sin hallazgos.
- Autorización previa a validación: `pnpm gate:auth:strict` sin hallazgos.
- Flujos base de atletas, grupos, clases, sesiones, asistencia, eventos, reportes y cobros.
- Hitos first-party idempotentes de primera clase, primer atleta y primera asistencia; la activación operativa se calcula desde datos reales (clase + atleta + asistencia dentro de los primeros siete días), no desde clicks del checklist.
- Stripe Connect, webhooks firmados, idempotencia y pagos manuales implementados en código.
- Recordatorios de pago y cron de recordatorios de clase implementados en servicios de email.
- Importación de atletas con previsualización, hash de confirmación, deduplicación visible, límites proyectados, escritura por atleta atómica y lote trazable con rollback protegido.
- Reportes con fechas validadas, email por `POST` y límites de navegación para que los coaches no reciban métricas ejecutivas por defecto.
- Moneda internacional coherente en cobros, resumen familiar, eventos, marketplace y campañas; los totales familiares se separan por divisa para no sumar importes incompatibles y los fallbacks aceptan códigos ISO o nombres legacy.
- Copy público revisado: sin promesas de contabilidad integrada, pagos fraccionados, importación de familias, multi-sede autoservicio ni funciones de eventos no implementadas; la demo y los proof points no dejan controles inertes ni testimonios ficticios. La comparación de planes autenticada también consume solo límites que el catálogo aplica (gimnastas y clases), sin publicar cuotas ficticias de entrenadores o almacenamiento.
- Dependencias auditadas con overrides efectivos para el pnpm fijado; instalación congelada y `pnpm audit --prod --audit-level high` sin vulnerabilidades conocidas.
- Páginas específicas para owner, coach, parent y athlete presentes en el App Router.
- La segunda comprobación visual del 13/09 (home, precios, registro, producto y menú móvil) no encontró bloqueos de renderizado ni errores de interacción. El selector de rol del registro se compactó a dos columnas y tarjetas de altura mínima para que los campos y la CTA queden alcanzables antes en viewports móviles estrechos.
- El onboarding del owner comunica ahora “Paso 1 de 5” y representa visualmente el 20% de avance; así no sugiere que crear la cuenta ya completó toda la configuración de la academia.
- Los agregados del dashboard Super Admin normalizan tanto arrays de mocks como `QueryResult.rows` de node-postgres; el caso de producción que provocaba `M.map is not a function` queda cubierto por contrato focal y verificado en el deployment live.
- La navegación pública cambia a breakpoint `lg` para evitar solapamientos del header en tablet; el menú móvil se verificó abierto a 924 × 768 sin errores de consola.
- El dashboard coloca “Próximo paso” inmediatamente después de los KPIs y el listado Super Admin de academias ofrece un enlace accesible “Ver detalle” por fila.
- Los logs del deployment final no muestran 5xx ni errores de aplicación; sí conservan un warning operativo no bloqueante de Node por `NODE_EXTRA_CA_CERTS=./certs/supabase-root-ca.crt` relativo. La base de datos conecta correctamente, pero Platform debe corregir la ruta/entorno antes de cerrar la deuda de observabilidad.
- Las rutas públicas principales (`/`, `/pricing`, `/auth/register?role=owner`, `/features`, `/status`) también cargaron en pestaña limpia sin errores ni warnings de consola.
- Los reportes financieros exponen rutas tenant-protegidas de resumen, mensual, morosidad y proyecciones; los contratos cubren el handler compartido y evitan que el cliente dependa de una ruta padre con lógica inalcanzable.
- El dashboard Super Admin presenta la distribución de suscripciones con semántica explícita y conserva el último corte válido cuando el refresh agota su timeout.

### Parcial o pendiente

- La experiencia de familia y entrenador necesita una validación E2E completa en móvil.
- El modo offline de mutaciones está deliberadamente desactivado hasta disponer de sincronización idempotente.
- Falta cerrar la matriz E2E de Stripe: tarjeta guardada, off-session, SCA/3DS, rechazo, reembolso y reconciliación.
- La configuración real de Brevo, cron y alertas de observabilidad requiere pruebas en producción.
- Privacidad, retención, borrado de datos de menores e identidad legal de la entidad operadora necesitan una revisión formal. El copy público evita ya las dos denominaciones societarias contradictorias que había entre términos y privacidad, pero no se presenta como validación jurídica.
- Las métricas de activación, conversión y retención todavía no tienen un cuadro de mando de producto validado; la definición y los hitos ya están instrumentados, pero falta validar cohortes reales.

### No verificado

- Uso real por academias externas y tiempos de activación.
- Accesibilidad WCAG manual con teclado y lector de pantalla.
- Rendimiento y usabilidad en dispositivos móviles reales.
- Entrega efectiva de emails, WhatsApp y push en producción.
- Tasa de éxito de cobros y recuperación ante errores reales.

## Plan por fases

### Fase 0 — Go/No-Go operativo (P0)

1. Ejecutar matriz Stripe E2E en test y producción controlada.
2. Verificar Brevo con remitente real y correo de prueba trazable.
3. Verificar los seis cron jobs con ejecución, duración y resultado recientes.
4. Completar política de datos de menores, retención, exportación y borrado.
5. Probar aislamiento entre dos tenants con owner, coach y familia.

**Criterio de salida:** ninguna incidencia crítica abierta en dinero, privacidad o aislamiento.

### Fase 1 — Activación (P0)

1. ✅ Reducir onboarding visible a nombre/país/modalidad; primera clase y primer atleta se completan desde el checklist del dashboard.
2. ✅ Mantener programas, aparatos, grupos sugeridos y ubicación detallada como configuración avanzada posterior.
3. ✅ Mostrar checklist persistente con una siguiente acción clara y CTAs dentro de la academia activa.
4. ✅ Instrumentar eventos: `signup_completed`, `academy_created`, `first_class_created`, `first_athlete_added`, `first_attendance_recorded` y `academy_activated`.
5. Medir tiempo entre cada evento y abandono por paso con cohortes reales (pendiente).

**Criterio de salida:** una academia nueva llega a primera asistencia en menos de 15 minutos en prueba guiada.

### Fase 2 — Experiencia por rol (P1)

1. Owner: operación, dinero y salud de la academia.
2. Coach: agenda del día, lista, notas y evaluaciones desde móvil.
3. Familia: hijos, horarios, progreso, cuotas, pago y recibo interno.
4. Ocultar funciones administrativas de roles que no las necesitan.

**Criterio de salida:** cada rol completa su tarea principal sin entrar en pantallas de otro rol.

### Fase 3 — Confianza y soporte (P1)

1. Centro de ayuda contextual por pantalla.
2. Soporte con contexto automático de academia, usuario y acción fallida.
3. Estados de entrega para email, WhatsApp y push.
4. Alertas de 5xx, webhooks, cron, email y fallos de cobro.
5. Registro de auditoría visible para acciones sensibles.

**Criterio de salida:** un fallo común tiene mensaje accionable, registro y ruta de recuperación.

### Fase 4 — Escala y diferenciación (P2)

1. Analytics de retención, ingresos, asistencia y crecimiento.
2. Importador CSV con previsualización, errores visibles y rollback por lote. La migración `20260913100000_athlete_import_batches.sql` ya está aplicada de forma aislada al entorno configurado; falta validación E2E con una academia real y documentar el procedimiento operativo de recuperación.
3. PWA/offline solo después de definir sincronización idempotente.
4. Integraciones Google Calendar y WhatsApp según casos de uso medidos.
5. SEO orientado a conversión, no solo a volumen de páginas.

## Backlog de riesgos adicionales

- Revisar duplicados de componentes/rutas y enlaces que puedan terminar en `not-found`.
- Eliminar comentarios `TODO` que ya no describan el estado real o convertirlos en issues concretos.
- Añadir tests de contrato para límites de plan y mensajes visibles al usuario.
- Definir SLO inicial: disponibilidad, latencia de dashboard y tiempo de procesamiento de cron.
- Documentar responsable operativo de cada integración externa y ensayar el rollback de importaciones con una academia sintética.

## Regla de cierre

No marcar una fase como completada por existir código. Requiere evidencia del criterio de salida, una prueba reproducible y, cuando aplique, una ejecución real controlada.
