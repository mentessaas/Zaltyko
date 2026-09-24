# ZALTYKO × WARRIORS GYMNASTICS — Deep product & architecture audit

**Fecha de investigación:** 15 de septiembre de 2026  
**Alcance:** investigación pública de `warriorsgymnasticscol.com` y auditoría estática del checkout actual de Zaltyko. No se accedió a cuentas privadas, no se intentaron bypasses y no se modificó código de producción.

## 1. Executive Verdict

Warriors parece operar como una academia de gimnasia artística con captación digital, clase de prueba por WhatsApp, programas por edad/objetivo y materiales operativos compartidos. Hay evidencia técnica de WordPress, Elementor, WooCommerce, Contact Form 7, Instagram Feed, Google Tag Manager, WhatsApp y documentos de Google Drive. El portal de representantes no es observable sin cuenta: `/my-account/` presenta el login estándar de WooCommerce.

Zaltyko ya tiene una base más profunda para operar una academia que la web pública de Warriors: multi-tenant, grupos, clases recurrentes, sesiones, asistencia, familias, cobros, comunicación, evaluaciones, skills, licencias, eventos y configuraciones deportivas. Sin embargo, la cobertura end-to-end no debe declararse completa: trials/leads no están unidos a enrollment, el progreso de skills no está modelado como una relación histórica atleta-skill independiente, y competition/federation tiene campos flexibles pero no una integración verificable con un organismo.

El matiz es importante: el checkout sí contiene referencias aisladas a `leadId` y `trialId` (por ejemplo, contacto, entrevistas comerciales y servicio de trials). Lo que no está confirmado es una relación única, obligatoria e idempotente que atraviese lead → trial → enrollment → billing y permita medir conversión sin reconciliación manual.

**Recomendación:** Warriors merece ser un design partner condicionado, no un cliente gratuito ni una plantilla universal. El primer objetivo no es copiar su web: es probar un flujo pequeño y medible de `lead → trial → enrollment → asistencia → evaluación → comunicación → cobro`, con una academia real y datos reales bajo consentimiento.

## 2. Research Methodology

- Consulta directa HTTPS y HTML público de `https://warriorsgymnasticscol.com/` y sus rutas enlazadas.
- Inspección de cabeceras, HTML, enlaces, scripts, metadatos, REST público de WordPress y páginas WooCommerce.
- Búsqueda pública de menciones, directorios y federación; los resultados de dominios homónimos no se mezclan con Warriors Colombia.
- Auditoría del repositorio mediante `rg`, árbol de rutas, schemas Drizzle, componentes, APIs, migraciones y tests.
- Clasificación: **CONFIRMED** = visible en fuente primaria; **STRONG INFERENCE** = conclusión técnica muy probable; **WEAK INFERENCE** = señal indirecta; **UNKNOWN** = no verificable legítimamente.

Limitación importante: la portada de Warriors se entrega con `meta robots="noindex, nofollow"`, por lo que la indexación pública es muy limitada. El HTML público es evidencia de stack y marketing, no prueba de cómo trabajan internamente.

## 3. Warriors Business Model

La web comunica una propuesta de gimnasia artística en Bogotá: felicidad, disciplina, desarrollo integral y formación de “guerreras”. La conversión principal es agendar una clase de prueba mediante WhatsApp (`+57 322 873 2500`). Se muestran programas, staff, patrocinadores y enlaces a documentos; no se observa un checkout público de clases en la portada.

**Modelo confirmado:** adquisición por contenido + contacto humano; venta y operación posterior probablemente ocurren fuera de la web pública. **No confirmado:** precios, estructura de cuotas, número de sedes, churn, margen, capacidad y software interno.

## 4. Warriors Operating Model

Modelo reconstruido con niveles de confianza:

