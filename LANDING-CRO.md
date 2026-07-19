# Landing Page CRO Analysis
## http://localhost:3000/ (home pública de Zaltyko)
### Analysis Date: 2026-07-14

---

> Aviso: el archivo existente databa de 2026-03-26 y describía un estado anterior con claims ya retirados (stats "150+ academias / 25.000+ atletas", CTA "Empezar gratis" rojo, etc.). Este análisis reemplaza al anterior porque contradice el estado actual y las guardrails de [[Mensajes aprobados]].

---

## Overall CRO Score: 78 / 100

## Page Type: SaaS Signup (registro de academia -> Free / Trial 7 días)
## Current Estimated Conversion Rate: 0,5 – 1,5 % (sin denominador fiable; baseline real 2026-07-13: 2 academias, 0 leads, 0 trials, 0 checkouts)
## Target Conversion Rate: 2,0 – 3,0 % en 90 días tras aplicar las P0/P1 de abajo

> Metodología: auditoría de las nueve secciones `src/app/(site)/home/*` referenciadas por `src/app/page.tsx`, triangulada con la captura real (`pnpm dev`) y métricas de Playwright (DOM, viewport, performance, accesibilidad básica) en viewports 1440×900 y 390×844. Donde digo “verificado” significa que lo constaté en el árbol renderizado o en la captura, no que sea una afirmación de negocio.

---

## Resumen para decisor

1. La promesa y el CTA principal sí llevan ya a registro, no a demo. Es el mayor cambio positivo; el embudo empieza bien.
2. La landing es demasiado larga y muy densa en texto SEO **encima** de la decisión. En desktop la home mide **10.154 px de alto** (9 secciones, ~3,4 pantallas por encima del fold), y en mobile **14.748 px**. Mover el peso de SEO a clusters y dejar la home para conversión debería ser la próxima decisión de producto.
3. La “prueba social” sigue siendo un párrafo de posicionamiento: **única sección sin heading y sin prueba**. Sustituirla por 1 testimonio real o eliminarla.
4. Hay dos comparativas consecutivas (líneas 1.168–3.376) y un módulo de clusters SEO (4.906–6.410) que duplican argumentos con /pricing y con /features. En la versión actual la home argumenta 9 veces lo mismo que una página dedicada.
5. El formulario del CTA final (suscripción a novedades) **no tiene label ni name**, lo que rompe accesibilidad, autofill y rastreo del `source`. Es un bug técnico además de una oportunidad perdida de lead nurturing.
6. En desktop el H1 ocupa el 38 % del alto del hero (5 líneas en mobile). Bajar tipografía a `text-4xl` en `< sm` devolvería el CTA al primer viewport completo.
7. El CTA de navbar **no se renderiza en mobile** (`hidden … md:flex`) — la usuaria móvil solo ve el menú hamburguesa. Hay un sticky bar al pasar 50 % del viewport, pero el primer vistazo no tiene CTA garantizado.

---

## Section-by-Section Analysis

### 1. Hero Section — **Score: 7 / 10**
**Estado real (verificado en captura)**
- H1: *“Las cuotas cobradas, los grupos montados y la lista pasada.”*. Beneficio concreto, enumerado. OK post-fix.
- Subhead inmediato: *“Sin Excel y sin 14 chats de WhatsApp.”* Posiciona contra la herramienta real del ICP.
- Subtítulo descriptivo: *“Zaltyko es el software de gestión hecho solo para clubes de gimnasia artística y rítmica…”*. Especifica vertical y outcome.
- Eyebrow `GIMNASIA ARTÍSTICA · GAM · RÍTMICA` (12px, mayúsculas, 0.08em, teal).
- CTA principal `Crea tu academia gratis` (275×50 px en desktop, full-width en mobile) → `/auth/register?role=owner`. Contraste adecuado.
- CTA secundario `Ver planes` (outline) → `/pricing`.
- Microcopy bajo CTA: “Sin tarjeta · Puesta en marcha guiada · Sin compromiso”.
- Visual derecho: panel ilustrativo (no captura real) con pase de lista Lucía M. / Martín O. / Vera S. / Noa P., línea teal de 2 px bajo el card y chips con esquina cortada — diferencia frente al SaaS genérico.
- Navbar público: 5 ítems (Academias, Eventos, Producto, Precios, Ayuda). No compite con el CTA en desktop.

