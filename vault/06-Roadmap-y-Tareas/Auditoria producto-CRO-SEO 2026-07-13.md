---
status: active
owner: producto/marketing
created: 2026-07-13
last_reviewed: 2026-07-13
source:
  - ../../src/app/page.tsx
  - ../../src/app/(site)/home/
  - ../../src/app/app/[academyId]/
  - ../03-Negocio/Pricing.md
  - ../04-Marketing/Mensajes aprobados.md
---
# Auditoría producto / CRO / copy / SEO — 2026-07-13

> **Coordinación multi-agente**: cualquier agente (Codex incluido) que vaya a tocar la landing, el pricing, el SEO o el flujo de asistencia debe leer esta nota primero. **Actualización 2026-07-13 (misma sesión)**: el bloque "Hoy (0–48h)" de la sección 8 ya está aplicado en `src/` — ver detalle al final del documento. El resto (7 días / 30 días), incluida toda la sección 6 de código, sigue sin aplicar. Algunas correcciones de copy requieren actualizar antes [[Mensajes aprobados]] (marcadas con ⚑) — la del CTA principal ya se hizo.

Toda afirmación lleva evidencia `archivo:línea` o "**verificado en vivo** (2026-07-13, zaltyko.com)". Lo no verificable va marcado `[SUPUESTO]` con método de validación.

---

## 0. Modelo mental (Fase 1, 10 líneas)

Zaltyko no vende software: vende que la Directora deje de perseguir cuotas por WhatsApp y de montar la temporada en Excel. Su negocio real es freemium loss-leader ([[Pricing]]): el SaaS barato compra la comunidad; el dinero llega después por add-ons/marketplace/eventos. Eso implica que **la métrica que manda es academias activadas, no MRR** — y por tanto la landing debe empujar auto-registro (Free/Trial), no "solicitar demo". La compradora decide en junio–septiembre; estamos en julio: **cada semana de fricción cuesta una cohorte anual entera**. Sus dos miedos dominantes son "tendré que meter 300 alumnas a mano" (activación) y "mis entrenadoras no lo usarán" (móvil en pista). Hoy el producto falla exactamente en esos dos puntos: el import CSV existe pero no está cableado a ninguna pantalla, y pasar lista requiere 5-6 clics en un modal con selects. El mecanismo único defendible es real — único vertical de gimnasia en español con free útil y sin tarjeta — pero la landing lo esconde detrás de un formulario de contacto. Y el SEO, canal principal de un vertical de nicho, está regalando el dominio entero a `zaltyko.vercel.app`. Si este modelo está mal en algo, es en el estado de pago de la academia piloto `[SUPUESTO: validar si paga o está en free/trial]`.

---

## 1. Veredicto

1. **Hoy la Directora no compraría** — ni siquiera podría: el 95 % de los CTAs llevan a un formulario de contacto (`/contact?type=demo`), y ella no quiere hablar con nadie, quiere probar. La oferta irresistible (Free 30 + trial 7 días sin tarjeta) ya existe en producto y en `/pricing`, pero la landing la esconde.
2. La promesa del hero ("orden, cobros claros y menos improvisación") es correcta de dirección pero no tiene número, ni mecanismo, ni oferta.
3. La landing promete lo que el producto todavía no cumple: "los coaches pueden marcar asistencia desde su teléfono" (FAQ) contra un flujo real de 5-6 clics con `<select>` por fila y sin offline. Eso es churn de entrenadoras garantizado.
4. El mayor punto de abandono de activación —migrar 300 alumnas— no tiene solución operativa: `CsvImportDialog` e `ImportExportPanel` existen en código pero **no se renderizan en ninguna página**.
5. El SEO está roto de raíz: canonical, sitemap (71 URLs), robots y og:url apuntan todos a `zaltyko.vercel.app` (**verificado en vivo**). Todo el trabajo de SEO programático actual acumula autoridad para el dominio equivocado.
6. Hay datos falsos publicados: el schema anuncia "Starter 49 €" cuando cuesta 19 € (`src/app/page.tsx:131-153`), y "15h ahorradas / 3x más eficiencia" (`SeoExtendedSection`) mientras otra sección eliminó sus stats "por no tener datos reales".
7. Estéticamente es el kit por defecto de SaaS generado por IA: ~13 blobs `blur-3xl`, H1 en gradiente, badges `animate-ping`, iconos Lucide en cuadraditos de gradiente. Nada dice "gimnasia".
8. Lo que está bien: la especificidad del vertical en el copy, el FAQ honesto sin testimonios inventados, el pricing simple, y una base técnica (Next 14, RLS, 276 APIs) que no estorba nada de lo propuesto.
9. **Si solo se puede arreglar una cosa**: cambiar el CTA principal de toda la landing de "Solicitar demo" a "Crea tu academia gratis" (registro self-service que ya existe: `/auth/register?role=owner`), con el trial de Starter como puente. Es un cambio de href y copy, 0 arquitectura, y convierte una web de folleto en una máquina de activación.
10. Empatado en urgencia (mismo día): la variable `NEXT_PUBLIC_APP_URL` en Vercel — un cambio de env var que rescata todo el canal SEO.

---

## 2. Diagnóstico de oferta y promesa

**Promesa actual** (`HeroSection.tsx:59-68`): "Dirige tu academia de gimnasia con orden, cobros claros y menos improvisación". Dirección correcta (habla de dirigir, no de "software"), pero: sin número, sin plazo, sin mecanismo, sin oferta. "Menos improvisación" es un beneficio sin sujeto — ¿menos que qué?

**Mecanismo único real (verificable, no inventado)**: (a) único software de gestión específico de gimnasia artística/rítmica en español — Clupik es multideporte, iClassPro/Jackrabbit son en inglés y en USD; (b) modela lo que un CRM genérico no tiene: niveles, aparatos, ramas GAF/GAM/rítmica, evaluaciones técnicas con rúbricas (`ModulesSection.tsx:20-87`, seeds de configuración por disciplina en `OwnerOnboardingForm.tsx`); (c) la barrera de entrada más baja del mercado: Free útil hasta 30 gimnastas + 7 días de Starter sin tarjeta ([[Pricing]] — ningún competidor combina ambas).

**Promesa propuesta** (hero): oferta + mecanismo + dolor concreto, en el idioma del club:

> **Las cuotas cobradas, los grupos montados y la lista pasada — sin Excel y sin 14 chats de WhatsApp.**
> Zaltyko es el software de gestión hecho solo para clubes de gimnasia artística y rítmica: gimnastas por nivel y aparato, cuotas recurrentes, asistencia desde el móvil y familias informadas. Gratis hasta 30 gimnastas. Sin tarjeta.

**5 headlines alternativos** (todos compatibles con [[Mensajes aprobados]]; el nº 4 requiere que el trial esté verificado en producción según su regla ⚑):

| # | Headline | Ángulo | Cuándo usarlo |
|---|---|---|---|
| 1 | "Deja de perseguir cuotas por WhatsApp. Zaltyko te dice quién ha pagado y quién no — y avisa a las familias por ti." | Dolor nº 1 (impagos). Schwartz: problema consciente. | Test A del hero; Google Ads de "cobrar cuotas club". |
| 2 | "Tu club de gimnasia entero — gimnastas, grupos, cuotas y familias — fuera del Excel en una semana." | Enemigo común (Excel) + plazo. ⚑ el plazo "una semana" requiere evidencia operativa antes de publicar ([[Mensajes aprobados]] prohíbe duración cerrada sin evidencia). | Cuando haya 2-3 migraciones reales medidas. |
| 3 | "El único software de gestión hecho para gimnasia artística y rítmica, en español." | Mecanismo único / categoría. Hormozi: claim de exclusividad verificable. | SEO (title), comparativas vs Clupik/iClassPro. |
| 4 | "Gratis hasta 30 gimnastas. 19 €/mes hasta 75. Sin tarjeta y sin permanencia." | Oferta pura. Para tráfico caliente que ya compara. | /pricing, retargeting, emails de cierre de temporada. |
| 5 | "Empieza la temporada con las matrículas, los grupos y las cuotas ya montados." | Estacionalidad (junio-septiembre). Urgencia real, no fabricada. | Campaña de captación agosto-septiembre. |

---

## 3. Auditoría pantalla por pantalla

### 3A. Superficie pública

#### Hero (`src/app/(site)/home/HeroSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | CTA primario "Solicitar demo" → `/contact?type=demo` (línea 75) | Pide una llamada a quien quiere probar solo; la oferta trial/free no tiene ruta desde el hero | **P0** | Conversión | CTA primario "Crea tu academia gratis" → `/auth/register?role=owner`; secundario "Ver precios". Ver código §6.1 |
| 2 | H1 con gradiente de texto (línea 61) + badge `animate-ping` (52) + blob `blur-3xl` (41) + tarjetas con icono en gradiente (123) + card flotante `animate-bounce` (137) | Anti-patrón "SaaS de IA" completo, criterio de aprobación del Bloque 3 | P1 | Confianza | Sustituir por el hero de §6.1: texto plano navy, sin blobs, captura real del producto |
| 3 | Microcopy "Sin tarjeta de crédito · Puesta en marcha guiada · Sin compromiso" (97-105) | Promete "sin tarjeta" pero el CTA no lleva a ningún sitio donde eso aplique | P1 | Conversión/Confianza | Mantener el microcopy y hacerlo verdad: CTA a registro |
| 4 | Visual derecho: 4 tarjetas de features, cero producto | El producto nunca se ve; `public/screenshots/home.png` y `mobile.png` existen y solo se usan en el manifest PWA | P1 | Conversión | Captura real del dashboard (o del flujo de pasar lista móvil cuando exista) con marco de navegador simple |
| 5 | "Ver demo en 2 min" ancla a `#demo` | El destino es un vídeo falso (ver Demo) — promesa rota a un clic | **P0** | Confianza | Retirar el CTA hasta tener vídeo real, o grabar un Loom de 90s del producto real esta semana |

#### Social proof (`SocialProofSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Sección de prueba social sin ninguna prueba (stats eliminados por comentario "no real data") | Una sección que se titula a sí misma "social proof" y no la tiene resta más que no existir | P1 | Confianza | Sustituir por bloque "Construido con un club real": caso de la academia piloto con nombre, nº de gimnastas y 1 cita `[SUPUESTO: pedir permiso y cita al piloto — es la acción de marketing más rentable disponible]`. Mientras no exista, eliminar la sección |

#### Comparativa vs Excel (`ComparisonSection.tsx`) y "Por qué Zaltyko" (`WhyZaltykoSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Dos tablas comparativas consecutivas (secciones 4 y 5 de `page.tsx:82-128`) que dicen casi lo mismo | Duplicación diluye el argumento y alarga la página | P1 | Conversión | Fusionar en una sola tabla de 3 columnas: Zaltyko / Excel+WhatsApp / Software genérico (Clupik, iClassPro) — nombrar a la competencia da credibilidad |
| 2 | Fila "Tiempo de configuración: 2 horas" | Cifra sin fuente, y [[Mensajes aprobados]] prohíbe prometer duración cerrada sin evidencia | **P0** | Confianza/Legal | Cambiar a "Puesta en marcha guiada" hasta medir 3 onboardings reales |
| 3 | Fila "Trial gratis sin tarjeta" en la tabla | Verdadero en pricing pero ningún CTA de la página lleva al trial | P1 | Conversión | Hacer la celda clicable → `/auth/register?role=owner` |
| 4 | 2 blobs (`ComparisonSection.tsx:99-100`) + 1 blob de 800px (`WhyZaltykoSection.tsx:21`) | Anti-patrón | P2 | Confianza | Eliminar (fondo plano `bg-zaltyko-white`) |