| Paso | Evidencia | Estado |
|---|---|---|
| Lead | CTA de WhatsApp y formulario/contacto | CONFIRMED |
| Trial | CTA “Agenda una clase de prueba” | CONFIRMED |
| Enrollment | WooCommerce y portal de cuenta; no se ve flujo de inscripción de clase | STRONG INFERENCE / detalle UNKNOWN |
| Athlete | Lenguaje de niñas, bebés, programas y staff | CONFIRMED en marketing; entidad digital UNKNOWN |
| Program | Sección “Programas” y documentos Drive | CONFIRMED |
| Group | No visible públicamente | UNKNOWN |
| Training | Programas y material enlazado | CONFIRMED en oferta; planificación interna UNKNOWN |
| Attendance | No visible públicamente | UNKNOWN |
| Skill development | No visible públicamente | UNKNOWN |
| Evaluation | No visible públicamente | UNKNOWN |
| Parent communication | Portal de representantes implícito por la solicitud; WhatsApp visible | STRONG INFERENCE |
| Competition | No visible en el HTML de portada | UNKNOWN |
| Level promotion | No visible | UNKNOWN |
| Retention | Seguimiento humano por WhatsApp es plausible, no probado | WEAK INFERENCE |

## 5. Warriors Digital Stack

**CONFIRMED:** WordPress (`/wp-json/`, `wp-content`), tema Supofit + child theme, Elementor 4.2.4, Elementor Pro/Pro Elements, WooCommerce 11.1.0, Contact Form 7 6.1.7, Instagram Feed 6.13.0, Google Tag Manager (`GTM-PLR7WHKK`), Google Fonts, Google Maps, WhatsApp y enlaces a Google Drive.

`/my-account/` es la página “My account” de WooCommerce: login por email/usuario, recuperación de contraseña y registro WordPress/WooCommerce. La página expone campos y preferencias de comunicación de cuenta; no se puede confirmar desde fuera si allí se gestionan participantes, calendario o facturas. `/shop/` carga WooCommerce pero actualmente muestra “este producto no está disponible”, señal de que la tienda no es evidencia de un catálogo operativo.

**UNKNOWN:** CRM, booking engine, app móvil, pasarela de pago específica, integración con federación, sistema de asistencia y proveedor real del portal tras autenticación.

## 6. Warriors Parent Experience

La única evidencia directa es un portal de cuenta WooCommerce y comunicación por WhatsApp. La ausencia de contenido autenticado impide afirmar que exista portal de padres con atletas, asistencia, progreso o pagos. La hipótesis razonable es que la cuenta sirve como identidad/facturación y que parte del acompañamiento sigue siendo manual.

Implicación para Zaltyko: el valor diferencial no es crear otro login; es que el padre vea en un solo lugar próxima sesión, asistencia, saldo, documentos, evaluación y siguiente objetivo, con notificaciones accionables y permisos por tutor.

## 7. Warriors Coach Experience

La portada identifica tres perfiles de staff mediante Instagram, pero no expone roles ni herramientas. No hay prueba pública de un portal de coaches, asignación de clases, asistencia o evaluación digital. El workflow debe validarse en entrevista/observación, no inferirse del marketing.

## 8. Warriors Athlete Development Model

La web no publica un catálogo técnico. La presencia de documentos Drive asociados a tarjetas de programas sugiere material curricular descargable, pero no demuestra skills por atleta ni historial de dominio. No se pudo confirmar si utilizan USAG, FIG, federación colombiana u otra metodología.

## 9. USAG / FIG Findings

La Federación Colombiana de Gimnasia publica reglamentación USAG-GAF, niveles, rutinas obligatorias, penalidades, rankings y jueces. Eso prueba que una academia colombiana puede necesitar convivir con estándares federativos externos, pero no prueba que Warriors esté afiliada o use cada documento.

Zaltyko no debe convertir USAG o FIG en la jerarquía raíz. La configuración existente ya separa `countries`, `sportDisciplines`, `sportBranches`, `academySportConfigs`, `programs`, `levels`, `categories`, `apparatus` y `competitionTypes`; esa dirección es adecuada. Federation/standard debe ser una configuración versionada y opcional, con provenance, no un enum global hardcoded.