**Fixes**
- **HIGH**: En mobile (390 px) el H1 ocupa `120 → 372 px` (252 px de alto, casi 5 líneas). Bajar `text-5xl` → `text-4xl` en mobile en `HeroSection.tsx:42` (o `clamp()` con `min(7vh, 56px)`). Recupera el CTA en el primer viewport completo.
- **MEDIUM**: El visual derecho aparece abajo del H1 en mobile y no tiene `alt` útil. Añadir `role="img"` + `aria-label="Pase de lista desde el móvil, sesión por sesión"`.
- **MEDIUM**: Test A/B recomendado en `Crea tu academia gratis` → `Crear mi academia gratis` (1ª persona, uplift típico 5–15 % en SaaS self-serve).
- **LOW**: Añadir `aria-describedby` al CTA que apunte al microcopy.

---

### 2. Value Proposition — **Score: 6 / 10**
**Estado real**
- *“Software de gestión hecho solo para clubes de gimnasia artística y rítmica: gimnastas por nivel y aparato, cuotas recurrentes, asistencia por sesión y familias informadas.”* — Mecanismo único, audiencia clara.
- **No aterriza con número, plazo ni ROI**. *¿Cuánto ahorro? ¿Cuánto tarda? ¿Sirve para mi academia de 47 gimnastas?*

**Fixes**
- **HIGH**: Añadir **una cifra concreta ya verificada**. La auditoría 2026-07-13 prohibió *“15 h ahorradas”*, *“3x más eficiencia”*, *“2 horas”*. Sin datos propios, sustituir por **mecanismo cuantificado**: *“Gratis hasta 30 gimnastas · 7 días de Starter completo sin tarjeta · 19 €/mes a partir de 31 gimnastas”*. Cumple la promesa sin inventar.
- **HIGH**: Sustituir el subtítulo por bullets escaneables:
  - Gimnastas por nivel y aparato (GAF, GAM, Rítmica)
  - Cuotas recurrentes y avisos automáticos a familias
  - Pase de lista por sesión, desde el móvil
  - Puesta en marcha guiada, sin migración manual
- **MEDIUM**: A/B test sobre *“14 chats de WhatsApp”* — el número comunica branded voice pero resta seriedad para una Directora que proyecta comprar a su junta directiva. Variante neutra: *“y fuera de WhatsApp”*.

---

### 3. Social Proof — **Score: 2 / 10**
**Estado real**
- Sección **sin heading**, sin fondo distintivo, con un único párrafo: *“Zaltyko está enfocado en academias de gimnasia artística femenina, artística masculina y rítmica. Una herramienta específica para dirección, entrenadores, gimnastas y familias.”*. No contiene cifras, ni nombres, ni logos.

**Fixes**
- **HIGH** (decisión recomendada): **Eliminar la sección** mientras no haya cita verificada con academia real. Hoy comunica *“nadie nos usa todavía”* justo donde el comprador busca *“¿alguien como yo lo usa?”*. Cómo: `src/app/page.tsx:89` eliminar `<SocialProofSection />` con comentario `// Sustituir por prueba real cuando exista permiso de academia piloto`.
- **HIGH** (objetivo 7 días): pedir 1 cita + nº de gimnastas al único piloto real (verificado en `Changelog interno.md` 2026-07-08) y reescribir la sección como: *“La academia [nombre], con [N] gimnastas, lleva su temporada 2026-27 con Zaltyko.”* + cita atribuida. Acción con mayor retorno de CRO por hora invertida.
- **HIGH**: si en 14 días no hay permiso, sustituir por un pull-quote interno (no nombre ficticio): *“Nacimos de una observación: las directoras dedicaban las tardes a perseguir cuotas por WhatsApp en vez de planificar la temporada.”*

---