#### Módulos (`ModulesSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | 8 tarjetas idénticas con icono Lucide en cuadrado de color + barra de acento en gradiente (líneas 124-127) | El anti-patrón tarjeta-icono-pastel, ×8 | P1 | Confianza | Rediseñar como lista densa de dos columnas con pictogramas de aparatos (§5, decisión firmada 2) y una captura del módulo real por cada 2 módulos |
| 2 | "categorías por edad/level" (tarjeta Eventos) | Spanglish en copy público | P2 | Confianza | "categorías por edad y nivel" |
| 3 | Claims "Asistencia automática" y "registro de asistencia en tiempo real" (tarjeta Clases) | El producto real es marcado manual en modal (`AttendanceDialog.tsx`); "automática" es falso | **P0** | Confianza | "Pase de lista desde el móvil" (cuando §6.4 esté aplicado) o "Registro de asistencia por sesión" |
| 4 | 2 blobs (94-95) | Anti-patrón | P2 | Confianza | Eliminar |

#### Demo (`DemoSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | "Vídeo demo" falso: divs simulando un panel, botón de play que no reproduce nada, texto "Haz clic para ver el demo (90 segundos)" (líneas 38-64) | Un botón de play muerto es la peor traición de confianza de la página: el visitante hace clic y no pasa nada | **P0** | Conversión/Confianza | Hoy: eliminar la sección y el ancla `#demo`. 7 días: grabar screencast real de 90s (pasar lista + ver impagos + avisar a familias) y embeberlo como `<video>` autohosted con poster |

#### SeoExtended (`SeoExtendedSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Stats "15h ahorradas por semana", "3x más eficiencia" (línea 54 y sig.) | Cifras inventadas; contradice a `SocialProofSection`, que eliminó las suyas por el mismo motivo | **P0** | Confianza/Legal | Eliminar las 4 stats. Conservar el bloque antes/después, que es bueno y no necesita números |

#### Testimonios (`TestimonialsSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | 3 tarjetas placeholder "Próximamente" con avatar "?" | Honesto pero es publicar el hueco. Señala "nadie nos usa" en el punto exacto donde el visitante busca lo contrario | P1 | Conversión/Confianza | Eliminar la sección del render hasta tener 1 testimonio real del piloto. El código se conserva |

#### FAQ (`FaqSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | "Los coaches pueden marcar asistencia desde su teléfono al llegar a clase" | Contradicción con el producto real (5-6 clics, selects, sin offline — ver §3B) | **P0** | Confianza/Retención | Corto plazo: rebajar a "Zaltyko funciona en el navegador del móvil; el pase de lista optimizado para pista está en desarrollo". Correcto: construir §6.4 y dejar la promesa |
| 2 | Respuesta de migración desde Excel | Promete migración pero el import CSV no está cableado en el producto (§3B) | **P0** | Confianza/Activación | Alinear con la realidad: "te acompañamos en la migración" (cierto: puesta en marcha guiada) y cablear el import |
| 3 | Typo de clase `from-zaltyko-white0` (línea 49) | Clase Tailwind inexistente, gradiente roto | P2 | — | Corregir a `from-zaltyko-white` (o eliminar el gradiente) |

#### Integraciones (`IntegrationsSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Título "Integraciones" sin ninguna integración de terceros: las 4 tarjetas son features internas renombradas (líneas 7-37) | Engaña la expectativa (Stripe, WhatsApp, Calendar) y duplica Módulos | P1 | Confianza | Eliminar la sección. Si se quiere hablar de Stripe: una línea en pricing ("Cobros por Stripe, sin markup") |
| 2 | Iconos en cuadrados gradiente 16×16 + 2 blobs (44-45, 77) | Anti-patrón | P2 | Confianza | Cae con la sección |

#### CTA final (`FinalCtaSection.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | CTA "Solicitar demo" | Mismo P0 del hero | **P0** | Conversión | "Crea tu academia gratis" + secundario "Ver precios" |
| 2 | "Datos 100% seguros y encriptados" (bullet, líneas 8-13) y "🔒 encriptación de nivel bancario" | [[Mensajes aprobados]] prohíbe explícitamente "100% seguro"; "nivel bancario" es claim sin respaldo; emoji en copy de confianza | **P0** | Legal/Confianza | "Aislamiento de datos por academia y cifrado en tránsito" (claim aprobado). Sin emoji |
| 3 | SVG base64 de fondo + `backdrop-blur` + 2 blobs (20-23) | Anti-patrón | P2 | Confianza | Fondo navy plano; la sección oscura como cierre es buena idea, mantenerla |

#### Footer (`(site)/Footer.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Badge "RGPD Compliant" | [[Mensajes aprobados]] prohíbe "cumplimiento RGPD garantizado". Además desperdicia el argumento real: datos de menores | **P0** | Legal/Confianza | "Datos de menores protegidos — aislamiento por academia y control de acceso por rol". El RGPD con menores es argumento de venta si se cuenta como práctica, no como sello |
| 2 | Enlaces a `/terminos`, `/politica-privacidad`, `/sobre-nosotros`, `/ayuda`, `/integraciones` — todas redirigen 307 a canónicas en inglés (`/tos`, `/privacy-policy`, `/about`, `/help`, `/integrations`) | Saltos innecesarios; canónicas en inglés en un producto 100 % español | P1 | SEO | Invertir: canónica en español, redirect desde la inglesa (§7). Mientras: footer enlaza la canónica directamente |
| 3 | Iconos de redes deshabilitados "Próximamente" mientras el schema Organization declara `sameAs` a esas redes (`page.tsx:156-186`) | Dato estructurado sobre perfiles que no existen | P1 | SEO/Confianza | Quitar `sameAs` hasta que existan; quitar los iconos muertos del footer |
| 4 | 2 blobs (33-34) | Anti-patrón | P2 | Confianza | Eliminar |

#### /pricing (`pricing/page.tsx` + `(site)/pricing.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Starter (19 €) y Growth (49 €) → CTA "Contratar Starter" / "Solicitar demo" que llevan a `/contact?type=demo&plan=...` | El CTA dice "Contratar" y lleva a un formulario de contacto. [[Mensajes aprobados]] lo permite temporalmente ("mientras no exista handoff registro→checkout validado"), pero es fricción brutal en pre-lanzamiento | P1 | Conversión | Interim honesto: CTA "Empezar con el trial de Starter" → `/auth/register?role=owner` (el trial da Starter completo 7 días; el upgrade se hace desde Facturación, que es exactamente el flujo aprobado). 7-30 días: validar handoff registro→checkout y cambiar a "Contratar" real |
| 2 | Toggle "Anual (próximamente)" deshabilitado | UI muerta que solo comunica "esto no está terminado" | P1 | Conversión | Eliminar el toggle hasta que exista Price anual en Stripe ([[Pricing]] ya lo exige) |
| 3 | Bloque final migración → `mailto:ventas@zaltyko.com` | Un mailto pierde el lead (sin tracking, sin contexto) | P1 | Conversión | → `/contact?type=migracion` con el mismo formulario existente (`ContactForm` ya soporta motivo) |
| 4 | Banner trial con `animate-ping` (`pricing.tsx:53-55`) | Anti-patrón; el banner en sí es bueno | P2 | Confianza | Mismo banner sin punto animado |
| 5 | Schema Product del pricing correcto (0/19/49/99, `pricing/page.tsx:31-66`) | ✔ Está bien — pero convive con el SoftwareApplication falso de la home | — | — | Ver §7 |

#### /contact, /auth/register

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | `ContactForm`: 5 campos + select de motivo, honeypot, éxito "Te responderemos desde el equipo de Zaltyko" | ✔ Formulario correcto. Único fallo: sin promesa de plazo en el éxito | P2 | Conversión | "Te respondemos en menos de 24 h laborables" (claim ya usado en footer/FAQ) |
| 2 | No hay agendamiento real de demo (ni Calendly ni slots) | "Solicitar demo" = email. Para Network (99 €, onboarding acompañado) un calendario reduciría fricción | P2 | Conversión | `[SUPUESTO: volumen de demos aún = 0]` Añadir Cal.com/Calendly embebido solo para `type=network` cuando haya demanda |
| 3 | Metadata de `/contact` y `/help` con "gimnasi" truncado | Typo en title/description | P2 | SEO | Corregir |

### 3B. Superficie privada

*(Auditada por código fuente; sin sesión real. Lo marcado `[SUPUESTO]` requiere verificación en producto vivo.)*

#### Navegación / arquitectura de información (`src/lib/navigation/registry.ts:55-72`, `AcademySidebar.tsx`, `MobileAcademyNav.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | **No existe entrada "Asistencia" en el menú** (ni sidebar ni bottom-nav) | La tarea diaria nº 1 de la entrenadora no está en la navegación; solo se llega vía tarjeta KPI del dashboard o widget | **P0** | Retención | Añadir "Pasar lista" a `ACADEMY_NAV` con `mobile: true`, apuntando a la vista de sesiones de hoy (§6.4), no a la tabla índice |
| 2 | Bottom-nav móvil con 6 ítems (`MobileAcademyNav.tsx:65-88`) | 6 ítems en `justify-around` = objetivos táctiles pequeños | P2 | Retención | Máx. 5: Dashboard · Pasar lista · Atletas · Mensajes · Más |
| 3 | "Cobros" mezcla suscripción SaaS de la academia con cuotas de alumnas (`BillingPanel.tsx`) | La Directora buscando impagos aterriza en la gestión de su propia suscripción | P1 | Retención | Separar: "Cuotas" (alumnas) en el menú; "Suscripción Zaltyko" dentro de Ajustes |
| 4 | Tareas alta de alumna (1-2 clics), mensajes (1-2), impagos (2-3) | ✔ Correctas | — | — | — |

#### Pasar lista (índice `attendance/page.tsx` + `AttendanceDialog.tsx` + `ClassDetailView.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Flujo completo: dashboard → `/attendance` (tabla lectura) → "Revisar" → detalle de clase → botón texto `text-xs` "Registrar asistencia" (`ClassDetailView.tsx:334-341`) → modal → `<select>` nativo por atleta (`AttendanceDialog.tsx:334-350`) → Guardar. **5-6 clics + un select por gimnasta** | Incumple el criterio "a una mano, <30 s". La FAQ pública promete lo contrario. Es la razón por la que "mis entrenadoras no lo van a usar" se hará realidad | **P0** | Retención/Confianza | Vista "Hoy" mobile-first con botones de estado grandes por gimnasta y guardado optimista — código en §6.4 |
| 2 | Sin soporte offline: existe `src/lib/offline/operations-queue.ts` pero su único consumidor es `sync-status.tsx`; el POST de asistencia (`AttendanceDialog.tsx:191-206`) pierde el trabajo si cae la red | Pabellones con mala cobertura = caso base, no edge case | **P0** | Retención | Cablear la cola offline existente al guardado de asistencia (guardado optimista + reintento) |
| 3 | La tabla índice usa `overflow-hidden` (`attendance/page.tsx:189`), no `overflow-x-auto` | En móvil la tabla se corta, ni siquiera hay scroll | P1 | Retención | Mínimo: `overflow-x-auto`. Correcto: cards en móvil |
| 4 | El widget "Registrar Asistencia" del dashboard (`QuickActionsWidget.tsx:92-104`) enruta a la tabla de lectura, no al flujo de marcado | El atajo no atajea | P1 | Retención | Apuntarlo a la vista "Hoy" de §6.4 |
| 5 | Botones del footer del modal con `min-h-11` y "Marcar todos presentes" | ✔ Correctos; se conservan en el rediseño | — | — | — |