## 10. Warriors Funnel

Funnel observable: contenido/SEO/social → CTA WhatsApp → conversación humana → clase de prueba → decisión de matrícula → cuenta/portal WooCommerce. El momento de pago, asignación de grupo y seguimiento post-trial no es visible.

La oportunidad para Zaltyko es cerrar el circuito: capturar lead con consentimiento, programar trial, registrar resultado, convertir sin duplicar datos, asignar grupo y cuota, cobrar, notificar y medir activación/retención.

## 11. Confirmed vs Inferred vs Unknown

**Confirmed:** stack WordPress/WooCommerce/Elementor; CTA WhatsApp; staff e imágenes públicas; documentos Drive; portal `/my-account/`; homepage `noindex,nofollow`; WooCommerce activo.

**Strong inference:** la cuenta WooCommerce gestiona identidad/facturación; el proceso comercial mezcla web y WhatsApp; los documentos Drive contienen currículo o material de programas.

**Weak inference:** existe un CRM manual o una hoja de seguimiento; el portal contiene información de representantes; la academia usa evaluaciones periódicas.

**Unknown:** volumen, precios, clases recurrentes, asistencia, skill bank, progresiones, competición, licencias, automatizaciones, proveedores de pago y datos de clientes.

## 12. Current Zaltyko Architecture

Next.js App Router + TypeScript, Supabase/PostgreSQL y Drizzle, autenticación Supabase, API routes con autorización tenant-aware, almacenamiento Supabase, Vercel, Stripe Connect y PWA/mobile. Hay 230 páginas en el build actual, 324 rutas API auditadas por los contratos internos y un modelo multi-tenant con `tenantId`/`academyId`.

La arquitectura está suficientemente modular para iterar; el riesgo no es falta de tablas sino semántica duplicada entre campos legacy y configuraciones deportivas.

## 13. Existing Zaltyko Capabilities

- **Academy operations:** `academies`, `memberships`, `groups`, `groupAthletes`, `classes`, `classSessions`, excepciones y generación recurrente.
- **Attendance:** `attendanceRecords` con unicidad sesión-atleta y pantallas de pase de lista.
- **People/families:** `profiles`, `athletes`, `guardians`, `guardianAthletes`, invitaciones y portal familiar.
- **Commercial/finance:** `leads`, `academyTrials`, `billingItems`, `charges`, invoices, receipts, discounts, scholarships, payment attempts y Stripe accounts.
- **Communication:** `messageHistory`, conversaciones, grupos, plantillas, programados, email/SMS/WhatsApp y notificaciones.
- **Development:** `skillCatalog`, `athleteAssessments`, `assessmentScores`, rubrics, videos, `coachNotes` y reportes.
- **Competition/federation:** events, registration, results, `federativeLicenses`, templates de competición/scoring/licencias.
- **Internationalization:** países, monedas, terminología por configuración, apparatus/program/level/category y reglas de Bizum por país.

## 14. Warriors × Zaltyko Coverage Matrix

