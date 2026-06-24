---
status: active
owner: producto
last_reviewed: 2026-06-24
source:
  - ../AGENTS.md
---

# Decisiones

## 2026-06-22 - Crear vault Obsidian versionada

| Campo | Valor |
| --- | --- |
| Contexto | La informacion de Zaltyko estaba repartida entre docs tecnicos, analisis, marketing, roadmap y auditorias. |
| Decision | Crear `vault/` en la raiz del repo como base de conocimiento viva. |
| Consecuencia | Todo cambio relevante debe actualizar la vault o justificar por que no aplica. |
| Estado | Activa |

## 2026-06-24 - Sprint 7 Plan operativo

| Campo | Valor |
| --- | --- |
| Contexto | Sprint 6 cerro Code Splitting, Producto, Deuda tecnica y Validacion. Quedan 3 frentes multi-area para Sprint 7: (A) migrar los 4 dialogos/formularios grandes a RHF+Zod (ya completado CreateAthleteDialog en 7A.1), (B) consumir los 80 i18n keys bilingues creados en Sprint 6 en Dashboard/Athletes/Billing, (C) setup Supabase local para CI mas realista, (D) cerrar decision legacy `/dashboard/*` documentada en [[Decisiones#2026-06-22 - Rutas legacy `/dashboard/*` (PENDIENTE de decision de Elvis)]]. |
| Decision | Ejecutar 7A y 7B con prioridad alta (reducen deuda UX/validacion, son localmente testeables). Diferir 7C (requiere Docker y decision arquitectonica mayor) y 7D (depende de Elvis). Documentar cada commit en `vault/06-Roadmap-y-Tareas/Changelog interno.md`. |
| Consecuencia | 5 commits nuevos pusheados a main. OnboardingChecklist queda correctamente excluido de RHF por no ser formulario. Build sigue verde. |
| Estado | Cerrado parcialmente: 7A completo, 7B completo, 7C y 7D diferidos. |

## 2026-06-24 - Decidir Opcion A para legacy `/dashboard/*` (recomendada, NO ejecutada)

| Campo | Valor |
| --- | --- |
| Contexto | Misma decision que [[#2026-06-22 - Rutas legacy `/dashboard/*` (PENDIENTE de decision de Elvis)]]. Sprint 6 quedo bloqueado esperando esta decision. Analisis: la mayoria de las 38 rutas redirigen a `/auth/login` y solo unas pocas tienen UI viva. |
| Decision recomendada | **Opcion A**: mantener compat 6 meses y arreglar lo roto. Implementar redirects `next.config.mjs` para mapear `/dashboard/X` -> `/app/[academyId]/X` cuando exista equivalente moderno, sin duplicar logica. Codigo publico (3 hrefs) se actualiza a `/app/[academyId]/...`. `/dashboard/plan-limits` se mueve a `/app/[academyId]/settings/plan-limits`. |
| Pendiente | Elvis debe aprobar antes de ejecutar. Si aprueba, Sprint 7D.2 implementa los redirects en `next.config.mjs` y Sprint 7D.3 actualiza el codigo publico. |
| Estado | Recomendada, esperando aprobacion humana (P1 decision Elvis - NO automatizable). |

| Campo | Valor |
| --- | --- |
| Contexto | Auditoria del 2026-06-22 detecta 38 rutas legacy en `src/app/dashboard/`. 25 redirigen a `/auth/login` (compatibilidad para usuarios con URLs guardadas), 1 redirige a otra legacy en cadena rota (`/dashboard/classes/calendar` → `/dashboard/calendar`), 1 sigue viva sin equivalente moderno (`/dashboard/plan-limits` con API `/api/profile/check-limits`), y 3 son apuntadas por codigo publico sin pasar por tenant (`/dashboard/events/new`, `/dashboard/marketplace/mis-productos`, `/dashboard/empleo/mis-postulaciones`). Riesgo: enlaces externos y emails antiguos rompen, y codigo de marketing lleva a login sin contexto de academia. |
| Opciones consideradas | (ver bloque inferior) |
| Decision | Pendiente. Elvis decidira tras revisar pros/contras. |
| Estado | Pendiente |

### Opcion A - Mantener compat 6 meses y arreglar lo roto

- **Pros**: minima interrupcion; compatible con URLs en emails, bookmarks, integraciones externas; permite migrar usuarios gradualmente.
- **Contras**: 38 archivos duplican logica de redirect; hay que seguir manteniendo `/dashboard/X` ademas de `/app/[academyId]/X` durante 6 meses; cadena rota `/dashboard/classes/calendar → /dashboard/calendar` queda visible.
- **Trabajo**: arreglar `/dashboard/classes/calendar` para redirigir a `/app/[academyId]/calendar`; mover o replicar `/dashboard/plan-limits` como `/app/[academyId]/settings/plan-limits`; actualizar los 3 hrefs publicos para que apunten a `/app/[academyId]/...` cuando aplique.
- **Riesgo bajo, esfuerzo bajo**.

### Opcion B - Migrar TODO `/dashboard/X` como wrapper que resuelve tenant

- **Pros**: sin perdida de URLs externas; cada `/dashboard/X` se convierte en un stub de 5 lineas que identifica `academyId` del usuario y redirige a `/app/[academyId]/X`; no hay duplicacion de UI.
- **Contras**: requiere que cada `/dashboard/X` sepa resolver el tenant (algunos como `/dashboard/empleo/mis-postulaciones` no son tenant-aware por diseno); hay que reescribir la mayoria de los 38 archivos.
- **Trabajo**: para cada ruta, si existe `/app/[academyId]/X`, el wrapper obtiene `academyId` desde la sesion del usuario y redirige; si no existe (ej. `/dashboard/empleo/mis-postulaciones`), decidir caso por caso.
- **Riesgo medio, esfuerzo medio**.

### Opcion C - Eliminar legacy con banner unico

- **Pros**: limpieza maxima; una sola pantalla de redireccion para todas las rutas legacy; fin del problema.
- **Contras**: rompe enlaces externos y bookmarks salvo que el redirect avise bien; asume que no hay trafico externo significativo (a confirmar con metricas); algunos usuarios quedaran descolocados temporalmente.
- **Trabajo**: un unico `src/app/dashboard/[...slug]/page.tsx` que captura cualquier ruta, lee `slug`, busca el equivalente moderno y redirige con un toast "Hemos movido Zaltyko a una nueva URL. Te llevamos al nuevo lugar."; eliminar los 38 archivos individuales.
- **Riesgo medio-alto, esfuerzo bajo**.

### Opcion D - Posponer (registrada para revisar despues)

- **Pros**: no tomar decision ahora; permite foco en P0 (billing, evaluaciones, comunicacion); reduce carga cognitiva.
- **Contras**: el riesgo sigue abierto; las rutas publicas siguen apuntando a `/dashboard/...` y rompen UX; auditoria futura encontrara el mismo problema.
- **Trabajo**: dejar nota explicita en [[Registro de riesgos]] y [[Backlog priorizado]] para revisitarla despues de Fase 1.

### Recomendacion del auditor

Si Elvis quiere cerrar riesgo rapido: **Opcion A** (esfuerzo bajo, riesgo bajo, arregla lo urgente).
Si Elvis quiere resolver de raiz: **Opcion B** (esfuerzo medio, sin URLs muertas).
**No recomendada Opcion C** sin metricas de trafico externo que justifiquen el corte.

### Siguiente paso

Elvis elige opcion y se actualiza esta entrada con el campo `Decision` y `Estado` definitivos.

## 2026-06-22 - V1 comercial con una academia por cliente

| Campo | Valor |
| --- | --- |
| Contexto | Para abrir acceso real a academias, multi-sede aumenta superficie de QA, billing, soporte y promesas comerciales. La arquitectura multi-tenant sigue siendo necesaria para aislar clientes, roles e invitaciones por academia. |
| Decision | Starter y Growth quedan limitados a 1 academia en v1 comercial. Network conserva multi-sede solo bajo diagnostico y onboarding acompanado. No se eliminan `tenant_id`, `memberships`, `activeAcademyId`, rutas `/app/[academyId]` ni `withTenant`. |
| Consecuencia | Growth deja de prometer "academias ilimitadas"; pricing, marketing, limites y tests deben reforzar que multi-sede no es autoservicio en v1. |
| Estado | Activa |

## 2026-06-23 - Go-to-market inicial enfocado en gimnasia

| Campo | Valor |
| --- | --- |
| Contexto | El diagnostico competitivo muestra que el hueco mas claro no es otro gestor deportivo generico, sino una solucion en espanol para academias de gimnasia artistica y ritmica que hoy operan con Excel, pagos manuales y comunicacion dispersa. |
| Decision | Mantener la arquitectura multi-deporte, pero enfocar discovery, beta, mensajes tempranos y MVP comercial en gimnasia artistica y ritmica. |
| Consecuencia | Marketing, entrevistas, matriz competitiva y MVP deben priorizar gimnastas, familias, grupos, cuotas, asistencia, progresion tecnica y portal de padres. No se eliminan configuraciones sport-aware ni expansion futura a otras disciplinas. |
| Estado | Activa |

## 2026-06-23 - Comunicacion interna primero

| Campo | Valor |
| --- | --- |
| Contexto | WhatsApp es familiar para academias, pero Elvis prefiere que la comunicacion principal viva dentro del SaaS para crear habito de uso y trazabilidad. |
| Decision | La comunicacion v1 se define como in-app primero: mensajes, avisos, notificaciones e historial por gimnasta/familia/grupo dentro de Zaltyko. Email/push pueden avisar para volver a la app. WhatsApp queda secundario/futuro. |
| Consecuencia | No prometer WhatsApp como prioridad v1. El roadmap debe auditar y mejorar messages/notifications/portal antes de invertir en integraciones externas. |
| Estado | Activa |

## 2026-06-23 - Pricing freemium en investigacion

| Campo | Valor |
| --- | --- |
| Contexto | El precio definitivo no esta claro. La intencion es llegar a academias chicas y medianas sin cerrar el mercado por precio, pero evitando un free plan que bloquee conversion. |
| Decision | Investigar un modelo freemium accesible antes de cambiar precios, limites, Stripe o copy publico. |
| Consecuencia | Pricing queda como hipotesis: free util, plan bajo accesible y plan superior para crecimiento/automatizacion/reportes/soporte. La decision final depende de competencia y entrevistas. |
| Estado | Activa |

## 2026-06-23 - Identidad global y vinculos aceptados por academia

| Campo | Valor |
| --- | --- |
| Contexto | El registro no debe asumir que toda persona que entra a Zaltyko es responsable de una academia. Padres, atletas, entrenadores y proveedores necesitan cuenta propia, y una academia no debe poder apropiarse de una identidad existente sin consentimiento. |
| Decision | `profiles` representa la identidad global del usuario y `memberships` representa su relacion con una academia. El registro abierto permite elegir rol inicial (`owner`, `coach`, `parent`, `athlete`, `provider`). Los vinculos con academias se crean por invitacion o solicitud aceptada; eliminar a un usuario de una academia elimina/desactiva el vinculo, no la cuenta global. |
| Consecuencia | Usuarios sin academia deben tener dashboard global limitado segun rol. Owners sin academia van a onboarding de academia. Providers pueden operar marketplace sin academia. Las solicitudes de vinculo a usuarios existentes ya tienen entidad, API y UX base de aceptar/rechazar; queda pendiente QA manual con cuentas reales. |
| Estado | Activa |

## 2026-06-23 - `membership_role` se mantiene simple en v1

| Campo | Valor |
| --- | --- |
| Contexto | El perfil global puede ser `owner`, `admin`, `coach`, `athlete`, `parent` o `provider`, pero los permisos dentro de una academia se controlan por `memberships.role`. Surgio la duda de si `admin` debe existir tambien como rol de membership separado. |
| Decision | Mantener `membership_role` simple por ahora (`owner`, `coach`, `viewer`) y mapear un perfil global `admin` a `membershipRole=owner` cuando necesite permisos administrativos de academia. No ampliar el enum hasta disenar permisos granulares reales. |
| Consecuencia | Evita una migracion prematura y mantiene claro que `profiles.role` describe identidad global, mientras `memberships.role` describe acceso a una academia. Si en beta aparecen admins operativos con permisos menores que owner, se reabre decision y se amplia `membership_role`. |
| Estado | Activa |

## Template rapido

Copiar desde [[Template - Decision]] para nuevas decisiones.

## 2026-06-23 - Modelo freemium agresivo + monetizacion diferida por comunidad

| Campo | Valor |
| --- | --- |
| Contexto | Elvis (entrenador de gimnasia artistica) explicito que la prioridad no es maximizar revenue por academia sino **construir la mayor comunidad de academias de gimnasia hispanohablantes del mundo**. El SaaS es la loss-leader; el dinero viene despues por upsells, marketplace, eventos, publicidad y partnerships. Validado contra [[Pricing]], [[Modelo de negocio]] y [[Matriz competitiva gimnasia]]. |
| Decision | Adoptar modelo **freemium agresivo + monetizacion multi-linea** con un **unico precio equilibrado para todo el mercado hispano** (Espana + LATAM, sin diferenciacion por pais). Plan trial 7 dias sin tarjeta + Free util hasta 30 gimnastas + Starter a 19 €/mes (≈ 20 USD) + Growth a 49 €/mes + Network a 99 €/mes. Fee de procesamiento 0 € markup sobre Stripe directo. 5 lineas de monetizacion diferida post-lanzamiento: upsells (mes 3-6), marketplace B2B de proveedores (mes 6-12) con PAWSGRIP como primer vendor, marketplace de padres `/descubre` (mes 6-12), eventos y competiciones (mes 12-18), datos/insights/partnerships (mes 18+). |
| Consecuencia | Zaltyko se aleja del modelo Mindbody/GymDesk (SaaS caro) y se acerca a Playtomic/Calendly/HubSpot (free como growth engine, revenue por comunidad/upsell). Pricing unico refuerza identidad de comunidad global y simplifica operacion. Riesgo bajo: free util puede inflar DB sin conversion → mitigado con monitorizacion de coste y techo de registro. Riesgo medio: monetizacion Lineas 1-2 requiere capacidad de ejecucion rapida para llegar a break-even operativo. Sinergia critica: PAWSGRIP sera el primer vendor del marketplace B2B, convirtiendo Zaltyko en canal de distribucion de PAWSGRIP. |
| Estado | Activa |

## 2026-06-23 - Analisis competitivo v2.0 con 9 competidores adicionales

| Campo | Valor |
| --- | --- |
| Contexto | El analisis competitivo v1 (marzo 2026) cubria 4 generalistas (GymDesk, MindBody, Pike13, Glofox). Faltaban competidores verticales y referencias Espanolas que son mas utiles para priorizar el MVP: iClassPro, Jackrabbit, Uplifter, Amilia SmartRec, ClassForKids, Sawyer, WellnessLiving, Playtomic Manager y Clupik. |
| Decision | Adoptar [[../../docs/marketing/zaltyko-competitors]] v2.0 (266→698 lineas) como doc tecnico canonico de competencia, ampliar [[Competidores]] del vault con los 4 que faltaban en la tabla corta, y convertir el analisis en backlog accionable: 3 tareas MVP (skill tracking + tokens, onboarding/parent experience, pricing escalonado/free) y 4 tareas P2/Fase 3 (marketplace `/descubre` + i18n, AI churn predictor, website builder federation-ready, competiciones con acta digital). |
| Consecuencia | Zaltyko cierra gaps criticos vs iClassPro y Jackrabbit en su vertical principal (skill tracking + parent portal) y se diferencia de Clupik y Playtomic por verticalidad gimnasia + UX moderna + espanol nativo. No se copian features de WellnessLiving/Amilia (AI, federation) en MVP por complejidad; quedan planeadas para Fase 3+. |
| Estado | Activa |

## 2026-06-24 - ESLint legacy config (no flat config) en Zaltyko

| Campo | Valor |
| --- | --- |
| Contexto | Sprint 6 intento push a Vercel fallo con `ESLint: Invalid Options: - Unknown options: useEslintrc, extensions - 'extensions' has been removed`. El proyecto usaba `eslint.config.mjs` (flat config con `FlatCompat`) sobre ESLint v8.57.1. Next.js 15.5 pasa opciones legacy incompatibles con flat config + ESLint v8. Ademas, el cluster page tenia regresion de hreflang donde `MODALITIES[slug].en` devolvia undefined. |
| Decision | (1) Mantener `.eslintrc.json` legacy mientras se use ESLint v8; flat config requiere ESLint v9. Reglas react-hooks v5+ omitidas (no existen en v4). (2) En `generateMetadata` de paginas cluster, indexar `MODALITIES`/`COUNTRIES` por clave interna (`modalityKey`/`countryKey`), nunca por slug traducido. Documentado en [[Patrones obligatorios]] y [[Runbook deploy]]. |
| Consecuencia | Build de Vercel vuelve a funcionar. 207 paginas se pre-renderizan correctamente. Pitfall documentado para evitar regresion en futuros proyectos. |
| Estado | Activa |

## 2026-06-24 - Resumen de sprints 0-6 ejecutados

| Sprint | Tema | Commits | Resultado |
| --- | --- | --- | --- |
| 0 | Quick Wins | (local) | sitemap fallback, contraste WCAG AA, theme_color PWA, pricing toggle, mailgun timing-safe |
| 1 | Seguridad CRITICAL | (pushes) | RLS academy_link_requests, middleware consolidado, JWT firma HS256, ESLint build, smoke/validate-rls CI, .github workflows tracked |
| 2 | Base de Datos | (pushes) | SSL fix (CA cert), 4 tablas leak-profitability creadas, 5 RLS lateral modules. Diferido: 25 tablas TS faltantes en DB, policies permisivas |
| 3 | Arquitectura y DX | (pushes) | i18n middleware consolidado, AppError tree, Sentry tracesSampler 0.1/0.05, withErrorHandler + withBearerTenant, athletes repo |
| 4 | Testing | (pushes) | 29 tests reales (10 components + 19 validators), Playwright x3 browser + parallel, Codecov upload, E2E CI con secrets, migrations integrity |
| 5 | Frontend + Negocio | `324a5f2` | memo (6 cluster + 4 widgets), lazy DashboardPage + Eventos, touch targets DashboardTopbar, hreflang, CommunicationHub, coach quick actions |
| 6 | Code Split + Producto + Deuda + Validacion | `c2cfb88`, `fadbe93`, `9e80249` | RHF+Zod QuickClassModal, i18n extras (80 keys), CommunicationHub, policies permisivas endurecidas (10 tablas), 6 tablas criticas creadas con FKs+RLS |
| 6-fix | Vercel deploy fix | `5c77418` | ESLint legacy config + hreflang undefined arreglado |