#### Onboarding y time-to-value (`onboarding/owner/`, `OwnerOnboardingForm.tsx`, `DashboardPage.tsx:419-438`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | **Import CSV muerto**: `CsvImportDialog.tsx` e `ImportExportPanel.tsx` + `api/athletes/import/route.ts` existen pero ningún page los renderiza; el aviso dev en `AthletesTableView.tsx:383-393` enlaza circularmente a `/athletes` | El miedo nº 1 de compra ("meter 300 alumnas a mano") no tiene respuesta: alta manual 1 a 1 es la única vía | **P0** | Activación | Cablear `ImportExportPanel` en `/athletes` y en el checklist de onboarding. El parser además solo lee el nombre (`CsvImportDialog.tsx:72`) — ampliarlo a nombre, fecha nac., grupo, contacto (con plantilla CSV descargable) |
| 2 | Wizard de creación de academia con seeds por disciplina/país | ✔ Muy bueno — es el mecanismo único hecho producto. Copy "Tu equipo y tus atletas entrarán más adelante mediante invitación" correcto | — | — | — |
| 3 | Checklist post-onboarding (7 pasos, `DashboardPage.tsx:429-438`) empieza por `create_first_group` | El paso con más fricción y más valor (importar alumnas) no es el primero ni existe como paso | P1 | Activación | Reordenar: 1) Importa o crea tus gimnastas (CSV), 2) crea grupos, 3) horario semanal, 4) invita entrenadora, 5) activa cuotas |
| 4 | Sin datos demo tras crear la academia | La Directora aterriza en un dashboard de ~16 secciones vacías | P2 | Activación | Estados vacíos accionables (§6.5) resuelven esto sin sembrar datos falsos |

#### Dashboard (`DashboardPage.tsx:458-610`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | ~15-18 secciones condicionales apiladas (comentario propio del código: "942 líneas, ~30 widgets") | Densidad sin jerarquía: todo respira igual, nada manda | P1 | Retención | Reducir above-the-fold a: saludo+CTA contextual, 4 KPIs, clases de hoy, impagos. El resto bajo "Ver más" |
| 2 | `FinancialSection` colapsada por defecto (`showFinancials=false`, línea 94) y `RecommendationsWidget` recibe `pendingPayments: 0` **hardcodeado** (línea 521) | El dolor nº 1 de la Directora (impagos) está escondido y las recomendaciones mienten sobre él | **P0** | Retención | KPI "Pendiente de cobro: X €" visible arriba, click → cuotas filtradas. Pasar el dato real al widget |
| 3 | KPIs con sparklines y enlaces (`KPISection.tsx:44-104`) | ✔ Accionables, bien | — | — | — |
| 4 | Sin señal de churn de alumnas (existe `AttendanceRiskWidget` pero vive en `/athletes:194`, no en el dashboard) | El dato que la Directora no tiene hoy en ningún sitio es la joya del producto y está enterrado | P1 | Retención | Subir "Gimnastas en riesgo (3+ faltas seguidas)" al dashboard |

#### Alumnas (`athletes/page.tsx`, `AthletesTableView.tsx`, `CreateAthleteDialog.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Tabla con `overflow-x-auto`, sin vista de cards móvil (patrón repetido en las 6 tablas principales) | Scroll horizontal en móvil = ilegible con una mano | P1 | Retención | Patrón tabla ≥md / cards <md — código §6.3 |
| 2 | Alta: solo nombre obligatorio; contacto familiar exige nombre+email+teléfono (`CreateAthleteDialog.tsx:511-540`) | ✔ Umbral bajo correcto. El email obligatorio del contacto puede frenar (hay familias sin email) | P2 | Activación | Hacer email O teléfono obligatorio, no ambos |
| 3 | Export CSV funcional, filtros, kanban | ✔ Bien | — | — | — |

#### Cuotas e impagos (`StudentChargesTab.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Sobre un impago solo hay "Registrar pago" y editar (líneas 454-469); el recordatorio a la familia solo existe como cron global (`triggers.ts:99`) | La acción más valiosa del producto —"reclamar este impago ahora"— no existe como botón | **P0** | Retención/Conversión | Botón "Enviar recordatorio" por fila → reutiliza la plantilla `payment-reminder` de Brevo ya existente, con confirmación y log |
| 2 | Resumen total/cobrado/pendiente + filtro "Solo pendientes/atrasados" | ✔ Bien | — | — | — |

#### Portal de familias (`MyDashboardPage.tsx`)

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Alerta de pagos pendientes con botón "Ver detalles" → ancla `#payments` de la misma página; el padre no puede pagar online | El plan Starter vende "portal padres completo" y pagos recurrentes; si el padre solo *ve* la deuda, el cobro sigue siendo manual | P1 | Retención | `[SUPUESTO: el pago online de cuotas por Stripe no está expuesto al padre — confirmar alcance real]` Si existe checkout de cuotas: botón "Pagar ahora". Si no: no prometer "pagos recurrentes" como automáticos en la landing |
| 2 | Estado sin atleta vinculado con CTA "Contactar con la academia" | ✔ Buen estado vacío | — | — | — |

#### Estados vacíos y transversales

| # | Elemento | Problema | Sev. | Impacto | Corrección |
|---|---|---|---|---|---|
| 1 | Sin componente `EmptyState` unificado; copy inconsistente ("No hay {grupos}", "Aún no has creado ningún {atleta}", "Academia no encontrada.") | El estado vacío es la pantalla más vista de una cuenta nueva y hoy es un callejón | P1 | Activación | Componente único con icono, texto, y CTA de siguiente paso — código §6.5 |
| 2 | Skeletons por ruta (`loading.tsx`) consistentes | ✔ Bien | — | — | — |
| 3 | Accesibilidad: disparador de asistencia `text-xs`, selects nativos sin label visible, 6 ítems en bottom-nav | Objetivos táctiles < 44px en el flujo más usado | P1 | Retención | Resuelto por §6.4; regla de sistema: mínimo `h-11` en cualquier control del flujo de pista |

---

## 4. Copy reescrito (antes / después)

### Landing

| Bloque | Antes (literal) | Después |
|---|---|---|
| Navbar CTA | "Solicitar demo" | "Crear cuenta gratis" |
| Hero badge | "Para gimnasia artística femenina, masculina y rítmica" (píldora animada) | Sin píldora. Eyebrow en mayúsculas pequeñas: "GIMNASIA ARTÍSTICA · GAM · RÍTMICA" |
| Hero H1 | "Dirige tu academia de gimnasia con orden, cobros claros y menos improvisación" | "Las cuotas cobradas, los grupos montados y la lista pasada. Sin Excel y sin 14 chats de WhatsApp." |
| Hero sub | "Zaltyko ayuda a academias de artística femenina, artística masculina y rítmica a ordenar grupos, horarios, familias, pagos y progreso técnico desde un solo lugar." | "Zaltyko es el software de gestión hecho solo para clubes de gimnasia artística y rítmica: gimnastas por nivel y aparato, cuotas recurrentes, asistencia por sesión y familias informadas." |
| Hero CTAs | "Solicitar demo" / "Ver demo en 2 min" | "Crea tu academia gratis" / "Ver planes" |
| Hero microcopy | "Sin tarjeta de crédito · Puesta en marcha guiada · Sin compromiso" | "Gratis hasta 30 gimnastas · Sin tarjeta · Sin permanencia" |
| Social proof | Párrafo genérico de posicionamiento | (Cuando haya permiso del piloto) "El club [nombre], con [N] gimnastas de artística y rítmica, lleva su temporada 2026-27 en Zaltyko." + cita. Hasta entonces: sección fuera |
| Comparativa H2 | "¿Por qué no seguir con Excel?" | "Lo que hoy haces en 4 herramientas" (columnas: Zaltyko / Excel + WhatsApp + Bizum / Software genérico de gimnasios) |
| Fila configuración | "Tiempo de configuración: 2 horas" | "Puesta en marcha: guiada por nosotros" |
| Módulos H2 | "Todo lo que tu academia necesita" | "Hecho para cómo funciona un club de gimnasia" |
| Módulos sub | "Módulos diseñados específicamente... Sin Excel, sin caos, sin perder tiempo." | "Niveles, aparatos, ramas GAF/GAM/rítmica, cuotas por grupo, evaluaciones con rúbrica. Cosas que un CRM genérico no sabe ni escribir." |
| Tarjeta Clases | "...registro de asistencia en tiempo real..." / "Asistencia automática" | "Pase de lista por sesión, control de aforo y lista de espera" |
| Demo H2 | "Mira cómo funciona Zaltyko" (vídeo falso) | (Con vídeo real) "90 segundos: pasa lista, mira quién debe la cuota, avisa a las familias" |
| Stats SeoExtended | "15h ahorradas por semana · 0 hojas de Excel · 100% comunicación controlada · 3x más eficiencia" | Eliminar. Mantener solo el antes/después |
| FAQ móvil | "...funciona perfectamente en móvil... Los coaches pueden marcar asistencia desde su teléfono al llegar a clase." | Interim: "Zaltyko funciona en el navegador del móvil sin instalar nada. Estamos puliendo el pase de lista rápido para pista; hoy se registra desde el detalle de cada clase." (Tras §6.4: recuperar la promesa original, ya cierta) |
| CTA final H2 | "¿Listo para dirigir tu academia con más control?" | "Monta la próxima temporada en Zaltyko" |
| CTA final bullets | "...Datos 100% seguros y encriptados" | "Aislamiento de datos por academia · Control de acceso por rol · Exporta tus datos cuando quieras" |
| Trust footer | "🔒 Tus datos están protegidos con encriptación de nivel bancario" | "Trabajáis con datos de menores: cada academia está aislada y cada rol ve solo lo suyo." |
| Footer badge | "RGPD Compliant" | "Datos de menores protegidos" |
| Pricing CTA Starter/Growth | "Contratar Starter" → contacto | "Empezar con 7 días de Starter gratis" → `/auth/register?role=owner` ⚑ (activación desde Facturación según [[Mensajes aprobados]]) |
| Pricing migración | "¿Necesitas migrar datos...?" → mailto | Mismo texto → `/contact?type=migracion` |

### Microcopy crítico de la app