### 4. Features / Módulos — **Score: 7 / 10**
**Estado real** (`ModulesSection.tsx`, 8 tarjetas)
- *“Hecho para cómo funciona un club de gimnasia”* — conecta con la promesa.
- Icono plano teal + 4 bullets. Tras la limpieza del Addendum 3 ya no son “8 tarjetas con icono en cuadrado de gradiente”.
- *“Categorías por edad y nivel”* (Eventos) ya reescrito (OK post-fix spanglish).
- *“Asistencia automática”* / *“en tiempo real”* ya reescrito a *“asistencia por sesión”*.
- CTA inferior *“Ver todas las funcionalidades →”* → `/features`.

**Fixes**
- **MEDIUM**: el orden actual (Gimnastas, Clases, Cobros, Eventos, Evaluaciones, Comunicación, Reportes, Multi-Academia) **no refleja el dolor del ICP**. Reordenar por relevancia para una Directora que evalúa Zaltyko: 1) Cobros, 2) Clases & Horarios, 3) Comunicación, 4) Gimnastas, 5) Eventos, 6) Evaluaciones, 7) Reportes, 8) Multi-Academia. Solo mover el array `modules` (`ModulesSection.tsx:19-69`).
- **MEDIUM**: dos tarjetas (`Gimnastas`, `Multi-Academia`) tienen `lg:col-span-2` sin motivo funcional. Alinear a `lg:col-span-1` salvo que la tarjeta destaque una feature (recomiendo destacar **Cobros** con `lg:col-span-2` y micro-copy *“Lo que más usan las directoras”*).
- **MEDIUM**: añadir micro-beneficio en una línea debajo de cada título: ej. *“Ficha técnica por gimnasta, nivel y aparato”* / *“Avisos automáticos y domiciliación para no perseguir cuotas”*.
- **LOW**: cada tarjeta termina en bullets no cliqueables. Si `/features/<slug>` existiera, hacerlos enlaces.

---

### 5. Comparativas — **Score: 5 / 10**
**Estado real**: dos tablas consecutivas.
- *¿Por qué no seguir con Excel?* (`ComparisonSection.tsx`, 1.168–2.235): Zaltyko vs Excel vs Software genérico. 10 filas. Buena base, ya con claim *“Puesta en marcha guiada”* (sin cifras inventadas, OK post-fix).
- *Software específico para gimnasia* (`WhyZaltykoSection.tsx`, 2.235–3.376): Zaltyko vs Software genérico. 7 filas. **Solapa** con la anterior.

**Fixes**
- **HIGH**: **fusionar** en una única tabla de 3 columnas (la de `ComparisonSection.tsx`). Borrar `WhyZaltykoSection.tsx` y su import en `src/app/page.tsx:8`. Migración segura: grep confirma 0 imports fuera de `page.tsx`.
- **MEDIUM**: la fila *“Puesta en marcha”* tiene “Guiada / Manual / Según proveedor” — wins para Zaltyko pero no cuantifica. Sustituir por *“Migración desde Excel incluida”* (verificable tras `ImportExportPanel` cableado el 2026-07-13).
- **MEDIUM**: “Software genérico” debería poder decir *“Clupik / iClassPro”* al menos en la primera mención. Nombra a la competencia da credibilidad.
- **LOW**: dos tablas usan radios distintos (`rounded-2xl` vs `rounded-3xl`); unificar al token `rounded-card` (10 px) definido en el Addendum 5.

---

### 6. Cluster Discovery / SEO extendido — **Score: 4 / 10 (para CRO de home)**
**Estado real**
- 1.504 px desktop / 2.220 px mobile de **clusters SEO en la home**. Decisión deliberada de producto (alimentar SEO programático), pero **compite** con la conversión.
- 6 tarjetas “Acceso rápido” (3 países × 2 modalidades) + matriz completa + “52 páginas específicas”.
- Botón *“Explorar clusters SEO →”* → `/es/gimnasia-artistica/espana`.

**Fixes**
- **HIGH**: el CTA del cluster lleva a una página de cluster, no a registro. Si quieres SEO, perfecto; si quieres conversión, **duplica el objetivo del hero**. Opciones:
  - (recomendada) Mover el bloque entero a `<details>` colapsado por defecto justo después de la comparativa y antes del CTA final. Quita 1.504 px del fold.
  - (alternativa) Mantener visible solo las 4 tarjetas “Acceso rápido”.