| Domain | Warriors need | Evidence | Zaltyko status | Existing implementation | Gap | Priority |
|---|---|---|---|---|---|---|
| Acquisition | Lead + WhatsApp | CTA público | PARTIAL | `leads`, `/api/contact`, WhatsApp; existen referencias puntuales `leadId` | Hay piezas separadas, pero no pipeline único lead→trial→enrollment auditable | P1 |
| Trial | Clase de prueba | CTA público | PARTIAL | `academyTrials`, `allowsFreeTrial` | Falta pipeline lead→trial y resultado de trial verificable | P0 |
| Enrollment | Convertir prueba a plaza | WooCommerce/UNKNOWN | PARTIAL | athletes, groups, enrollments, charges | Conversión comercial no es una entidad explícita | P0 |
| Family | Cuenta y tutor | Portal implícito | COMPLETE/PARTIAL | guardians, family dashboard, payments | Validar UX y permisos con academia real | P1 |
| Schedule | Horarios y plazas | Programas públicos | COMPLETE | classes, sessions, exceptions, waitlist | Capacidad multi-sede/room debe probarse en piloto | P1 |
| Attendance | Pase de lista | UNKNOWN | COMPLETE | attendance records + coach flows | Check-in/kiosk/makeup no equivalen todavía a solución completa | P1 |
| Skills | Progreso técnico | UNKNOWN | PARTIAL | skill catalog + assessment scores | Falta snapshot/historial atleta-skill y mastery semantics | P0 |
| Evaluation | Revisión periódica | UNKNOWN | PARTIAL | assessments/rubrics/videos | Ciclos por programa y publicación parental deben validarse | P1 |
| Communication | Avisos y WhatsApp | CTA WhatsApp | PARTIAL | messages, templates, scheduled, WhatsApp | Consentimiento, fallback y analítica de entrega | P1 |
| Billing | Cuotas/facturas | Shop activo pero sin producto | COMPLETE/PARTIAL | charges, invoices, Stripe Connect | Método local Colombia y conciliación requieren discovery | P1 |
| Competition | Eventos/resultados | No confirmado | PARTIAL | events, results, licenses | Federación/standards versionados e import/export | P2 |
| Retention | Reinscripción y progreso | UNKNOWN | MISSING | métricas de churn existentes | Loop de valor y cohortes por trial | P1 |

## 15. Critical Product Gaps

Los bloqueos reales para operar end-to-end son: pipeline comercial unificado (aunque existen `leadId`/`trialId` aislados); enrollment con estado y fuente; skill progression histórica; ciclo de evaluación publicable; y onboarding de familia con datos/consentimientos. No son bloqueos construir otro dashboard ni otra taxonomía de deporte.

## 16. Data Model Analysis

Fortalezas: claves UUID, `tenantId`, FKs, índices, unicidades y configuraciones por academia. Riesgos:

- `athletes.level`, `competitiveLevel`, `primaryApparatus` y campos `programCode/levelCode/categoryCode` conviven con `athleteSportConfigs`; hay duplicación histórica y riesgo de divergencia.
- `skillCatalog.apparatus` y códigos libres no referencian `apparatus` ni `sportConfig`; el catálogo puede mezclar tenant, disciplina y versión.
- `assessmentScores.score` es integer sin semántica de escala, unidad o estado; `totalScore` es `text` “JSON or text”.
- `competitionResults` guarda scores, panel y round como campos flexibles; sirve para importar datos, pero no para reglas federativas auditables.
- `federativeLicenses.personId/personType` es polimórfico sin FK a una persona concreta; requiere validación de servicio y política clara.
- `coachNotes.tags` es array de texto; útil para empezar, insuficiente para taxonomía analítica estable.

No recomendamos reescritura. Hay que definir una fuente canónica, backfill observable y constraints graduales.

## 17. Athlete Development Architecture

La jerarquía recomendada es:

```text
Sport/Discipline
  → Standard (optional, versioned)
  → Program
  → Level/Category
  → Apparatus
  → Skill (catalog + prerequisites)
  → AthleteSkill (state/history/evidence)
  → Evaluation (snapshot + rubric)
  → Goal / CoachObservation
  → Promotion decision
  → Competition result
```

`AthleteSkill` es el hueco estructural más importante: debe guardar estado (`introduced`, `working`, `attained`, `needs_review`), fecha, coach, evidencia y origen, sin sobrescribir historia. La evaluación debe tomar un snapshot de skills aplicables a una versión de programa. Las promociones deben ser decisiones explícitas, no una derivación automática de un score.

## 18. Parent Portal Analysis

Zaltyko tiene piezas de portal familiar, pagos, hijos, eventos y progreso. El valor debe organizarse alrededor de “qué necesita saber hoy”: próxima sesión, asistencia, saldo/acción, aviso importante y avance. Evitar mostrar el modelo interno de configuración deportiva como un formulario técnico.

