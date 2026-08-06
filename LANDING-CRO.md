# Landing Page CRO Analysis
## https://zaltyko.com/ (home pública de Zaltyko)
### Analysis Date: 2026-07-23

---

> **Aviso**: este análisis actualiza al de 2026-07-14 (Overall 78/100). Antes de reescribir nada, verifiqué contra el código actual qué de esa lista ya se aplicó y qué sigue abierto — no repito recomendaciones ya resueltas. Metodología distinta a la del 07-14 (que usó Playwright con métricas de píxel exactas en 1440×900/390×844): aquí verifiqué contra el código fuente de cada sección (`src/app/page.tsx` y los 9 componentes que importa), capturas reales en `https://zaltyko.com` (desktop y mobile 375px) y una inspección de DOM puntual para el bug nuevo del §1. Si quieres volver al nivel de precisión de píxel del informe anterior, dímelo y levanto Playwright.
>
> **Contexto operativo importante**: hasta hace unas horas, `middleware.ts` redirigía **toda** visita a `/` hacia `/es/gimnasia-artistica` (un bug de routing no relacionado con CRO, ya corregido en este mismo hilo de trabajo). Es decir: la home que audita este informe llevaba tiempo siendo, en la práctica, **inalcanzable en producción** — cualquier visitante que llegara a zaltyko.com caía en una página de cluster SEO, no en esta home. Esto no invalida el análisis de contenido de la home (el componente en sí no cambió), pero explica por qué el CTR real observado pueda ser aún más bajo que las estimaciones de aquí: la home nunca se sirvió tal cual hasta hoy.

---

## Overall CRO Score: 74 / 100

## Page Type: SaaS Signup (registro de academia → Free / Starter 7 días)
## Current Estimated Conversion Rate: sin denominador fiable todavía (repite el baseline de la auditoría anterior: tráfico real ~0 hasta que la home sea alcanzable). Con la home ya reparada y estas correcciones, estimación de rango: 1,5–3 %
## Target Conversion Rate: 4–6 % en 90 días tras aplicar los Quick Wins de abajo

---

## Qué ya se corrigió desde el 2026-07-14 (no repetir)

| Hallazgo previo (HIGH) | Estado verificado hoy |
|---|---|
| CTA de navbar no se renderizaba en mobile | **Corregido.** El botón de registro vive fuera del contenedor `hidden … md:flex`; hoy es siempre visible (`Crear cuenta` en mobile, `Crear cuenta gratis` en desktop) — confirmado en código y en captura 375px. |
| H1 mobile ocupaba ~5 líneas / 252px (`text-5xl` fijo) | **Corregido.** `HeroSection.tsx:45` ya usa `text-[clamp(1.875rem,6vw,4.5rem)]`, responsive real. |
| Dos comparativas duplicadas (`ComparisonSection` + `WhyZaltykoSection`) | **Corregido.** `WhyZaltykoSection` ya no se importa ni se renderiza en `src/app/page.tsx` (el archivo sigue existiendo en el repo pero está huérfano — se puede borrar). |
| Formulario del CTA final sin `name`/`autocomplete`/`aria-label`/`label` | **Corregido.** `EmailCapture.tsx` ya tiene `name="email"`, `autoComplete="email"`, `inputMode="email"`, `aria-label`, `aria-invalid`, y `<label htmlFor={emailId} className="sr-only">` en ambas variantes. |
| Conflicto de intención en el form (¿newsletter o pre-registro?) | **Resuelto como newsletter.** El copy de `FinalCtaSection` ("¿Quieres recibir ideas de gestión...?") y el botón ("Suscribirme") ya son coherentes entre sí; el CTA de registro real queda arriba, separado. |
| Clusters SEO siempre expandidos, compitiendo con el CTA | **Parcialmente corregido.** La matriz completa (`ALL_MODALITIES × ALL_COUNTRIES`) ya vive en un `<details>` colapsado por defecto (`ClusterDiscoverySection.tsx:76`). La grid de "Acceso rápido" (6 tarjetas) sigue siempre visible — ver §6 abajo. |

---

## Section-by-Section Analysis

### 1. Hero Section [Score: 6/10]