- **MEDIUM**: el claim *“52 páginas específicas”* no es verificable a simple vista. Sustituir por *“Cobertura específica para España, México, Argentina, Colombia, Chile y Perú en gimnasia artística y rítmica”* (países enumerables en `ClusterDiscoverySection.tsx:22-28`).
- **MEDIUM**: añadir `aria-label` claro a cada tarjeta de cluster (`Acceder a contenido de gimnasia artística en España`).

---

### 7. Before/After (SEO extendido) — **Score: 7 / 10**
**Estado real** (`SeoExtendedSection.tsx`)
- *“De la gestión manual al control total.”*
- 4 pares antes/después.
- CTA *“Crea tu academia gratis”* cierra el bloque. Microcopy: *“Puesta en marcha guiada · Sin compromiso”*.
- **Stats “15 h/0/100%/3x” eliminadas** (verificado en código). OK post-fix.

**Fixes**
- **MEDIUM**: cada par debería anclar **la objeción** que resuelve. Ejemplos:
  - Antes: *“Cobros manuales y persecución de morosos”* → Después: *“Recordatorios automáticos a familias (configura el día y listo)”*.
  - Antes: *“Inscripciones a competiciones caóticas”* → Después: *“Inscripción online por categoría, con lista de espera”*.
- **MEDIUM**: añadir tercera columna **Dolor** (3 columnas: *Dolor / Antes / Después con Zaltyko*). Refuerza especificidad vertical.
- **LOW**: el bloque vive a `6.410 → 7.309` px en desktop, **muy abajo**. Si el cluster se mueve a `<details>` (Fix §6), este pasa a posición primaria post-comparativa — palanca alta.

---

### 8. FAQ — **Score: 8 / 10**
**Estado real** (`FaqSection.tsx`)
- 8 preguntas, tono honesto post-fix 2026-07-13 (*“sin prometer duración cerrada”*, *“la migración la acompañamos”*, *“el pase de lista está puliéndose para pista”*).
- CTA *“Ver planes y precios”* → `/pricing#planes`. CTA correo *“hola@zaltyko.com”*.

**Fixes**
- **HIGH**: **falta** la pregunta más buscada en vertical infantil/RGPD: *“¿Cumple con la normativa de protección de datos de menores?”*. Sustituir *“¿Qué pasa con mis datos si cancelo?”* (información ya en otros lugares). Respuesta sugerida, alineada con [[Mensajes aprobados]]: *“Sí. Zaltyko aísla los datos por academia, registra consentimientos firmados por las familias y sigue la normativa española de protección de datos de menores. Si quieres, te enviamos el resumen técnico.”* (usar *“aislamiento por academia”* y *“controles de acceso”*, NO *“RGPD Compliant”*).
- **MEDIUM**: el acordeón abre la primera pregunta por defecto. Abrir en su lugar *“¿Cuánto tiempo tarda en configurarse?”* — la objeción más común en compra SaaS.
- **MEDIUM** (bug detectado en tiempo de auditoría): el schema `FAQPage` (`page.tsx:166-238`) contiene 8 preguntas que **no coinciden 1:1 con las de la sección visible**. Google puede tratarlo como cloaking si compara. **Fix 1 h**: alinear al carácter. El propio §7 de la auditoría 2026-07-13 ya marcaba esta regla.
- **LOW**: añadir `trackFAQOpen` por pregunta (`analytics.faqOpen(question)`) usando el helper existente (`src/lib/analytics.ts`).

---

### 9. CTA Final & Form — **Score: 6 / 10**
**Estado real** (`FinalCtaSection.tsx`)
- Fondo navy con `zaltyko-motion-lines` (textura de marca).
- H2 *“¿Listo para dirigir tu academia con más control?”*.
- 4 bullets con check blanco (copy aprobado en [[Mensajes aprobados]]).
- CTA primario `Crea tu academia gratis` + secundario `Ver planes y precios`.
- **Formulario de email** (`EmailCapture` con `source=final_cta`):
  - 1 campo `type=email`, **sin `name`**, **sin `autocomplete`**, **sin `aria-label`**, **sin `<label>`**. `id` generado por runtime.
  - Validación solo HTML5 (`required` + `type=email`).
  - Sin política de privacidad adyacente.
  - Botón *“Suscribirme”* — **conflicto de intención**: el bloque dice *“registro de academia”*, el botón dice *“suscríbete a newsletter”*.
  - Tras éxito: *“Te hemos registrado. Pronto recibirás novedades.”* — ambiguo.
  - Endpoint `/api/leads` con `getGrowthVisitorId()` + tracking de `posthog`. Analítica correcta.