## 19. Coach Workflow Analysis

El coach necesita abrir la sesión, ver grupo y alertas relevantes, pasar lista en pocos toques, registrar una observación/skill sin abandonar la clase y cerrar con un resumen compartible. La evaluación extensa debe poder hacerse después; el pase de lista no puede bloquearse por red o por un campo opcional.

## 20. Competition / Federation Analysis

Construir primero import/export CSV y configuración versionada; no prometer sincronización federativa. Separar `event`, `competitionEdition`, `entry`, `apparatusScore`, `result` y `license` solo cuando un caso de uso real lo exija. Mantener scores decimales con unidad/escala explícita en vez de comentarios como “15 = 1.5”.

## 21. Internationalization Risks

Colombia exige COP, transferencias locales y posiblemente pagos manuales; España añade SEPA/Bizum y federación RFEG; otros países tienen impuestos, formatos de teléfono, calendarios y estándares distintos. La dirección actual de moneda/terminología es correcta, pero payment rails, impuestos y federation config deben ser adapters por país, no condicionales repartidos por UI.

## 22. Technical Debt Relevant to This Expansion

La deuda relevante es semántica: campos legacy duplicados, textos deportivos en componentes, IDs polimórficos y JSON/text para datos que pronto necesitarán consultas. También hay riesgo de contratos UI que solo prueban strings, no interacción renderizada. Priorizar invariantes y migraciones de lectura antes de añadir más módulos.

## 23. P0

1. Pipeline lead/trial/enrollment con estados, owner, timestamps, consentimiento y conversión.
2. Modelo `athleteSkill` histórico y publicación parental de evaluación/objetivo.
3. Flujo de onboarding familiar y asignación de plaza sin duplicar atleta/contacto.
4. Piloto real con una academia para probar asistencia, cobro y comunicación en la misma semana.

## 24. P1

1. Makeups/waitlist/check-in configurables.
2. Mensajería con plantillas por país, consentimientos y entrega observable.
3. Dashboard de retención: trial-to-enrollment, asistencia 30 días, pagos fallidos y riesgo de baja.
4. Rooms/sedes y capacidad operacional.
5. Evaluaciones por ciclos y certificados compartibles.

## 25. P2

Federation adapters, rankings avanzados, judge panel estructurado, live streaming, tienda, app branded por academia, marketplace y automatizaciones complejas.

## 26. DON'T BUILD

- No construir un ERP completo ni contabilidad fiscal multi-país antes de probar cobros.
- No crear una nueva tabla de “programas” si `programs` + `academySportConfigs` cubren el caso.
- No integrar USAG/FIG/RFEG como si fueran un estándar universal sin cliente afiliado y documento de versión.
- No copiar el stack WordPress/WooCommerce de Warriors dentro de Zaltyko.
- No lanzar rankings/gamification sin un loop de entrenamiento que produzca datos fiables.
- No crear una app nativa separada antes de validar el coach workflow móvil en web/PWA.

## 27. Competitive Landscape

iClassPro confirma el estándar de categoría: office/staff/customer portals, clases, pagos, asistencia, skills, makeups, punch passes, eventos, app branded y automatizaciones. Jackrabbit enfatiza parent portal, self-check-in, makeups, skills, mensajes y app. Uplifter añade skills, niveles, waitlists y reporting/federation. TeamUp es fuerte en membresías, reservas y conectores de pago, pero es horizontal.

La conclusión no es igualar cada feature. Los competidores validan que el núcleo repetitivo es `schedule + attendance + billing + parent communication + progress`; Zaltyko puede diferenciarse haciendo esa unión sensible a disciplina, país y flujo de academia pequeña/mediana en español.

## 28. Zaltyko Vertical Moat