**Findings:**
- **Bug nuevo, no detectado en la auditoría anterior**: el eyebrow "GIMNASIA ARTÍSTICA · GAM · RÍTMICA" se renderiza parcialmente detrás del `Navbar` fijo con fondo translúcido (`bg-white/80 backdrop-blur-md`), produciendo un efecto de texto duplicado/fantasma justo encima del H1. Verificado por inspección de DOM en `zaltyko.com`: un único nodo `<p>` en `top: 80px`; el padding superior del Hero (`py-20` = 80px) es prácticamente igual a la altura del nav fijo (~88px) y no llega a despejarlo. Reproducido en desktop y en mobile (375px) — es lo primerísimo que ve el 100% de las visitas.
- El resto del hero sigue fuerte: H1 outcome-focused, subheadline de posicionamiento contra WhatsApp/Excel, CTA con buen contraste y microcopy de riesgo, visual ilustrativo del producto real (no stock).
- Sigue sin ningún elemento de confianza/prueba social dentro del propio fold del hero (coincide con el hallazgo de Value Prop / Social Proof de la auditoría anterior, todavía sin resolver).

**Fixes (Priority: HIGH):**
- Aumentar el padding superior del Hero (o usar `scroll-margin-top`/mayor `py-*`) para que el eyebrow no quede tras el nav — 10 minutos de CSS, corrige un bug visible en el 100% de las visitas.

---

### 2. Value Proposition [Score: 7.5/10]

**Findings (marco 4U):** Useful y Ultra-specific fuertes (cifras concretas: 30 gimnastas gratis, GAF/GAM/rítmica nombrados). Unique bien comunicado vía la comparativa. Urgent sigue débil — sin fecha límite ni motivo real para actuar hoy vs. la semana que viene (mismo hallazgo que el informe anterior).

**Fixes (Priority: MEDIUM):** Sin cambios respecto al informe previo — añadir un elemento de urgencia auténtico si existe (cupo de acompañamiento, cierre de temporada), no fabricado.

---

### 3. Social Proof [Score: 2/10]

**Findings:**
- **Sigue sin resolver** — es el hallazgo HIGH más antiguo de los tres informes consecutivos (2026-03, 07-14, y este). `SocialProofSection.tsx` todavía contiene el comentario literal `// Stats removed - no real data to support these numbers` y `// TODO: Add real stats when available from production data`. Cero testimonios, logos, cifras o ratings en toda la home.
- Los 3 iconos sociales del footer (Twitter/LinkedIn/Instagram) siguen deshabilitados con `title="Próximamente"` — honesto, pero sigue leyendo como "esta empresa recién empieza" en vez de ayudar.

**Fixes (Priority: HIGH — tercera vez que se marca; la que más tarda en resolverse):**
- Si ya existe al menos una academia piloto (el informe 07-14 referenciaba una real en el changelog), pedirle permiso para una cita con nombre + academia + resultado concreto, y reemplazar la sección. Es la única acción de esta lista que puede mover el score de 74 a 85+ por sí sola.
- Si aún no hay permiso, no dejar la sección vacía: sustituir por un bloque verídico de "cómo te acompañamos en la puesta en marcha" con pasos concretos, mientras llega el primer testimonio citable.

---

### 4. Features and Benefits [Score: 8/10]

**Findings:** `ModulesSection` (bento grid, feature→beneficio bien traducido, "Cobros" destacado con `lg:col-span-2` y copy "Lo que más usan las directoras") y `SeoExtendedSection` (antes/después escaneable) siguen sólidos. El orden de módulos (Cobros primero) ya coincide con lo que recomendaba el informe anterior — parece ya aplicado.

**Fixes (Priority: LOW):** Ninguna captura real del producto acompaña las tarjetas de módulos, solo iconos — un mockup por módulo principal subiría credibilidad sin tocar copy.

---

### 5. Objection Handling [Score: 7/10]

**Findings:**
- FAQ cubre 8 objeciones bien elegidas, incluida la de protección de datos de menores (crítica en este nicho).
- **Bug todavía presente, con contenido distinto al de julio**: el schema `FAQPage` en `src/app/page.tsx:204-209` (pregunta de menores) dice *"Sí. Zaltyko aísla los datos por academia, registra consentimientos firmados por las familias y aplica controles de acceso por rol según la normativa española de protección de datos de menores. Si quieres, te enviamos el resumen técnico antes de empezar."* — mientras que la respuesta **visible** en `FaqSection.tsx` dice algo más cauto: *"Zaltyko aísla los datos por academia y aplica controles de acceso por rol y relación autorizada. La gestión de consentimientos y las obligaciones legales de tu academia deben revisarse conforme a la política de privacidad y al asesoramiento aplicable."* Son respuestas distintas a la misma pregunta — el schema es hoy **más afirmativo** que la copia visible (el riesgo cambió de dirección respecto al informe anterior, pero sigue siendo el mismo bug de fondo: contenido estructurado que no coincide con lo que lee la usuaria).
- Las otras 7 preguntas del schema sí coinciden palabra por palabra con `FaqSection.tsx` — el desalineamiento es puntual, no generalizado.
- Sigue faltando una pregunta directa de precio en el FAQ (mismo hallazgo que antes).