**Fixes**
- **HIGH (bug)**: añadir `name="email"`, `autoComplete="email"`, `inputMode="email"`, `aria-label="Tu correo electrónico"` y un `<label>` visible en `EmailCapture.tsx:81-90` y `113-122`. Pieza de 5 minutos que sube CR ~3-5 %.
- **HIGH (cambio de copy + destino)**: decidir si este form es **lead magnet de newsletter** o **pre-registro acelerado**. Hoy mezcla ambos. Opciones:
  - (recomendada) Renombrar a *“Si prefieres, déjanos tu correo y te llamamos antes de la próxima temporada”*. Botón *“Quiero que me contactéis”*. Mismo endpoint, sin contradecir el CTA principal.
  - (alternativa) Cambiar el botón a *“Empezar mi academia gratis”* y redirigir a `/auth/register?role=owner&email=…` con el email prellenado — el form pasa de lead magnet a capturador de cuentas incompletas.
- **MEDIUM**: añadir microcopy de privacidad *“Sin spam. Tu correo se guarda solo para esta comunicación.”*
- **MEDIUM**: mensaje de éxito *“Te hemos registrado. Pronto recibirás novedades.”* → *“Listo. Te llegará un correo en las próximas 24 h con ideas de gestión para academias.”*
- **LOW**: mover la línea *“Trabajáis con datos de menores: cada academia está aislada y cada rol ve solo lo suyo.”* junto al form, con icono candado, para reforzar confianza justo antes del clic.

---

### Footer — **Score: 7 / 10**
**Estado real** (`Footer.tsx`)
- Badge superior: **4 sellos blancos** (privacidad por diseño · SSL encriptado · Cancelación libre · Soporte en español). OK post-fix de la regla RGPD Compliant.
- 4 columnas (Producto, Recursos, Empresa, Legal) + columna de logo.
- Iconos de redes deshabilitados (Twitter / LinkedIn / Instagram) con `title="Próximamente"`. El schema Organization ya **no** declara `sameAs`. Honesto y OK.

**Fixes**
- **MEDIUM**: el badge *“SSL Encriptado”* es commodity de navegador en 2026. Reordenar a *“Privacidad por diseño”* y *“Cancelación libre”* primero, mover SSL al último.
- **LOW**: añadir dirección física / sede social / NIF en microcopy al final para reforzar confianza B2B (verificar antes con el usuario).
- **LOW**: si en 6 meses los iconos “Próximamente” siguen sin existir, eliminarlos (`Footer.tsx:79-87`).

---

## Resumen de métricas detectadas (Playwright)

| Métrica | Desktop (1440×900) | Mobile (390×844) | Estado |
|---|---|---|---|
| Altura total del documento | 10.154 px | 14.748 px | Rojo (largo) |
| Secciones por encima del primer fold | 1 (hero) | 1 (hero) | OK |
| CTAs principales visibles sin scroll | 2 (navy + hero) | 1 (hero — el de navbar está oculto) | Amarillo |
| Top del CTA principal (px) | 716 | 642 | Amarillo |
| Overflow horizontal | no | no | OK |
| `console.error` | 0 | 0 | OK |
| `pageerror` | 0 | 0 | OK |
| `requestfailed` | 0 | 0 | OK |
| Recursos transferidos | 1,25 MB | 1,25 MB | OK |
| Recursos decodificados | 4,83 MB | 4,83 MB | Amarillo (auditar bundle) |
| Logo footer (loading=lazy) | `natural: 0×0` | `natural: 0×0` | No crítico |
| Formularios en home | 1 | 1 | OK |

Notas:
- `responseEnd ≈ 22 s` desktop es **compilación inicial de Next dev**, no trasladable a producción. Mobile (warm): 1,7 s.
- `decodedBytes = 4,83 MB` sugiere revisar con `@next/bundle-analyzer` que no se carguen deps de auth/Stripe/CSP antes del LCP público.