| Lugar | Antes | Después |
|---|---|---|
| Menú (nuevo ítem) | — (no existe) | "Pasar lista" |
| Estado vacío asistencia | "Aún no has registrado ninguna sesión. Crea clases y genera sesiones para empezar a llevar el control de asistencia de tus atletas." | "Cuando crees tu primera clase, aquí verás cada sesión lista para pasar lista en segundos." + botón "Crear primera clase" |
| Estado vacío atletas | "Aún no has creado ningún atleta" | "Trae a tus gimnastas: importa tu Excel en un minuto o crea la primera ficha a mano." + botones "Importar CSV" / "Nueva gimnasta" |
| Botón fila impago | — (no existe) | "Enviar recordatorio" → confirmación: "Enviaremos a [contacto] el recordatorio de la cuota de [mes] ([X] €). ¿Enviar?" |
| Checklist paso 1 | "Crea tu primer grupo" | "Importa tus gimnastas (o crea la primera)" |
| Guardado asistencia | "Guardando…" | "Guardado ✓ — puedes cerrar" (guardado optimista por toque, no por formulario) |
| Error genérico | "Academia no encontrada." | "No encontramos esta academia. Puede que el enlace sea antiguo — vuelve al panel." + botón |

---

## 5. Dirección de arte + design tokens

Base: la paleta de marca ya existente (`tailwind.config.mjs:16-49`) es buena y poco común (teal profundo + coral). El problema no es la paleta: es que se usa toda a la vez, en gradiente, como decoración. La dirección es **recortar y asignar función**.

### Tokens de color (hex + racional)

| Token | Hex | Función única |
|---|---|---|
| `navy` | `#0F172A` | Texto principal y superficies oscuras (CTA final). Nunca gradiente |
| `teal` (primary) | `#00796B` | **Único color de acción**: botones primarios, links, estados "Presente/Pagado" |
| `electric` | `#1FC7B6` | Solo datos: sparklines, barras de Recharts, focus ring. Prohibido en fondos decorativos |
| `coral` | `#FF6B57` | Solo alerta operativa: impagos, "Ausente", límites de plan. Si el coral aparece, hay algo que hacer |
| `indigo` | `#2B2E83` | Retirado de la landing (queda en logo). Su presencia hoy es lo que produce el look "SaaS morado de IA" |
| `mist` | `#CBD5E1` | Bordes y divisores. La elevación por defecto es **borde, no sombra** |
| `white` | `#F8FAFC` | Fondo de sección alterno. Sin blobs: alternancia plana blanco/`white`/navy |

### Tipografía

- **Display**: Space Grotesk (ya cargada, `--font-space-grotesk`) — pero con contraste real de escala: H1 56-72px/700/tracking -0.02em; H2 32px/700; eyebrows 12px/600/uppercase/tracking 0.08em. Nada a peso medio "flotando".
- **Texto**: Inter 16px/400, secundario `#475569`.
- **Cifras**: siempre `tabular-nums` + Space Grotesk 600 (KPIs, precios, deudas). Las cifras son el producto: se muestran como marcador de competición, grandes y alineadas.

### Escalas

- **Espaciado**: base 4px; secciones de landing a 96px (desktop) / 64px (móvil); interior de cards 16/20. Romper el ritmo a propósito: el hero y el pricing respiran el doble que el resto (jerarquía por espacio, no por decoración).
- **Radio**: sistema de 3 — `6px` (controles), `10px` (cards), `16px` (modales/sheets). Eliminar `rounded-2xl/3xl` decorativos dispersos.
- **Elevación**: nivel 0 = borde `mist`; nivel 1 (hover/activo) = borde teal + `shadow-soft`; nivel 2 (overlays) = `shadow-medium`. Retirar `shadow-brand/lift/glow` de reposo.

### 3 decisiones firmadas (reconocibles en una captura sin logo)

1. **La línea de practicable.** El acento visual de Zaltyko es una línea base de 2px teal — como la línea que delimita el practicable de 12×12 — bajo el elemento activo: tab seleccionada, card activa, celda de KPI. Sustituye a todos los gradientes y blobs. Una captura de Zaltyko se reconoce por sus subrayados teal sobre fondo plano.
2. **Marcador D+E.** Toda métrica compuesta se presenta como el código de puntuación FIG: cifra grande tabular + desglose pequeño debajo (p. ej. "1.240 € — 3 cuotas atrasadas · 2 pendientes"). Los KPIs no son tarjetitas con icono: son un marcador deportivo en fila, separado por divisores verticales `mist`.
3. **Chips de estado con esquina cortada.** Presente/Ausente/Tarde/Justificada e Impago/Pagado usan chips rectangulares con la esquina superior derecha cortada (`clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)`) — el gesto del dorsal/banderín de competición. Teal=positivo, coral=acción requerida, mist=neutro. Ningún otro SaaS los tiene.

**Prohibiciones de sistema** (lint visual): 0 `blur-3xl`, 0 `bg-clip-text` en headlines, 0 `animate-ping`/`animate-bounce`, 0 iconos-en-cuadrado-gradiente, 0 emojis en UI.

---

## 6. Código (listo para pegar)

Convenciones respetadas: tokens `zaltyko-*` existentes, `@/components/ui/*`, `cn()`, `memo` donde el proyecto lo usa. Los componentes 6.3-6.5 asumen tipos ya existentes en `src/types/athletes.ts` — ajustar imports al pegar.

### 6.1 Hero (`src/app/(site)/home/HeroSection.tsx`, reemplazo completo)

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export default function HeroSection() {
  return (
    <section className="relative bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 lg:py-36">
        <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="max-w-2xl">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal">
              Gimnasia artística · GAM · Rítmica
            </p>

            <h1 className="mb-6 font-display text-5xl font-bold leading-[1.05] tracking-tight text-zaltyko-navy sm:text-6xl lg:text-7xl">
              Las cuotas cobradas, los grupos montados y la lista pasada.
            </h1>
            <p className="mb-3 font-display text-2xl font-medium text-zaltyko-text-secondary">
              Sin Excel y sin 14 chats de WhatsApp.
            </p>

            <p className="mb-10 max-w-xl text-lg leading-relaxed text-zaltyko-text-secondary">
              Zaltyko es el software de gestión hecho solo para clubes de
              gimnasia artística y rítmica: gimnastas por nivel y aparato,
              cuotas recurrentes, asistencia por sesión y familias informadas.
            </p>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/register?role=owner"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "group h-14 bg-zaltyko-teal px-8 text-base text-white hover:bg-zaltyko-primary-dark"
                )}
              >
                Crea tu academia gratis
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/pricing"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-14 border-zaltyko-mist px-8 text-base text-zaltyko-navy hover:border-zaltyko-teal"
                )}
              >
                Ver planes
              </Link>
            </div>
            <p className="text-sm text-zaltyko-text-secondary">
              Gratis hasta 30 gimnastas · Sin tarjeta · Sin permanencia
            </p>
          </div>

          {/* Captura real del producto — decisión firmada 1: línea de practicable */}
          <figure className="relative border-b-2 border-zaltyko-teal">
            <div className="overflow-hidden rounded-[10px] border border-zaltyko-mist bg-zaltyko-white">
              <Image
                src="/screenshots/home.png"
                alt="Panel de dirección de Zaltyko: gimnastas, grupos, asistencia y cuotas de una academia de gimnasia"
                width={1280}
                height={800}
                priority
                className="w-full"
              />
            </div>
            <figcaption className="mt-3 text-xs text-zaltyko-text-light">
              El panel de dirección, tal cual es.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
```

### 6.2 Sección de precios (extracto de tarjeta de plan — sustituye la tarjeta actual de `(site)/pricing.tsx`; los datos siguen viniendo de `catalog.ts`)

```tsx
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type Plan = {
  name: string;
  priceEur: number;
  athleteLimit: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
};

export function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[10px] border bg-white p-6",
        // Decisión firmada 1: el plan destacado lleva línea de practicable, no badge en gradiente
        plan.highlighted
          ? "border-zaltyko-teal border-b-[3px]"
          : "border-zaltyko-mist"
      )}
    >
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-lg font-bold text-zaltyko-navy">
          {plan.name}
        </h3>
        {plan.highlighted && (
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-zaltyko-teal">
            Más elegido
          </span>
        )}
      </div>

      {/* Marcador D+E: cifra grande tabular + desglose */}
      <p className="font-display text-5xl font-bold tabular-nums text-zaltyko-navy">
        {plan.priceEur === 0 ? "0 €" : `${plan.priceEur} €`}
        <span className="ml-1 text-base font-medium text-zaltyko-text-secondary">
          /mes
        </span>
      </p>
      <p className="mb-6 mt-1 text-sm text-zaltyko-text-secondary">
        {plan.athleteLimit} · 1 sede · sin permanencia
      </p>

      <ul className="mb-8 space-y-2.5 text-sm text-zaltyko-text-main">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-zaltyko-teal" />
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={plan.ctaHref}
        className={cn(
          buttonVariants({ size: "lg" }),
          "mt-auto h-12 w-full",
          plan.highlighted
            ? "bg-zaltyko-teal text-white hover:bg-zaltyko-primary-dark"
            : "border border-zaltyko-mist bg-white text-zaltyko-navy hover:border-zaltyko-teal"
        )}
      >
        {plan.ctaLabel}
      </Link>
    </div>
  );
}
```

CTAs a pasar desde `catalog.ts`: Free → "Empezar gratis" `/auth/register?role=owner`; Starter → "7 días de Starter gratis" `/auth/register?role=owner` ⚑; Growth → "Probar con el trial" ídem; Network → "Hablar con Zaltyko" `/contact?type=network`. Eliminar el toggle anual del render.

### 6.3 Tabla de alumnas responsive (patrón tabla ≥md / cards <md, para `AthletesTableSections.tsx`)

```tsx
import { memo } from "react";
import { cn } from "@/lib/utils";

type AthleteRow = {
  id: string;
  name: string;
  group: string | null;
  level: string | null;
  status: "active" | "inactive";
  pendingCharges: number; // nº de cuotas pendientes/atrasadas
};

// Decisión firmada 3: chip con esquina cortada
const clipChip = {
  clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
} as const;

function StatusChip({ pending }: { pending: number }) {
  const overdue = pending > 0;
  return (
    <span
      style={clipChip}
      className={cn(
        "inline-block px-2.5 py-1 text-xs font-semibold tabular-nums",
        overdue
          ? "bg-zaltyko-coral/15 text-zaltyko-coral"
          : "bg-zaltyko-primary-ultralight text-zaltyko-teal"
      )}
    >
      {overdue ? `${pending} cuota${pending > 1 ? "s" : ""} pendiente${pending > 1 ? "s" : ""}` : "Al día"}
    </span>
  );
}