**Fixes (Priority: MEDIUM):**
- Alinear la respuesta del schema (`page.tsx:204-209`) a la redacción legal más cautelosa que ya aprobó el equipo en `FaqSection.tsx` — 10 minutos, evita que Google indexe una afirmación más fuerte que la que la propia página sostiene.
- Añadir "¿Cuánto cuesta Zaltyko?" al FAQ visible y a su schema correspondiente.

---

### 6. Call-to-Action [Score: 8/10]

**Findings:** CTA repetido de forma consistente (Navbar, Hero, SeoExtended, FinalCta, StickyCtaBar), buen contraste, secundario "Ver planes" presente, micro-conversión de email en el CTA final ya resuelta como newsletter coherente (ver tabla de arriba).

**Fixes (Priority: LOW):** Ninguno urgente.

---

### 7. Footer and Secondary Elements [Score: 7/10]

**Findings:** Sin cambios relevantes desde julio — badges de confianza correctos, iconos sociales deshabilitados siguen restando más de lo que aportan.

**Fixes (Priority: LOW):** Quitar los 3 iconos "Próximamente" del footer (mismo hallazgo, ahora con 9+ días más de antigüedad sin resolver).

---

## Copy Score: 62/100

| Dimension | Score | Notes |
|---|---|---|
| Clarity | 8/10 | Oferta y audiencia clarísimas; el H1 en participio pasado exige un segundo extra de lectura. |
| Urgency | 4/10 | Evergreen en toda la página, sin cambios desde julio. |
| Specificity | 8/10 | Cifras concretas (30 gimnastas, GAF/GAM/rítmica) mantenidas. |
| Proof | 2/10 | Cero evidencia de terceros — el hallazgo más persistente de los tres informes. |
| Action Orientation | 8/10 | CTA consistente y repetido en las 5 apariciones. |

---

## Form Audit

El único formulario de la home (`EmailCapture` en `FinalCtaSection`, variante inline) ya resuelve todos los puntos de accesibilidad marcados como HIGH en julio (`name`, `autoComplete`, `inputMode`, `aria-label`, `<label htmlFor>` con `sr-only`, manejo de error visible). Sin hallazgos nuevos que corregir aquí.

**Fix (Priority: LOW):** El mensaje de éxito ("¡Genial! Te hemos registrado. Pronto recibirás novedades.") sigue siendo genérico — cambiar a algo más específico ("Te llegará un correo en 24h con ideas de gestión") es una mejora menor pendiente del informe anterior.

---

## Mobile Audit

- **CTA principal thumb-reachable**: sí, confirmado en captura 375px — botones a ancho completo, alcanzables sin desplazar el pulgar.
- **Bug del eyebrow/nav** (§1): se reproduce igual en mobile.
- **StickyCtaBar**: funciona correctamente en scroll, con buen texto truncado y CTA visible.
- **Hallazgo nuevo — tabla comparativa sin affordance de scroll en mobile**: en 375px, `ComparisonSection` solo muestra 3 de sus 4 columnas (Funcionalidad, Zaltyko, Excel/Sheets); la columna "Software genérico" solo es visible con scroll horizontal, sin ninguna señal visual (sombra, flecha, "desliza →") que indique que hay más contenido. Muchas visitantes en mobile no llegarán a verla, perdiendo un tercio del argumento comparativo justo en el dispositivo donde llega la mayoría del tráfico.
- Texto ≥16px, sin scroll horizontal general, sin animaciones intrusivas: todo OK, sin cambios respecto a julio.

**Fixes (Priority: MEDIUM):**
- Añadir sombra/flecha de scroll a la tabla comparativa en mobile, o convertirla en tarjetas apiladas por debajo de un breakpoint.

---

## Page Speed Impact Assessment