---

## Copy Score: 80 / 100

| Dimensión | Puntuación | Notas |
|---|---|---|
| Claridad | 9 / 10 | La promesa se entiende en 5 segundos. |
| Urgencia | 4 / 10 | Sin fecha, sin cuenta atrás. Solo el trial de 7 días (única urgencia real). |
| Especificidad | 8 / 10 | Cifras verificadas (19 €/mes, 30 gimnastas, 75 gimnastas, 7 días). |
| Prueba | 2 / 10 | Sin testimonios ni logos. Solo marca y copy. |
| Orientación a la acción | 9 / 10 | 5 CTAs primarios, todos apuntando a `/auth/register?role=owner`. |

---

## Form Audit (CTA final)

| Elemento | Estado actual | Mejora propuesta |
|---|---|---|
| Recuento de campos | 1 (email) | OK mantener 1; añadir `name` + `autocomplete` |
| Labels | Solo placeholder, sin `<label>` | Añadir `<label>` visible + `aria-label` |
| Texto del botón | “Suscribirme” | Cambiar a “Empezar mi academia gratis” o “Quiero que me contactéis” |
| Validación | HTML5 `required` + `type=email` | OK; añadir mensaje específico de error |
| Required vs optional | Único campo required | OK |
| Auto-fill | sin `autocomplete` | `autoComplete="email"` |
| Input types | `type="email"` | OK; añadir `inputMode="email"` |
| Privacidad | sin línea específica | Añadir micro “Sin spam. Te puedes dar de baja en un clic.” |
| Mensaje de éxito | Ambiguo | Cambiar a “Te llegará un correo en 24 h con ideas de gestión.” |

---

## Mobile Audit

- **CTA móvil above-the-fold: solo el icono de menú.** El `Crear cuenta gratis` está dentro de `<div className="hidden … md:flex">` (`Navbar.tsx:81-98`) y **no se renderiza en mobile** (`rect: {0,0,0,0}` en la captura). El usuario móvil solo tiene el CTA del hero (642 px) y el sticky bar que aparece tras 50 % de scroll.
  - **Decisión recomendada**: en mobile mostrar el CTA como texto “Acceder” en la esquina superior derecha, no como botón ancho.
- Texto body mínimo **16 px** cumplido. Hero H1 a `text-5xl` debería bajar a `text-4xl` en mobile para no empujar el CTA fuera del primer 70 %.
- Inputs del form tienen `pl-10` (icono mail a la izquierda) → en mobile ocupa toda la línea, OK.
- Sticky CTA bar aparece a `window.innerHeight * 0.5` → bien calibrado.
- Sin scroll horizontal: OK.
- Sin animaciones `animate-ping` / `animate-bounce` en la home pública (verificado por búsqueda en componentes). Limpieza post-Addenda 2/3.

---

## A/B Test Recommendations