export const AthletesResponsiveList = memo(function AthletesResponsiveList({
  athletes,
  onOpen,
}: {
  athletes: AthleteRow[];
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {/* ≥ md: tabla densa */}
      <div className="hidden overflow-x-auto rounded-[10px] border border-zaltyko-mist md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zaltyko-mist bg-zaltyko-white text-left text-xs font-semibold uppercase tracking-[0.06em] text-zaltyko-text-light">
            <tr>
              <th className="px-4 py-3">Gimnasta</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3">Cuotas</th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => (
              <tr
                key={a.id}
                onClick={() => onOpen(a.id)}
                className="cursor-pointer border-b border-zaltyko-mist/60 last:border-0 hover:bg-zaltyko-white"
              >
                <td className="px-4 py-3 font-medium text-zaltyko-navy">{a.name}</td>
                <td className="px-4 py-3 text-zaltyko-text-secondary">{a.group ?? "—"}</td>
                <td className="px-4 py-3 text-zaltyko-text-secondary">{a.level ?? "—"}</td>
                <td className="px-4 py-3"><StatusChip pending={a.pendingCharges} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < md: cards a una mano */}
      <ul className="space-y-2 md:hidden">
        {athletes.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => onOpen(a.id)}
              className="flex min-h-[64px] w-full items-center justify-between rounded-[10px] border border-zaltyko-mist bg-white px-4 py-3 text-left active:border-zaltyko-teal"
            >
              <span>
                <span className="block font-medium text-zaltyko-navy">{a.name}</span>
                <span className="block text-xs text-zaltyko-text-secondary">
                  {[a.group, a.level].filter(Boolean).join(" · ") || "Sin grupo"}
                </span>
              </span>
              <StatusChip pending={a.pendingCharges} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
});
```

### 6.4 Pasar lista móvil (sustituto del select-por-fila; nueva vista "Hoy" y hoja de marcado)

Pensado para una mano y <30 s: un tap por gimnasta cicla el estado (o mantén pulsado para elegir), guardado optimista por toque contra `/api/attendance` reutilizando el payload actual de `AttendanceDialog`, y preparado para encolar en `src/lib/offline/operations-queue.ts` si el fetch falla.

```tsx
"use client";