El moat defendible sería un grafo operativo, no una lista de features: una sesión produce asistencia, una acción del coach actualiza progreso, el padre recibe valor comprensible, el owner ve retención/cobro y el siguiente plan se decide con contexto deportivo. La configuración localizable por disciplina/país y la trazabilidad histórica hacen difícil sustituirlo por hojas, WhatsApp y un SaaS horizontal.

## 29. Retention Loops

`Coach pasa lista → registra una observación/skill → padre recibe resumen → atleta llega con objetivo claro → coach vuelve a registrar en la próxima sesión.`  
`Pago fallido → aviso accionable → familia actualiza método → plaza se conserva → owner ve recuperación.`

## 30. Growth Loops

`Trial capturado → resultado y seguimiento → matrícula → invitación del tutor → más datos de uso → caso de éxito local.` El loop debe medir conversión y consentimiento; no enviar spam ni premiar datos ficticios.

## 31. Design Partner Assessment

Warriors es un buen design partner si confirma disponibilidad semanal, comparte un flujo real anonimizado y acepta medir 3–5 outcomes. Es potencialmente un buen beta tester LATAM por su contexto colombiano y uso de WhatsApp/Drive. No es todavía evidencia suficiente para ser advisor ni launch partner nacional. Propuesta comercial: piloto pagado con alcance limitado, onboarding asistido y descuento temporal a cambio de entrevistas y permiso de usar aprendizajes agregados; nunca regalar indefinidamente soporte crítico.

## 32. Recommended 30-Day Roadmap

**Días 1–5:** entrevista contextual, mapa de roles, inventario de lead/trial actual, decisión de fuente canónica de nivel/programa y definición de métricas.

**Días 6–12:** diseñar y probar pipeline lead→trial→enrollment; estados, eventos de auditoría, deduplicación y UI de seguimiento.

**Días 13–19:** especificar `athleteSkill`/snapshot de evaluación; prototipo coach móvil y vista padre; no migrar datos todavía.

**Días 20–25:** piloto con una clase, un cobro y un ciclo de asistencia/evaluación; medir tiempo y fallos.

**Días 26–30:** decidir Go/No-Go, priorizar migración, documentar soporte, precio y plan de expansión por país.

La búsqueda estática del checkout no encontró una entidad o tabla `athleteSkill`/`athlete_skill`, `skillHistory` o `levelPromotion`; por eso la recomendación es diseñar el historial antes de prometer progresión longitudinal, no porque el catálogo o las evaluaciones actuales estén ausentes.

## 33. Proposed Architecture Changes

| Current | Problem | Proposed | Migration | Cost | Risk | Evidence |
|---|---|---|---|---|---|---|
| `leads`, `academyTrials`, athletes separados | Se pierde atribución y conversión aunque ya haya referencias aisladas | Pipeline comercial con `leadId`, trial outcome y enrollment event | Añadir enlaces nullable y backfill por email con revisión | M | Medium | `src/lib/growth/dashboard.ts`, `src/lib/billing/trial-service.ts`, schemas de leads/trials |
| Nivel en varios campos | Divergencia histórica | `athleteSportConfigs` canónico; legacy como read-only | Dual-read, backfill, métricas de discrepancia, luego dual-write | M | Medium | schema actual |
| Skill catalog por tenant/apparatus texto | Sin relación histórica atleta-skill, versión o prerrequisitos | Catalog scoped a sport config + `athleteSkill` histórico | Crear snapshots desde catálogo, no borrar legacy | L | High | `skillCatalog`, assessments; probe sin `athleteSkill`/`skillHistory` |
| Score text/integer ambiguo | Informes no comparables | value + scale + unit + provenance | Adaptador de lectura y normalización por assessment type | M | Medium | `totalScore` text, scores integer |
| License person polimórfica | Integridad débil | servicio de resolución + tablas puente solo si el piloto lo necesita | Validar primero; no migrar a FK múltiple prematuramente | S/M | Medium | `federativeLicenses` |
| APIs/eventos repartidos | Difícil medir funnel | eventos de dominio idempotentes y auditables | Emitir desde puntos actuales, replay controlado | M | Medium | leads/trials/billing existentes |