1. **H1 mobile más bajo** — *Si* bajamos `text-5xl` → `text-4xl` en mobile, *entonces* el % de CTA above-the-fold sube de ~78 % actual a 100 %, *porque* la usuaria no necesita desplazar para ver el botón.
2. **Copy del H1 estacional** — *Si* en tráfico estival (jun-sept) probamos *“Empieza la temporada con cuotas cobradas, grupos listos y lista pasada.”*, *entonces* el CTR del CTA sube 5-15 % sobre el baseline, *porque* aterriza en el dolor real del momento de compra. (Variante de la opción #5 de la auditoría 2026-07-13.)
3. **CTA en 1ª persona** — *Si* cambiamos *“Crea tu academia gratis”* → *“Crear mi academia gratis”*, *entonces* el click-through rate sube 5-15 % (benchmark SaaS self-serve), *porque* la propietaria siente propiedad sobre el verbo.
4. **Form = pre-registro** — *Si* cambiamos *“Suscribirme”* → *“Empezar mi academia gratis”* + redirect a `/auth/register?role=owner&email=…`, *entonces* sube 10-25 % el % de registros completos desde la home, *porque* alinea intención con acción.
5. **Comparativa única** — *Si* fusionamos las dos tablas, *entonces* la sección se acorta ~1.200 px en desktop y reduce scroll profundo, *porque* la redundancia diluye el argumento.
6. **Clusters SEO colapsados** — *Si* movemos el bloque *“Especialistas en tu país y modalidad”* a un `<details>` cerrado por defecto, *entonces* el tiempo al primer scroll significativo baja, *porque* el visitante comercial no tiene que pasar por SEO para llegar al CTA.
7. **FAQ abre por la pregunta correcta** — *Si* abrimos por defecto *“¿Cuánto tiempo tarda en configurarse?”*, *entonces* la objeción de tiempo muere antes del CTA, *porque* la Directora SaaS pregunta tiempo antes que modalidades.
8. **Sticky bar con urgencia real** — *Si* la sticky muestra cuenta atrás del trial de 7 días tras 60 s en la home, *entonces* el CTR sube, *porque* activa urgencia verificable (no fabricada).
9. **Cita piloto real** — *Si* añadimos 1 cita del club activo, *entonces* el engagement sube, *porque* el visitante busca *“¿alguien como yo lo está usando?”* y hoy no encuentra nada.
10. **Clusters ocultos a tráfico de pago** — *Si* detectamos `utm_source` de Ads y ocultamos el bloque clusters, *entonces* acortamos la página y mejoramos la conversión de campaña, *porque* el tráfico Ads llega con intención de compra, no de exploración.

---

## Prioritized Fix List

### Quick Wins (esta semana)
1. **(HIGH, 30 min)** Alinear `FAQPage` schema con preguntas visibles. Actualizar `src/app/page.tsx:166-238` 1:1 con `FaqSection.tsx:7-40`.
2. **(HIGH, 30 min)** Bug del formulario: añadir `name`, `autoComplete`, `aria-label`, `<label>` en `EmailCapture.tsx:81-90` y `113-122`.
3. **(HIGH, 15 min)** Bug del navbar móvil: añadir el CTA en mobile. `Navbar.tsx:99-107` mover el botón fuera de `hidden … md:flex` y mostrarlo siempre como texto corto.
4. **(HIGH, 1 h)** Mover `ClusterDiscoverySection` a `<details>` colapsado por defecto, entre la comparativa y la sección Before/After.
5. **(HIGH, 1 h)** Fusionar las dos comparativas: borrar `WhyZaltykoSection.tsx` y su import + render en `src/app/page.tsx:8, 95`.
6. **(HIGH, 30 min)** Cambiar `text-5xl` por `clamp()` en `HeroSection.tsx:42` para mobile.
7. **(MEDIUM, 1 h)** Decidir destino del form del CTA final (lead magnet vs pre-registro) y reescribir `EmailCapture.tsx` + `FinalCtaSection.tsx` con un único copy coherente.
8. **(MEDIUM, 1 h)** Quitar del render la sección SocialProof vacía (`src/app/page.tsx:89`) mientras no haya cita real.

### Mid-term (este mes)
9. **(MEDIUM, 2 h)** Reordenar el array `modules` en `ModulesSection.tsx:19-69` por relevancia para la Directora (Cobros primero).
10. **(MEDIUM, 4 h)** Plan de pruebas A/B documentado en vault (P0, items 1–4) con hipótesis, métrica y umbral de éxito.
11. **(MEDIUM, 3 h)** Implementar pre-registro `/auth/register?role=owner&email=…` + tests e2e `tests/e2e-zaltyko-public.spec.ts`.
12. **(MEDIUM, 1 h)** Auditoría de bundle con `@next/bundle-analyzer` para confirmar < 1 MB decodificado en la home pública.
13. **(MEDIUM, 2 h)** Reemplazar la sección `SeoExtendedSection` por una tabla de 3 columnas Dolor / Antes / Después, conservando el CTA.
14. **(MEDIUM, 2 h)** Pedir permiso + cita al club piloto, reescribir `SocialProofSection.tsx`, volver a habilitar la sección en `page.tsx`.

### Strategic (este trimestre)
15. **(STRATEGIC, 1 semana)** Dividir `home` en dos rutas: `/` (conversión, 6 secciones, < 4.000 px) y `/se/que-es` (SEO programático, conservando clusters). Decisión de arquitectura.
16. **(STRATEGIC, 1 semana)** Captura real del producto para el hero. Sustituir el visual ilustrativo por un `<Image>` con `priority` que muestre el panel real.
17. **(STRATEGIC, decisión)** Decidir **qué hace el form del CTA final** definitivamente (lead magnet vs pre-registro). Hoy mezcla ambos.
18. **(STRATEGIC, 2 semanas)** Página `/clubes/[slug]` con caso piloto público. Habilita bloques de social proof reales en toda la home y `/pricing`.

---

## Before/After Wireframe (textual)

### Actual

```
[NAVBAR] Logo | Academias Eventos Producto Precios Ayuda | Iniciar sesión [Crear cuenta gratis]
                                                                                      <- STICKY

[HERO]
 eyebrow: GIMNASIA ARTÍSTICA · GAM · RÍTMICA
 H1: Las cuotas cobradas, los grupos montados y la lista pasada.
 Sub: Sin Excel y sin 14 chats de WhatsApp.
 Párrafo descriptivo (3 líneas).
 [Crea tu academia gratis] [Ver planes]
 micro: Sin tarjeta · Puesta en marcha guiada · Sin compromiso
                                                  [Pase de lista ilustrativo]
[Sin heading] Párrafo sin prueba.

[Comparativa 1] ¿Por qué no seguir con Excel? (10 filas, 3 columnas)

[Comparativa 2] Software específico para gimnasia (7 filas, 3 columnas) <- DUPLICADA

[Módulos] Hecho para cómo funciona un club de gimnasia (8 cards)

[Clusters SEO] Especialistas en tu país y modalidad (4 cards + matriz + CTA)

[Before/After] De la gestión manual al control total (4 pares)

[FAQ] 8 preguntas, acordeón

[CTA Final] Fondo navy + bullets + CTA + form de 1 campo sin label

[FOOTER]
```

### Recomendada

```
[NAVBAR] Logo | nav 5 ítems | Iniciar sesión [Crear cuenta gratis visible siempre]

[HERO] Texto mobile-first: el CTA a 480 px del top en vez de 642.
       H1 con clamp(), bullets con icono.
                                                  [Captura real del producto]

[Comparativa única] Zaltyko / Excel + WhatsApp / Software genérico (Clupik, iClassPro)

[Módulos reordenados] Cobros primero, Multi-Academia al final.

<details> Especialistas en tu país y modalidad [+12%, país × modalidad] <- COLAPSADO

[Before/After Dolor / Antes / Después]

[FAQ abre por "¿Cuánto tarda?" + pregunta de menores/RGPD]

[CTA Final navy + bullets + 1 CTA primario + form pre-registro a /auth/register]

[FOOTER]
```

---

## Riesgos y notas para el usuario

- **Cero academia en `landing_cta_primary_click`** en este momento (Addendum 3 confirmó baseline: 2 academias, 0 leads, 0 trials, 0 checkouts). Las tasas aquí son `[SUPUESTO]` basadas en benchmarks de SaaS self-serve. Cualquier afirmación de impacto monetario (X € al mes) es orientativa, no proyectable.
- **Bloqueos por [[Mensajes aprobados]]**: cualquier cambio de copy de la promesa principal, del nombre de planes o de claims de privacidad/seguridad necesita actualizar esa nota antes. La actual no prohíbe los arreglos propuestos aquí (salvo *“100% seguro”*, *“RGPD Compliant”*, *“2 horas”*, *“15 h ahorradas”*, *“3x más eficiencia”* y promesas de duración cerrada sin evidencia).
- **Coordinación multi-agente**: antes de aplicar cualquier Quick Win, releer `vault/06-Roadmap-y-Tareas/Changelog interno.md`. El CTA ya fue coordinado en los Addenda 1–2 de la auditoría 2026-07-13; este informe se basa en esos cambios ya en `src/`.
- **No se ha aplicado ningún cambio** como parte de este análisis. Es un informe de CRO, no una pasada de código.
- **Servidor de dev**: se levantó `pnpm dev` para capturar la home real. El proceso queda corriendo en background (ID `b1o5mnfys`). Si quieres pararlo para liberar el puerto, dímelo.