import { memo, useCallback, useState, useTransition } from "react";
import { Check, X, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Status = "present" | "absent" | "late" | "excused";
type Athlete = { id: string; name: string; group: string | null };

const STATUS: { key: Status; label: string; icon: typeof Check; active: string }[] = [
  { key: "present", label: "Presente", icon: Check, active: "bg-zaltyko-teal text-white" },
  { key: "absent", label: "Ausente", icon: X, active: "bg-zaltyko-coral text-white" },
  { key: "late", label: "Tarde", icon: Clock, active: "bg-zaltyko-navy text-white" },
  { key: "excused", label: "Justif.", icon: FileText, active: "bg-zaltyko-mist text-zaltyko-navy" },
];

export const AttendanceSheet = memo(function AttendanceSheet({
  sessionId,
  athletes,
  initial,
}: {
  sessionId: string;
  athletes: Athlete[];
  initial: Record<string, Status | undefined>;
}) {
  const [marks, setMarks] = useState(initial);
  const [pendingSave, startSave] = useTransition();

  // Guardado optimista por toque: la entrenadora nunca espera a un formulario
  const save = useCallback(
    (athleteId: string, status: Status) => {
      setMarks((m) => ({ ...m, [athleteId]: status }));
      startSave(async () => {
        try {
          await fetch("/api/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, records: [{ athleteId, status }] }),
          });
        } catch {
          // TODO: encolar en src/lib/offline/operations-queue.ts y reintentar al recuperar red
        }
      });
    },
    [sessionId]
  );

  const markAllPresent = useCallback(() => {
    const all = Object.fromEntries(athletes.map((a) => [a.id, "present" as Status]));
    setMarks(all);
    startSave(async () => {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          records: athletes.map((a) => ({ athleteId: a.id, status: "present" })),
        }),
      });
    });
  }, [athletes, sessionId]);

  const marked = Object.values(marks).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      {/* Marcador D+E fijo arriba */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-zaltyko-teal bg-white px-4 py-3">
        <p className="font-display text-lg font-bold tabular-nums text-zaltyko-navy">
          {marked}
          <span className="text-zaltyko-text-light">/{athletes.length}</span>
          <span className="ml-2 text-sm font-medium text-zaltyko-text-secondary">
            {pendingSave ? "Guardando…" : "Guardado"}
          </span>
        </p>
        <Button variant="outline" size="sm" className="h-11 border-zaltyko-mist" onClick={markAllPresent}>
          Todas presentes
        </Button>
      </header>

      <ul className="flex-1 divide-y divide-zaltyko-mist/60 overflow-y-auto pb-24">
        {athletes.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zaltyko-navy">{a.name}</p>
              {a.group && <p className="truncate text-xs text-zaltyko-text-light">{a.group}</p>}
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={`Asistencia de ${a.name}`}>
              {STATUS.map(({ key, label, icon: Icon, active }) => {
                const selected = marks[a.id] === key;
                return (
                  <button
                    key={key}
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    onClick={() => save(a.id, key)}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-[6px] border transition-colors",
                      selected ? cn(active, "border-transparent") : "border-zaltyko-mist text-zaltyko-text-light"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
});
```

Ruta contenedora recomendada: `src/app/app/[academyId]/attendance/today/page.tsx` — lista las sesiones de hoy (cards, no tabla) y cada card abre `AttendanceSheet` a pantalla completa (`Sheet` de shadcn con `side="bottom"` y `h-[100dvh]`). El ítem de menú "Pasar lista" (`registry.ts`) apunta aquí.

### 6.5 Estado vacío unificado (`src/components/ui/empty-state.tsx`)

```tsx
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[10px] border border-dashed border-zaltyko-mist bg-zaltyko-white px-6 py-14 text-center",
        className
      )}
    >
      <Icon className="mb-4 h-8 w-8 text-zaltyko-teal" aria-hidden />
      <h3 className="mb-1 font-display text-lg font-bold text-zaltyko-navy">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-zaltyko-text-secondary">{description}</p>
      {(action || secondaryAction) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
```

Uso (atletas): `title="Trae a tus gimnastas"`, `description="Importa tu Excel en un minuto o crea la primera ficha a mano."`, `action=<Button>Importar CSV</Button>`, `secondaryAction=<Button variant="outline">Nueva gimnasta</Button>`.

---

## 7. Plan SEO

### Las 5 correcciones técnicas que más pesan (orden estricto)

1. **`NEXT_PUBLIC_APP_URL` en Vercel → `https://zaltyko.com`.** **Verificado en vivo**: canonical de la home = `https://zaltyko.vercel.app/`, `og:url`, las 71 URLs del sitemap y la línea `Sitemap:` del robots.txt apuntan todas a vercel.app. Hoy Google consolida señales en el dominio equivocado; es la corrección con más ROI de todo el informe y es una env var. Añadir redirect 301 de `zaltyko.vercel.app` → `zaltyko.com` y fallback de `metadataBase` a `https://zaltyko.com` en vez de localhost (`layout.tsx`).
2. **OG image.** `/api/og` no existe (**404 verificado en vivo**, referenciado en `layout.tsx`) y `og-image.svg` es un placeholder SVG (inválido para WhatsApp/LinkedIn — el canal por el que las directoras se comparten cosas). Unificar todo a `/og-image.png` (ya existe) hoy; ruta `@vercel/og` con título dinámico en 30 días.
3. **Datos estructurados falsos o huérfanos.** SoftwareApplication con "Starter 49 €" (`page.tsx:131-153`) → leer precio de `catalog.ts`. Eliminar el schema HowTo (sin contenido visible correspondiente = riesgo de spam estructural). Igualar FAQPage al texto visible exacto de `FaqSection`. Quitar `sameAs` a redes inexistentes y `geo`/`priceRange` inválidos del Organization.
4. **Canónicas e idioma.** Producto en español con canónicas en inglés (`/tos`, `/privacy-policy`, `/about`, `/help`) y el footer enlazando las versiones ES que hacen 307. Invertir: canónica ES (`/terminos`, `/privacidad`, `/sobre-nosotros`, `/ayuda`) con 301 desde la inglesa, footer enlazando directo. Añadir `alternates.languages` (hreflang `es`/`en` + `x-default`) donde exista versión `/en`.
5. **Sitemap.** Quitar `/auth/login` y las URLs con query de filtro (`?category=`); añadir `/help`, `/about`, `/contact`, legales y las 7 `/modules/*`; corregir el desajuste de clusters (JSONs huérfanos de `parkour`/`danza` en `src/content/clusters/es/espana` que no están en `MODALITIES`, y el claim "52 páginas" de `ClusterDiscoverySection.tsx:147`).

### Cluster de keywords (España; volúmenes = estimación de experiencia en el vertical, `[SUPUESTO]` validar con Search Console + Ads a los 60 días)

| Keyword | Intención | Dificultad est. | Destino |
|---|---|---|---|
| software gestión club gimnasia rítmica | Comercial | Baja | Home / cluster rítmica-España (ya existe) |
| programa gestión escuela gimnasia artística | Comercial | Baja | Cluster artística-España |
| app para pasar lista club deportivo | Comercial | Baja-media | Página módulo asistencia |
| cómo cobrar cuotas club deportivo / domiciliar cuotas gimnasio rítmica | Comercial-informacional | Baja | Módulo pagos + post |
| alternativa a Clupik | Comercial (comparación) | Baja | Página comparativa nueva `/vs/clupik` |
| iClassPro en español / alternativa iClassPro | Comercial | Baja | `/vs/iclasspro` |
| software gestión club gimnasia [Madrid/Barcelona/Valencia/Málaga] | Comercial local | Baja | SEO programático por ciudad (extensión natural del sistema de clusters ya construido) |
| licencias federativas gimnasia rítmica [federación] | Informacional (top-funnel del ICP exacto) | Baja | Contenido + clusters por federación (RFEG, FMGM…, ya listadas en `llms.txt`) |
| plantilla excel gestión club gimnasia | Informacional-trampa | Baja | Post con plantilla gratis descargable → lead magnet → "cuando se te quede pequeña" |
| gestión de asistencia gimnasia niños RGPD menores | Informacional-confianza | Baja | Post pilar sobre datos de menores |

**Arquitectura**: mantener `/[locale]/[modality]/[country]` (ya construida, es un activo). Añadir dos capas al mismo sistema: ciudad (`/es/gimnasia-ritmica/espana/madrid`) y comparativas (`/vs/[competidor]`). No crear blog genérico de "gestión deportiva": todo contenido cuelga del vertical gimnasia.

### 10 títulos de contenido con intención comercial real

1. "Clupik vs Zaltyko para clubes de gimnasia: qué incluye cada uno a 19 €, 35 € y 49 €"
2. "Cómo cobrar las cuotas de tu club de gimnasia sin perseguir a nadie: Bizum, transferencia y domiciliación comparados"
3. "Plantilla Excel gratuita para gestionar un club de gimnasia rítmica (y cuándo se te queda pequeña)"
4. "Cuánto cuesta de verdad gestionar un club de 150 gimnastas con Excel + WhatsApp"
5. "Licencias federativas de gimnasia rítmica en España 2026-27: plazos, precios y cómo no llegar tarde"
6. "Cómo pasar lista en un club de gimnasia sin cuaderno: 3 métodos y su coste real"
7. "iClassPro y Jackrabbit en español no existen: qué usan los clubes de gimnasia en España"
8. "RGPD y datos de menores en clubes deportivos: lo que tu club de gimnasia debe tener firmado"
9. "Cómo montar los grupos y horarios de la nueva temporada en una tarde (guía para directoras)"
10. "Qué mirar antes de contratar un software para tu club de gimnasia: 12 preguntas (con las respuestas de Zaltyko)"

---

## 8. Backlog priorizado (ICE: Impacto × Confianza × 1/Esfuerzo, 1-10)

### Hoy (0–48 h) — conversión sin tocar arquitectura

| Acción | I | C | E | Score | Ref. |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` → zaltyko.com + redirect vercel.app | 10 | 10 | 1 | **100** | §7.1 |
| CTA global "Solicitar demo" → "Crea tu academia gratis" (`/auth/register?role=owner`) en hero, navbar, sticky, CTA final ⚑ | 9 | 9 | 2 | **41** | §3A |
| Schema: precio Starter 49→desde `catalog.ts`; quitar HowTo y `sameAs` | 8 | 10 | 1 | **80** | §7.3 |
| OG: todo a `/og-image.png`; quitar referencia `/api/og` | 7 | 10 | 1 | **70** | §7.2 |
| Quitar claims sin respaldo: "2 horas", stats 15h/3x, "100% seguros", "nivel bancario", badge "RGPD Compliant", "asistencia automática" | 8 | 9 | 1 | **72** | §3A |
| Ocultar del render: Testimonios placeholder, DemoSection (vídeo falso), IntegrationsSection, toggle anual | 7 | 9 | 1 | **63** | §3A |
| FAQ móvil y migración alineadas con el producto real | 7 | 9 | 1 | **63** | §3A |
| Typo `from-zaltyko-white0`; footer → canónicas directas; mailto → `/contact?type=migracion` | 4 | 10 | 1 | **40** | §3A |

### 7 días — pantallas críticas

| Acción | I | C | E | Score |
|---|---|---|---|---|
| Flujo "Pasar lista hoy" móvil (§6.4) + ítem de menú + widget del dashboard apuntando ahí | 10 | 9 | 5 | **18** |
| Cablear import CSV en `/athletes` + checklist; parser completo + plantilla descargable | 10 | 9 | 4 | **22.5** |
| Hero nuevo (§6.1) con captura real; fusionar las 2 comparativas; grabar screencast 90 s y restaurar DemoSection con vídeo real | 8 | 8 | 4 | **16** |
| Botón "Enviar recordatorio" por impago (reutiliza plantilla Brevo `payment-reminder`) | 8 | 9 | 3 | **24** |
| Pricing: tarjetas §6.2 con trial como CTA ⚑; sitemap/canónicas/hreflang (§7.4-7.5) | 7 | 9 | 3 | **21** |
| Pedir cita + permiso a la academia piloto → bloque de social proof real | 9 | 7 | 2 | **31.5** |

### 30 días — sistema

| Acción | I | C | E | Score |
|---|---|---|---|---|
| Sistema de diseño §5 aplicado a landing y app (tokens de función, 3 decisiones firmadas, lint visual anti-blobs) | 7 | 8 | 6 | **9.3** |
| Cola offline cableada al guardado de asistencia | 8 | 8 | 5 | **12.8** |
| Dashboard: impagos arriba (dato real, no `pendingPayments: 0`), riesgo de churn visible, resto colapsado | 8 | 8 | 5 | **12.8** |
| `EmptyState` unificado (§6.5) en las 6 pantallas principales | 6 | 9 | 3 | **18** |
| SEO contenidos: 2 comparativas `/vs/` + 4 posts del §7 + capa ciudad en clusters | 7 | 7 | 6 | **8.2** |
| Onboarding reordenado (import primero) + handoff registro→checkout validado para "Contratar" real | 8 | 7 | 6 | **9.3** |
| OG dinámico `@vercel/og` | 4 | 9 | 3 | **12** |

---

## 9. Qué medir

Los 5 eventos (el helper `analytics.*` ya existe — `EmailCapture.tsx` usa `analytics.leadCaptured`):

| Evento | Definición | Umbral de éxito (30 días tras aplicar "Hoy") |
|---|---|---|
| `landing_cta_primary_click` | Click en el CTA primario, con `variant` (demo vs registro) y sección de origen | CTR visita→click ≥ 5 %; registro debe superar a demo ≥ 3:1 `[SUPUESTO: benchmarks de SaaS self-serve; recalibrar con datos propios]` |
| `academy_created` | Registro completado + wizard de academia terminado | ≥ 60 % de los registros que inician el wizard lo terminan |
| `athletes_bulk_or_10` | Import CSV completado o 10ª gimnasta creada (momento "ajá" nº 1) | ≥ 40 % de academias nuevas en sus primeros 7 días |
| `attendance_marked` | Primera sesión con asistencia guardada, con `elapsed_ms` desde apertura de la vista | ≥ 50 % de academias activas en la semana 1; mediana de marcado < 30 s tras §6.4 |
| `charge_reminder_sent` + `trial_started`/`trial_converted` | Recordatorio manual de impago enviado; trial activado y convertido a Starter | Trial→Starter ≥ 15 % `[SUPUESTO]`; % de academias que envían ≥1 recordatorio en el mes ≥ 30 % (proxy de que el producto cobra por ellas) |

Regla de lectura: si `academy_created` sube pero `athletes_bulk_or_10` no, el cuello es la migración (import). Si ambos suben y `attendance_marked` no, el cuello es la entrenadora (móvil). Son los dos miedos del buyer persona convertidos en funnel.

---

*Fin de la auditoría. Cambios de copy marcados con ⚑ requieren actualizar [[Mensajes aprobados]] antes de publicarse.*

## Addendum — aplicación del bloque "Hoy (0–48h)" (2026-07-13, misma sesión)

Se aplicó en `src/` todo el bloque "Hoy" de la sección 8, verificado con `pnpm typecheck` (0 errores), `eslint` sobre los archivos tocados (0 errores, solo warnings preexistentes no relacionados) y navegación real en `pnpm dev` (home, `/pricing`, `/contact?type=migracion`). El resto del informe (7 días, 30 días, toda la sección 6 de código) sigue sin aplicar.

**Código cambiado:**
- `src/app/layout.tsx`: `metadataBase`/`og:url` fallback de `localhost:3000` → `https://zaltyko.com`; OG image `/api/og` (404 real) → `/og-image.png`.
- `next.config.mjs`: añadido `redirects()` 301 de host `zaltyko.vercel.app` → `https://zaltyko.com` (consolida señales SEO en el dominio canónico).
- `src/app/page.tsx`: precio del schema `SoftwareApplication` ahora lee `PRODUCT_PLAN_BY_CODE.pro.priceEurCents` (era "49" hardcodeado, real 19€); eliminados el schema `HowTo` (sin contenido visible correspondiente) y los campos inválidos `geo`/`priceRange`/`sameAs` del `Organization`; `og-image.svg` → `.png`; texto de FAQPage para migración/móvil alineado con `FaqSection.tsx`; quitado el "Cumplimos con el RGPD" del schema de aislamiento de datos; retiradas del render `TestimonialsSection`, `DemoSection` e `IntegrationsSection` (los componentes se conservan en el repo, solo se sacaron del render).
- CTA principal (Navbar, Hero, StickyCtaBar, FinalCtaSection, SeoExtendedSection) de "Solicitar demo" → "Crea tu academia gratis"/"Crear cuenta gratis" apuntando a `/auth/register?role=owner`. El secundario del hero ("Ver demo en 2 min" → `#demo`) pasa a "Ver planes" → `/pricing`, porque la sección `#demo` ya no se renderiza.
- Claims retirados o corregidos: "2 horas" de configuración (`ComparisonSection.tsx`) → "Puesta en marcha guiada"; stats inventados 15h/0/100%/3x (`SeoExtendedSection.tsx`) eliminados; "asistencia automática"/"en tiempo real" (`ModulesSection.tsx`) → "asistencia por sesión"; "Datos 100% seguros y encriptados" y "🔒 ... nivel bancario" (`FinalCtaSection.tsx`) → lenguaje de aislamiento por academia; badge "RGPD Compliant" (`Footer.tsx`) → "Datos de menores protegidos".
- `FaqSection.tsx`: typo `from-zaltyko-white0` corregido; respuestas de migración y de "¿Funciona en móvil?" reescritas para no prometer lo que el flujo real de asistencia (§3B) todavía no cumple.
- `Footer.tsx`: enlaces `/integraciones`, `/ayuda`, `/sobre-nosotros`, `/terminos`, `/politica-privacidad` apuntan ahora directo a sus canónicas (`/integrations`, `/help`, `/about`, `/tos`, `/privacy-policy`) sin pasar por el redirect 307; "Solicitar demo" → "Crear cuenta gratis".
- `src/app/(site)/pricing.tsx`: quitado el toggle "Anual (próximamente)" (UI muerta); el bloque de migración pasa de `mailto:ventas@zaltyko.com` a `Link` interno `/contact?type=migracion`.
- `src/components/contact/ContactForm.tsx`: añadida la opción de motivo `migracion` (antes no existía, así que el nuevo enlace habría caído por defecto en "Solicitar demo").
- **Sin tocar** (fuera de alcance de "Hoy", quedan en el backlog de 7/30 días del propio informe): CTAs de Starter/Growth en `/pricing` (siguen a `/contact?type=demo` por la regla de [[Mensajes aprobados]] de no prometer checkout sin handoff validado), blobs/gradientes/animaciones (rediseño visual, sección 5-6), flujo real de pasar lista móvil, import CSV cableado, canónicas ES/EN invertidas, sitemap/hreflang.

**Vault actualizado:** `Mensajes aprobados.md` (nueva línea documentando que el CTA principal de la landing dirige a registro Free en vez de demo, con referencia a esta auditoría) y esta misma nota.

**Pendiente / no aplicable desde aquí:** la variable de entorno `NEXT_PUBLIC_APP_URL` en Vercel sigue sin corregirse — eso requiere acceso al dashboard de Vercel, no a este repo. El código ya tiene el fallback y el redirect correctos; falta que production tenga la env var puesta a `https://zaltyko.com` para que el `canonical`/`og:url` en vivo dejen de mostrar `zaltyko.vercel.app`.

## Addendum 2 — aplicación del bloque "7 días" (2026-07-13, misma sesión)

A petición explícita del usuario ("corrige lo que falta") se aplicó también la mayor parte del bloque "7 días" de la sección 8. Verificado con `pnpm typecheck` (0 errores) y `pnpm lint` sobre todo `src/` (0 errores). Verificación visual en `pnpm dev` para lo público (home, `/pricing`, `/help`); lo privado (dashboard, atletas, asistencia, cobros) no se pudo probar en navegador por no tener sesión — solo typecheck/lint, igual que el resto de la superficie privada en este informe.

**Hallazgo nuevo durante la ejecución (no estaba en el informe original):** `public/screenshots/home.png` y `mobile.png` — que el informe original asumía "capturas reales sin usar"  — en realidad son placeholders: una tarjeta azul sólida con el texto "Zaltyko / Dashboard", no una captura del producto. Por eso el hero rediseñado (§6.1 de este informe) **no las usa**: se sustituyó por un panel ilustrativo de pase de lista construido con los tokens de marca (chips de esquina cortada, marcador D+E), explícitamente no presentado como captura de pantalla. Sigue pendiente conseguir una captura real o grabar el screencast recomendado en la sección 3A (Demo).

**Código cambiado:**
- **SEO técnico**: `sitemap.ts` — quitado `/auth/login` y las URLs con query de marketplace/empleo; añadidas `/help`, `/about`, `/contact`, `/tos`, `/privacy-policy` y las 7 rutas `/modules/*`; fallback de `baseUrl` corregido. `robots.ts` y 7 páginas más (`changelog`, `features`, `about`, `status`, `blog`, `integrations`, `pricing`, `contact`, `help`) — mismo fix de fallback `localhost:3000` → `https://zaltyko.com`. Se decidió **no** añadir hreflang a la home: no existe una versión `/en` real (solo redirige a `/`), así que declarar `alternates.languages` habría sido un hreflang falso; las páginas de cluster ya lo tienen bien implementado. `help/page.tsx` y `contact/page.tsx`: typo "gimnasi" → "gimnasia".
- **`help/page.tsx` — 3 claims falsos encontrados y corregidos** (no estaban en el informe original, aparecieron al tocar el archivo por el typo): "escaneo de código QR" para asistencia (no existe, cero resultados en el código), "Configuración > Importar" (ruta inexistente) y "Configuración > Suscripción... con prorrateo" (ruta inexistente, aunque sí existe `/api/billing/portal`) — las tres reescritas para reflejar el producto real.
- **Import CSV cableado en `/athletes`**: nuevo botón "Importar CSV" en la toolbar y en el estado vacío (`AthletesTableSections.tsx`), modal con `ImportExportPanel` (antes huérfano, no se renderizaba en ninguna página). Se le pasa `tenantId`/`academyId` reales para que no pida un UUID a mano, y la plantilla CSV descargable ahora trae el `academyId` real de la academia en vez del placeholder `ACADEMY_UUID`. `athletes/page.tsx` ahora selecciona `academies.tenantId`. Checklist de onboarding (`onboarding-utils.ts`) reordenado: "Añade al menos 5 atletas" pasa a ser el primer paso (antes era "Crea tu primer grupo"), con descripción actualizada mencionando el CSV.
- **Botón "Enviar recordatorio" en impagos**: nueva función `sendManualPaymentReminder()` en `src/lib/email/triggers.ts` (reutiliza la plantilla Brevo `payment-reminder` ya existente, verifica que el cargo pertenezca al tenant antes de enviar); nuevo endpoint `POST /api/charges/[chargeId]/remind` (`withTenant` + rate limit 5/60s); botón por fila en `StudentChargesTab.tsx` con confirmación (`window.confirm`) y toast de resultado.
- **Flujo "Pasar lista hoy" móvil**: nuevas rutas `attendance/today` (lista de sesiones de hoy) y `attendance/today/[sessionId]` (marcado), componente `AttendanceSheet.tsx` con botones de estado de 44px, guardado optimista por toque contra `/api/attendance` (el mismo endpoint que ya usaba el modal de escritorio). Nueva entrada "Pasar lista" en el menú (`registry.ts`, `mobile: true`); para no dejar el bottom-nav en 7 ítems se quitó `mobile: true` de "Informes" (pasa a solo-sidebar, es una tarea de consulta, no de pista). El widget "Registrar Asistencia" del dashboard ahora enruta aquí en vez de a la tabla de solo lectura. La tabla antigua de `/attendance` corrige `overflow-hidden` → `overflow-x-auto` y gana un botón "Pasar lista de hoy". *No se cableó la cola offline (`src/lib/offline/operations-queue.ts`) al guardado — sigue pendiente, es un cambio más grande y de mayor riesgo.*
- **Hero y tarjetas de pricing rediseñados** (§6.1/6.2 del informe): quitado el H1 en gradiente, el badge con `animate-ping`, los blobs `blur-3xl` y las tarjetas de icono en cuadrado de gradiente; aplicadas las decisiones firmadas (línea de practicable, chips de esquina cortada). Tarjetas de `/pricing`: quitado el badge "Más popular" en gradiente (→ "Más elegido" en texto), quitado el toggle "Anual" muerto, quitado el `animate-ping` del banner de trial.
- **Dashboard — impagos reales**: `RecommendationsWidget` recibía `pendingPayments: 0` hardcodeado y además **ignoraba la prop por completo** (las 3 recomendaciones eran siempre las mismas, estáticas, sin usar ningún metric — hallazgo más grave que el original del informe). `DashboardPage.tsx` ahora obtiene el número real desde `/api/quick-actions/pending-today` (el mismo que ya usa `QuickActionsWidget`) y `RecommendationsWidget` genera una recomendación real y enlazada a Cobros cuando hay cargos pendientes/atrasados.
- **`EmptyState` unificado** (`src/components/ui/empty-state.tsx`): aplicado en el estado vacío de Atletas (con acción de importar) y en el de Asistencia.

**Sin tocar** (quedan para 30 días): sistema de diseño completo aplicado al resto de secciones de la landing (Módulos, Comparativas, Footer siguen con blobs/gradientes), canónicas ES/EN invertidas, cola offline de asistencia, handoff registro→checkout para Starter/Growth.

**Vault actualizado:** solo esta nota (no hizo falta tocar `Mensajes aprobados.md` de nuevo en esta ronda).

## Addendum 3 — auditoría CRO externa contrastada + cierre del bloque "30 días" (2026-07-13, misma sesión)

Un CRO externo entregó una segunda auditoría. Se contrastó contra el código real antes de actuar: varios de sus hallazgos apuntaban a componentes **muertos** (`Hero.tsx`, `Testimonials.tsx`, `Cta.tsx`, `MakerIntro.tsx`, `FeaturedTime.tsx`, `Faq.tsx` — confirmado con grep, cero imports en el proyecto) o a cosas ya corregidas en el Addendum 2. Dos de sus recomendaciones se **rechazaron explícitamente** por chocar con decisiones de negocio ya documentadas:
- Checkout self-serve para Starter/Growth — bloqueado a propósito por [[Mensajes aprobados]] hasta validar el handoff registro→checkout end-to-end. No es un cambio de CTA, es un proyecto de integración con Stripe.
- Bajar Free de 30 a 15 gimnastas — contradice la estrategia de freemium agresivo de [[Pricing]] (30 es una decisión activa de negocio, no un descuido).

Lo demás, validado, se aplicó junto con el resto del backlog de 30 días. Verificado con `pnpm typecheck` y `pnpm lint` sobre todo `src/` (0 errores) y navegación real en `pnpm dev`.

**Código cambiado:**
- **CTA de `/features` unificado**: el único archivo "legacy" que sí estaba vivo (`FeaturesSection.tsx`, importado por `src/app/features/page.tsx`) tenía "Solicitar demo" → ahora "Crear cuenta gratis" → `/auth/register?role=owner`.
- **Checklist de onboarding expandido por defecto**: `OnboardingChecklist.tsx` — `isExpanded` inicial de `false` a `true`.
- **Copy de pricing simplificado**: `catalog.ts` — los bullets de Starter/Growth ya no listan "N grupos"/"N clases" (ruido que difuminaba la diferencia entre planes); ahora listan el límite de gimnastas + las features reales diferenciadoras (portal de familias, reportes ejecutivos, soporte prioritario). Los límites de enforcement (`groupLimit`, `classLimit`) no se tocaron.
- **Onboarding — sección avanzada plegable**: `OwnerOnboardingForm.tsx`. Se comprobó que "Estructura inicial sugerida", "Programas y aparatos activos" y "Bloques semanales sugeridos" ya vienen con valores por defecto pre-seleccionados (todo el seed de la disciplina se marca solo) — el problema era puramente visual, no de datos obligatorios. Se envolvieron esos tres bloques + Región/Ciudad en un disclosure "Configuración avanzada (opcional)" cerrado por defecto; quedan siempre visibles solo Nombre completo, Nombre de academia, País, Disciplina principal, Ramas activas y Tipo de academia. No se tocó la lógica de estado ni los defaults.
- **Limpieza visual del resto de la landing**: quitados los blobs `blur-3xl` y las tarjetas con icono en cuadrado de gradiente de `ModulesSection.tsx` (8 tarjetas, ahora icono plano teal + borde que se ilumina en hover, sin barra de acento en gradiente), el blob de 800px de `WhyZaltykoSection.tsx`, los 2 blobs de `ComparisonSection.tsx` y los 2 blobs de `Footer.tsx` (se conservó `.zaltyko-motion-lines`, la textura de líneas de marca, por ser un motivo de dominio y no un blob genérico).
- **Cola offline — investigada, NO cableada**: `src/lib/offline/operations-queue.ts` tiene `const OFFLINE_MUTATIONS_ENABLED = false` con el comentario explícito *"disabled until idempotent tenant-scoped sync is available"* — es un candado de seguridad de datos deliberado, no código a medio terminar. Activarlo es una decisión de riesgo real (sync no idempotente podría duplicar registros o cruzar datos entre tenants) que no me correspondía tomar en solitario. Se dejó tal cual; `AttendanceSheet.tsx` conserva sus comentarios `// TODO` como documentación de dónde engancharía en el futuro, una vez que alguien valide y active ese flag conscientemente.
- **Canónicas ES/EN invertidas** (los 5 pares): `/terminos`, `/politica-privacidad`, `/sobre-nosotros`, `/ayuda`, `/integraciones` pasan a ser las páginas reales con contenido y su propio `alternates.canonical`; `/tos`, `/privacy-policy`, `/about`, `/help`, `/integrations` pasan a ser `redirect()` hacia ellas (antes era al revés). Footer, Navbar, `ContactForm.tsx` y `contact/page.tsx` actualizados para enlazar directo a las rutas en español. `sitemap.ts` actualizado a las 5 rutas ES (antes listaba las 4 en inglés y no incluía integraciones). Verificado en navegador: los 5 redirects funcionan y los 5 `canonical` apuntan a la ruta ES.
- **Hallazgo nuevo durante esta ronda (no estaba en ninguna de las dos auditorías)**: `integrations/page.tsx` (la página completa de integraciones, distinta de la sección de la home) afirmaba que **Google Calendar** era una integración "Activo" con sincronización bidireccional — se verificó por grep que no existe absolutamente ningún código de integración con Google Calendar en el proyecto. Corregido: pasa a "Próximamente", igual que WhatsApp/Zoom/Instagram (que sí estaban correctamente marcadas como especulativas).
- **Hallazgo nuevo sin corregir (fuera del alcance aprobado para esta ronda)**: la propia `FeaturesSection.tsx` (pestaña "Gimnastas") tiene el claim "Reduce 4 h semanales de tareas administrativas" — mismo patrón de cifra sin fuente que ya se corrigió en otras partes de la landing en el Addendum 2. Queda pendiente para la próxima pasada.

**Vault actualizado:** solo esta nota.

## Addendum 5 — auditoría visual completa del SaaS + "Fase 2 del sistema de diseño" (2026-07-14, misma sesión)

El usuario preguntó directamente si el SaaS necesita un rediseño visual completo o refactorización ("no está al nivel visual de la competencia, no respira gimnasia, se siente confuso"). Se hizo una auditoría cuantitativa sobre los ~471 archivos `.tsx` del proyecto (no solo landing) antes de opinar: conteo de blobs `blur-3xl`, iconos-en-cuadrado-de-gradiente, `animate-ping`/`animate-bounce`, gradient text (`bg-clip-text`), `backdrop-blur-sm` (glassmorphism real), radios/sombras ad-hoc fuera de escala, y colores Tailwind sueltos (red/blue/purple/green) en vez de tokens de marca.

**Conclusión entregada al usuario:** no hace falta un rediseño completo/refactor — la base (tokens de marca, tipografía, componentes shadcn) es sólida y ya se había limpiado buena parte en Addenda 1-4. El problema real es **inconsistencia de aplicación**: unas pantallas usan el lenguaje de marca ya validado ("línea de practicable" teal, chips de esquina cortada, marcador D+E) y otras (onboarding wizards públicos, super-admin, varios modales de billing, páginas de módulo) seguían con gradientes/blobs genéricos de plantilla SaaS. Se propuso una "Fase 2 del sistema de diseño": formalizar 3 tokens de radio que ya se usaban ad-hoc, y pasar ese mismo lenguaje ya validado por todas las superficies que aún no lo tenían. El usuario aprobó ejecutar los 6 puntos completos.

Verificado en cada tanda con `pnpm typecheck` (0 errores) y `pnpm lint`/`npx eslint` dirigido (0 errores, solo warnings preexistentes no tocados). Verificación visual en navegador (`pnpm dev`) sobre onboarding público y una página de cluster SEO: sin errores de consola, CTAs y logo reales, estilo de tarjeta consistente.

**1. Tokens formalizados** (`tailwind.config.mjs`): `rounded-control` (6px), `rounded-card` (10px), `rounded-modal` (16px) añadidos a `borderRadius` (aditivo, no se tocó lg/md/sm/xl/2xl/3xl existentes) + comentario documentando el sistema de elevación de 2 niveles (`shadow-soft`/`shadow-medium`). Reemplazo masivo (`sed`) de `rounded-[10px]` → `rounded-card` en 17 archivos (mismo valor computado, cero riesgo visual).

**2. Pantallas privadas rediseñadas**: `WelcomeBanner.tsx` (reescritura completa — quitados 2 blobs, icono/botón en gradiente, y la frase prohibida "Estás a punto de transformar la gestión de..."; CTA corregido de `/groups` a `/athletes`, que es el paso real siguiente), `NextStepsWidget.tsx` (fondo en gradiente → plano con acento teal; reordenado el array para que "añadir atletas" aparezca antes que "crear grupo", que es el orden real del flujo), `WhatsAppPage.tsx` (icono en gradiente → plano, quitado emoji ⚠️ y caja de advertencia gris → tokens `zaltyko-coral`).

**3. Componentes de billing rediseñados**: `UpgradeModal.tsx` (quitado el campo `color` de `PLAN_DETAILS` y el hero en gradiente, caja de info azul → `zaltyko-primary-ultralight`, error box rojo → `zaltyko-coral`), `InvoiceHistory.tsx` (icono plano, `STATUS_CONFIG` alineado a tokens de marca, y un **bug de moneda real**: `${invoice.amount}` sin símbolo de moneda → `${invoice.amount}€`, el producto es EUR-only).

**4. Onboarding wizards públicos rediseñados** (`(site)/onboarding/coach|athlete|parent/page.tsx`, los 3): quitados los fondos en gradiente rojo/morado/azul por rol y el logo falso (una "Z" en badge de gradiente) → `<Image>` con el logo real de Zaltyko, fondo plano, iconos/spinners/checks en `zaltyko-teal`, cards con `rounded-card border-zaltyko-mist shadow-soft`.

**5. Directorio público + páginas de módulo/cluster rediseñadas**: `AcademyCard.tsx`/`CoachCard.tsx`/`EventCard.tsx` (avatares/tiles en gradiente → planos; **bug de moneda real** en `EventCard.tsx`, mismo patrón que `InvoiceHistory.tsx`, `${fee}` → `${fee}€`), `PublicCoachProfile.tsx` (quitado `backdrop-blur-sm` real en pills y botones sociales — anti-patrón de glassmorphism, no solo term equivocado), `ClusterHeroSection.tsx` (quitados 2 blobs + grid pattern + badge `animate-ping`; CTA secundario apuntaba a `#demo`, un ancla que no existe en la página → ahora enlaza a `/pricing`), `ClusterCTASection.tsx` (hallazgo relevante: fondo rojo/rosa en gradiente con la frase prohibida "Transforma la gestión de tu academia de..." y una **cifra inventada "Únete a más de 85 academias en España"** — ambas quitadas; fondo ahora `zaltyko-navy` + `zaltyko-motion-lines`; CTA corregido de `/onboarding` a `/auth/register?role=owner`), `ClusterPainPointsSection.tsx`, `ModuleHero.tsx` (icono en gradiente → plano; CTA "Empieza gratis" enlazaba a un formulario de contacto-demo, no a registro → corregido; enlace roto `/#modulos` sin ancla correspondiente → `/features`) y `ModuleSections.tsx` (5 componentes: quitados 4 eyebrows con gradient-text y 3 iconos en cuadrado de gradiente; el CTA final decía "Crear mi academia gratis" pero enlazaba a `/contact?type=demo` → corregido a `/auth/register?role=owner`).

**6. Super-admin rediseñado**: `SuperAdminDashboard.tsx` (832 líneas) — header hero en gradiente + 2 blobs + texto "Super Admin" en gradient-text → `zaltyko-navy` + `zaltyko-motion-lines` + texto plano teal; 7 blobs decorativos repetidos en las tarjetas de KPI (colores coral/índigo/esmeralda×2/ámbar/azul/cian) eliminados vía `sed`.

**Hallazgo — corregido tras confirmación del usuario ("no ponga nada inventado, quítalo")**: los mismos anti-patrones de "cifra inventada" que se corrigieron en `ClusterCTASection.tsx` existían también en los **datos de contenido** de `src/content/clusters/**/*.json` (54 archivos, todas las combinaciones país × disciplina, ES y EN): `hero.badge` con "Líder en España · +85 academias" (variantes +70/+45/+35/+60/+50/+40/+30/+25/+20/+18/+15/+12/+10/+8 según país/disciplina, y "Trusted by 200+ US gyms" en inglés) y un bloque `socialProof` con cifras inventadas (`athletes: "15,000+"`, `academies: "85+"`) y nombres de clubes ficticios presentados como clientes reales ("Gravity Gym Barcelona", "Club Gimnasia Artística Madrid", etc.).

Antes de tocar nada se verificó por grep quién consume estos campos: `hero.badge` sí se renderiza en producción vía `ClusterHeroSection.tsx` (confirmado visualmente en `/es/gimnasia-artistica/espana`, donde se veía el badge "LÍDER EN ESPAÑA · +85 ACADEMIAS"); `socialProof` en cambio solo lo leían `ClusterStatsSection.tsx` y `ClusterCTASection.tsx` (esta última ya tenía la cifra "+85 academias" como texto fijo, corregida en el punto 5 de este mismo addendum), y ninguno de los dos componentes tenía **ningún import** en el proyecto — código muerto sin superficie viva.

Aplicado: `git rm` de `ClusterStatsSection.tsx` y `ClusterCTASection.tsx` (confirmados sin uso); el campo `socialProof` se quitó de la interfaz `ClusterContent` (`src/lib/seo/clusters.ts`) y de los 54 JSON; el `hero.badge` de los 46 archivos con cifra/claim inventado se reescribió a una frase genérica sin números por disciplina/idioma (p. ej. "Gestión pensada para academias de gimnasia artística" / "Built for artistic gymnastics clubs"), sin tocar los archivos que ya no tenían cifras (danza, parkour). Verificado con `pnpm typecheck` (0 errores), `npx eslint` sobre `clusters.ts` (0 errores, solo warnings preexistentes) y navegación real en `/es/gimnasia-artistica/espana`: el badge ya no muestra ninguna cifra, sin errores de consola.

**Vault actualizado:** solo esta nota.

## Addendum 4 — cierre de todo lo ejecutable sin decisión de negocio ni acción externa (2026-07-13, misma sesión)

El usuario pidió "hazlo todo lo que está en tus manos": todo lo que quedaba en la lista de la sección C/D del resumen de estado, excluyendo lo bloqueado por negocio (checkout self-serve, Free 30→15) y lo no-código (vídeo demo, testimonio real, env var de Vercel). Verificado con `pnpm typecheck` y `pnpm lint` sobre todo `src/` (0 errores) y navegación real en `pnpm dev`.

**Código cambiado:**
- **`FeaturesSection.tsx`**: quitado "Reduce 4h semanales de tareas administrativas" (sin fuente, mismo patrón ya corregido antes) y "Cumplimiento RGPD y normativa de menores" (mismo patrón que [[Mensajes aprobados]] prohíbe) en la pestaña Seguridad — ambos reemplazados por lenguaje de aislamiento de datos ya usado en el resto del sitio.
- **Verificación del portal de padres**: se confirmó por código (`MyPaymentsWidget.tsx`, `MyDashboardPage.tsx`) que los padres **solo ven** sus cuotas — no hay checkout ni "pagar ahora". Se encontró además un bug real: el botón "Ver todos los pagos" no tenía `href` ni `onClick`, no hacía nada al pulsarlo. Corregido: ahora expande/colapsa la lista completa de cargos in situ. No se tocó el copy "Portal de familias completo" de `catalog.ts` porque es mensajería ya aprobada en [[Pricing]], no algo que yo introdujera.
- **`FinalCtaSection.tsx`**: quitados los 2 blobs `blur-3xl` y el patrón SVG en base64 de fondo; se conservó `.zaltyko-motion-lines`.
- **`EmptyState` en `StudentChargesTab.tsx`**: estado vacío de cargos ahora usa el componente unificado, con las dos acciones reales (crear cargo / generar cargos del mes).
- **Borrados los 6 componentes legacy muertos**: `Hero.tsx`, `Testimonials.tsx`, `Cta.tsx`, `MakerIntro.tsx`, `FeaturedTime.tsx`, `Faq.tsx` (re-confirmado con grep que no tenían ningún import antes de `git rm`; `pnpm typecheck` sigue en 0 errores tras el borrado).
- **Vista de tarjetas móvil aplicada al resto de las tablas principales**: `StudentChargesTab.tsx` (Cobros), `ClassesTableView.tsx` (Clases), `CoachesTableView.tsx` (Entrenadores) y la tabla índice de `attendance/page.tsx` (Asistencia) — mismo patrón ya validado en Atletas (tabla ≥md, tarjetas <md). De paso se quitó de `CoachesTableView.tsx` el mismo banner de dev muerto y autorreferenciado que ya se había encontrado y quitado de Atletas. Se revisó `GroupsDashboard.tsx` (Grupos): ya usa una grilla de tarjetas responsive, no necesitaba el fix.
- **Jerarquía visual del dashboard reducida**: se agrupó `SportBreakdownSection`, `TechnicalOverviewWidget`, `GymMetricsWidgetLoader` y `UpcomingEventsWidget` (4 de los ~15 bloques del dashboard) detrás de un toggle "Ver más: desglose técnico y próximos eventos", colapsado por defecto, siguiendo el mismo patrón ya usado por `FinancialSection`/`RecentActivityPanel`/el checklist. **No se tocaron** los bloques con valor de onboarding activo (`StarterSetupSection`, `DashboardOnboardingPanel`, `WelcomeBanner`) ni los de uso diario (`AlertsWidget`, `UpcomingClasses`, Quick Actions, `QuickNavigationSection`) — el cambio fue deliberadamente conservador dado que es un archivo de 650+ líneas con muchos condicionales interdependientes y una academia piloto real en uso.

**Vault actualizado:** solo esta nota.