## 34. Migration Strategy

Read-first: documentar invariantes, añadir columnas nullable, backfill pequeño y reversible, comparar lecturas legacy/canónica, activar dual-write detrás de flag, medir discrepancias y solo entonces retirar campos. Cada cambio requiere tenant isolation, permisos, auditoría y prueba de rollback. No hacer migraciones de datos de Warriors sin consentimiento y mapeo firmado.

## 35. Risks

Riesgos principales: modelar gimnasia competitiva como recreativa; prometer integraciones federativas inexistentes; mezclar datos de tutor/atleta; copiar procesos de una sola academia; deuda de datos legacy; pagos locales no conciliados; y construir más de lo que el equipo puede soportar.

## 36. Open Questions

1. ¿Warriors usa portal WooCommerce solo para cuenta o también para inscripciones?
2. ¿Cómo registra trial, nivel inicial, grupo, asistencia y promoción hoy?
3. ¿Qué federación/estándar y temporada aplican realmente?
4. ¿Cobran COP por transferencia, tarjeta, PSE, efectivo o combinación?
5. ¿Qué evento hace que un padre considere valioso el portal?
6. ¿Qué tarea consume más tiempo semanal del owner y del coach?
7. ¿Cuántas sedes, clases, atletas y entrenadores deben soportarse?
8. ¿Qué datos pueden compartirse para un piloto y bajo qué consentimiento?

## 37. Evidence / Sources

- [Warriors Gymnastics Colombia](https://warriorsgymnasticscol.com/) — HTML público, CTA, staff, programas y enlaces.
- [Warriors REST API pública de páginas](https://warriorsgymnasticscol.com/wp-json/wp/v2/pages?per_page=100) — páginas `my-account`, `checkout`, `cart`, `shop`, `blog`.
- [Warriors My Account](https://warriorsgymnasticscol.com/my-account/) — login/registro WooCommerce observable sin autenticación.
- [Warriors Shop](https://warriorsgymnasticscol.com/shop/) — WooCommerce activo; sin producto disponible en la captura.
- [Federación Colombiana — USAG GAF](https://www.fedecolgim.co/gaf/gaf-usag) — reglamentos, niveles, penalidades y rankings públicos.
- [iClassPro Gymnastics Features](https://www.iclasspro.com/gymnastics-software-features) — portales, asistencia, skills, pagos, eventos y app.
- [Jackrabbit Parent/Family Experience](https://www.jackrabbitclass.com/features/parent-family-experience/) — portal familiar, skills, self-check-in y app.
- [Uplifter Gymnastics](https://www.uplifterinc.com/top-sports/gymnastics) — niveles, skills, pagos, waitlists y federation reporting.
- [TeamUp Integrations](https://support.goteamup.com/en/articles/9327478-integrations-on-teamup) — Stripe, GoCardless y conectores de negocio.
- Zaltyko: `src/db/schema/*`, `src/components/*`, `src/app/*`, `src/lib/auth/*`, `src/lib/growth/dashboard.ts`, `src/lib/billing/trial-service.ts`, `src/app/sitemap.ts`, `tests/*` del checkout auditado.

## 38. Final Recommendation

Zaltyko podría operar una academia tipo Warriors en sentido operativo básico, pero todavía no hay evidencia para decir “end-to-end sin reservas”. El Go/No-Go debe depender de un piloto: registrar leads y trials, convertir una familia, asignar plaza, cobrar, pasar lista, publicar una evaluación y demostrar que padre, coach y owner reciben valor sin duplicar trabajo.

Construir primero ese circuito y el modelo histórico de progreso. Mantener la arquitectura modular existente, corregir la semántica de datos gradualmente y tratar federaciones/países como configuraciones versionadas. Si Warriors acepta un piloto pagado y medible, usarlo para aprender; si solo solicita una copia gratis de su web o un ERP a medida, decir **DON'T BUILD**.