No se corrió Lighthouse/PageSpeed Insights en esta sesión (el informe de julio sí tenía métricas Playwright reales — `decodedBytes = 4,83 MB`, marcado en amarillo). Verificación rápida de red en `zaltyko.com`: todas las peticiones (JS de Next, prefetch de `/auth/login`, `/auth/register`, `/pricing`) responden 200 sin latencia visible. No sustituye una medición de LCP/CLS real.

**Fix (Priority: MEDIUM):** Correr Lighthouse sobre la home ya reparada (antes bloqueada por el redirect) y confirmar si el hallazgo de `4,83 MB` decodificados de julio sigue vigente.

---

## A/B Test Recommendations

1. Si corregimos el solape del eyebrow con el nav fijo, entonces la percepción de calidad del hero sube, porque hoy el primer elemento visible en el 100% de las visitas se ve roto.
2. Si sustituimos `SocialProofSection` por un testimonio real o un bloque verídico de "cómo te acompañamos", entonces sube la tasa de scroll-to-CTA, porque hoy no hay ningún motivo de confianza entre el hero y la comparativa.
3. Si alineamos la respuesta del schema FAQ (menores/datos) con la copia visible ya aprobada, entonces se reduce el riesgo de que Google muestre una promesa más fuerte de la que la página sostiene.
4. Si convertimos la tabla comparativa en tarjetas apiladas en mobile, entonces sube el tiempo en página y el CTR hacia el CTA final en mobile, porque hoy un tercio del argumento es invisible sin gesto de swipe.
5. Si añadimos "¿Cuánto cuesta Zaltyko?" al FAQ, entonces baja la salida hacia `/pricing` sin conversión, porque resolvemos la objeción de precio sin sacar a la visitante de la página.

---

## Prioritized Fix List

### Quick Wins (esta semana)
1. **(HIGH, 10 min)** Corregir el padding del Hero para que el eyebrow no quede detrás del Navbar fijo.
2. **(MEDIUM, 10 min)** Alinear la respuesta del schema FAQ sobre datos de menores (`page.tsx:204-209`) con la redacción ya aprobada en `FaqSection.tsx`.
3. **(LOW, 5 min)** Quitar los 3 iconos sociales deshabilitados del footer.
4. **(MEDIUM, 30 min)** Añadir "¿Cuánto cuesta Zaltyko?" al FAQ visible y a su schema.

### Medium-Term (este mes)
1. **(HIGH)** Reemplazar `SocialProofSection` por contenido verídico (proceso real o testimonio, en cuanto haya permiso) — tercera vez que este informe lo marca como el fix de mayor impacto pendiente.
2. **(MEDIUM)** Arreglar la tabla comparativa en mobile (affordance de scroll o layout de tarjetas).
3. **(MEDIUM)** Correr Lighthouse real sobre la home ya reparada y actuar sobre LCP/bundle si hace falta.
4. **(LOW)** Borrar `WhyZaltykoSection.tsx` del repo (huérfano, ya sin imports).
5. **(LOW)** Colapsar también la grid de "Acceso rápido" de `ClusterDiscoverySection` si se quiere acortar aún más el fold antes del CTA final.

### Strategic (este trimestre)
1. Publicar el primer testimonio real con nombre, foto y resultado concreto — la pieza que más puede mover el score.
2. Añadir un elemento de urgencia genuino ligado a un hito real (cierre de temporada, cupo de acompañamiento).
3. Captura real del producto en el hero, sustituyendo el visual ilustrativo.

---

## Before/After Wireframe Suggestions

**Hero — Antes:**
```
[Nav fijo translúcido, ~88px]
[Eyebrow — parcialmente tapado por el nav]
[H1] [Subheadline] [Body copy]
[CTA primario] [CTA secundario]
[Microcopy de riesgo]
```

**Hero — Después:**
```
[Nav fijo translúcido, ~88px]
—— espacio de separación real ≥ altura del nav ——
[Eyebrow, completamente visible]
[H1] [Subheadline] [Body copy]
[CTA primario] [CTA secundario]
[Microcopy de riesgo]
```

**Social Proof — sigue pendiente desde 2026-07-14:**
```
Antes:  [Párrafo de propuesta de valor reformulado, sin nombre de nadie]
Después: ["Cita real" — Nombre, Rol, Academia — resultado concreto]
         o, mientras no exista: [3-4 pasos verídicos de puesta en marcha]
```
