---
status: draft
owner: marketing
last_reviewed: 2026-08-04 (round 2)
board_feedback_incorporated:
  - 2026-08-04 board comment (interaction c7b2f970 prior): GDPR por ubicación del usuario, flagging UE pre-contact, DPA por tester UE — incorporado en §5.8 y §6.
  - 2026-08-04 board comment (comment 0557a88c-f347-49e5-a159-b9dc5dc586c5): GDPR se dispara por ubicación del usuario, **alcanza con UNO SOLO tester en UE/España**; país/región de cada candidato debe quedar EXPLÍCITO, no asumido. Reforzado con callout en §0 + encabezado en §5.8.
sources:
  - ../03-Negocio/ICP y segmentos.md
  - ../03-Negocio/ZAL-187 contraste ICP vs academias reales.md
  - ../00-Inicio/Estado actual de Zaltyko.md
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ../04-Marketing/Mensajes aprobados.md
  - ../06-Roadmap-y-Tareas/Decisiones.md
scope: ZAL-303 — borrador de plan de reclutamiento de beta testers (NO ejecutar hasta aprobación board)
---

# ZAL-303 — Plan de reclutamiento de beta testers (DRAFT)

> Borrador para revisión del board. **No contactar a nadie, no publicar
> nada, no cambiar pricing, no hacer ninguna oferta real.** Esto es
> preparación, no ejecución. El board decide cuándo avanzar y bajo qué
> condiciones.

## 0. Resumen ejecutivo (lectura rápida)

- **Perfil del tester**: dueño/director de academia de gimnasia artística
  o rítmica en español, con herramientas fragmentadas, tamaño Free o
  Starter. **Hipótesis basada en ICP no revalidado** (per
  [[ZAL-187 contraste ICP vs academias reales]] §1: N=2 cuentas purged,
  0/10 entrevistas, ningún claim del ICP validado ni rechazado).
- **Tamaño del cohorte**: **10-12 testers** (mínimo operativo 8, máximo
  razonable 15) para el primer cohorte cerrado.
- **Canal de contacto**: outreach warm uno-a-uno vía LinkedIn personal
  (no página de empresa) + email como secundario. Mensaje base en §3,
  NO se envía hasta aprobación board.
- **Compromiso pedido**: 4 semanas, 1 sesión kickoff + 1 sesión cierre +
  encuesta estructurada + canal de feedback directo.
- **Riesgos críticos**: PII de menores de edad (deportistas en academia
  del tester), PII del dueño, NDA, sales freeze, pricing v3 sin validar.
  Ver §5 con detalle.
- **Gates que deben estar verdes antes de activar outreach** (ver §6).

### 0.1 BLOQUEANTE — GDPR por ubicación del tester (board feedback 2026-08-04)

> **Criterio duro, no asumido:** el RGPD **se dispara por la
> ubicación del tester**, NO por la ubicación de Zaltyko. **Alcanza con
> UNO SOLO tester residente en la UE o en España** para activar
> obligaciones RGPD completas sobre Zaltyko como responsable o
> encargado del tratamiento, incluso si Zaltyko opera fuera de la UE.
>
> **Implicación operativa (visible, no opcional):**
>
> 1. **País/región de cada candidato es dato OBLIGATORIO** en la
>    shortlist. Sin país/región registrado → el candidato NO entra al
>    cohorte hasta que se documente.
> 2. **Cualquier candidato en UE/España = flag explícito**
>    `UE-tester pending P&S review` en la shortlist. Procedimiento
>    completo en §5.8 paso 1-5.
> 3. **P&S (6909a098) revisa caso por caso, firma DPA y visto bueno
>    individual ANTES de cualquier outreach.** No se aprueba por
>    cohorte; se aprueba por tester individual.
> 4. **Re-evaluación por cada candidato nuevo** que se sume después
>    del kickoff. No es evento de una vez.
> 5. **Visibilidad**: la shortlist con flags UE/non-UE vive en el
>    vault; **NO se pega a issues públicos ni a mensajes salientes**
>    ni a tooling externo antes de que P&S apruebe.
>
> Si el board no quiere asumir este coste de cumplimiento, la opción
> es **excluir candidatos UE/España de la shortlist inicial** y
> comunicarles que la beta abierta a UE/España llega en una fase
> posterior. Esa decisión también es del board.

## 1. Perfil del tester ideal

### 1.1 Estado del ICP (preliminar, marcado explícito)

Per [[ZAL-187 contraste ICP vs academias reales]] §1 y
[[ICP y segmentos#Estado de validación]] (last_reviewed 2026-08-02), el ICP
y los segmentos son **hipótesis sin revalidar**:

- N=2 cuentas reales supervivientes (purged QA/equipo 2026-07-07),
  ninguna es cliente externo caracterizable.
- 0 eventos en `growth_events`, 0 leads, 0 trials, 0 suscripciones
  Stripe-backed, 0/10 entrevistas.
- El contraste **no rechaza ni valida** ningún claim del ICP.

**Implicación operativa para este borrador**: el perfil del tester se
construye sobre el ICP hipótesis (no revalidado), no sobre caracterización
de academias reales. **Esto es preliminar y debe declararse así en
cualquier outreach que el board apruebe.** No se afirma que el tester
"representa al ICP"; se afirma que el tester "cabe en la hipótesis del ICP
y permite validar o refutar uno o más claims". Si board prefiere esperar
a tener N≥10 entrevistas (per la condición de cierre de ZAL-187), este
perfil queda en pausa.

### 1.2 Definición operativa del tester (basada en hipótesis + dirección activa)

Aplicando los filtros del ICP hipótesis + las restricciones de
[[Mensajes aprobados]] + [[Guia de trabajo para agentes#Direccion activa]]:

| Criterio | Detalle | Por qué |
| --- | --- | --- |
| Rol | Dueño o director de academia (NO entrenador, NO atleta, NO padre/tutor) | Coherente con ICP hipótesis; per [[Guia entrevistas academias gimnasia]] L84 el padre/tutor es usuario/influyente, no comprador. |
| Modalidad | Gimnasia artística o rítmica | Per [[Mensajes aprobados#Enfoque comercial inicial]] y `AVAILABLE_MODALITIES` en `src/lib/seo/clusters.ts:32-37` (acrobatic/trampoline no disponibles). |
| Geografía | España (3-4) + LATAM (5-6), priorizando mercados ya visibles en `country/modality` | Coherente con enfoque comercial inicial; cobertura geográfica diversa mejora señal. |
| Tamaño | Academia Free (≤30 gimnastas) o Starter (≤75 gimnastas) | Excluye Growth (200) y Network (multi-sede sales-assisted). Razón: Network requiere acompañamiento dedicado que no es compatible con beta cerrada; Growth es tamaño donde el feedback de "operación diaria" empieza a diluirse. |
| Herramientas previas | Declara usar al menos 2 de: WhatsApp, Excel, papel, software genérico | Permite medir migración real; necesario para validar el claim "fragmentación" del ICP. |
| Idioma | Español (nativo o fluido operativo) | Coherente con go-to-market inicial. |
| Consentimiento | Acepta términos del beta + grabación de sesiones + datos sintéticos por defecto | Necesario para evitar PII de menores desde el primer día. |
| Compromiso | Puede dedicar ~6-8 horas totales en 4 semanas (kickoff 1h + uso + cierre 1h + encuesta 1h + bug reports) | Compromiso realista para dueño de academia operativa. |

### 1.3 Lo que el tester NO debe ser

- NO tester con datos de menores reales cargados al sistema (ver §5).
- NO tester que solo quiere descuento en pricing v3 (esto es captura de
  feedback, no lead comercial).
- NO tester que represente un segmento "no ICP" (gimnasio generalista,
  integraciones enterprise, facturación no soportada).
- NO tester anónimo o sin trazabilidad de consentimiento (RGPD/LGPD).
- NO tester competidor directo de SaaS deportivo con producto en
  producción competitiva (riesgo de leakage de features en desarrollo).

### 1.4 Distribución objetivo del cohorte (referencia)

| Eje | Distribución objetivo | Justificación |
| --- | --- | --- |
| Emprendedor deportivo | 3-4 testers | Hipótesis ICP segmento 1; cubre "Free o Starter temprana". |
| Academia establecida | 3-4 testers | Hipótesis ICP segmento 2; cubre "Starter madura con fricción operativa". |
| Cadena pequeña | 1-2 testers | Hipótesis ICP segmento 3; bajo peso porque Network no es beta cerrada; si la cadena es >2 sedes, sale del scope. |
| España | 3-4 testers | Cobertura mercado principal con operación ya caracterizada. |
| LATAM | 5-6 testers | Mercado prioritario de expansión; mayor diversidad = más señal. |
| Artística | 5-6 testers | Modalidad primaria. |
| Rítmica | 4-5 testers | Modalidad secundaria; representación suficiente. |

**Nota**: estos números son referencia para que el board calibre. Si el
board prefiere otra distribución, este documento se ajusta antes de
cualquier outreach.

## 2. Tamaño del cohorte

### 2.1 Número concreto y justificación

**Recomendación: 10-12 testers como tamaño objetivo del primer cohorte
cerrado, con mínimo operativo de 8 y máximo razonable de 15.**

Justificación (cinco ejes, no "algunos"):

1. **Cobertura por segmento ICP**: 3 segmentos priorizados × 2 testers
   mínimo = 6; +2-3 redundancia por eje = 8-9 mínimo.
2. **Cobertura geográfica**: al menos 1 LATAM para validar el caso
   multi-país; 2-3 España por ser mercado con más operación visible
   (per `country/modality` rutas). Esto fuerza mínimo 4-5 entre los dos.
3. **Cobertura de modalidad**: 5-6 artística + 4-5 rítmica = 9-11 mínimo
   para evitar sesgo modal.
4. **Capacidad operativa**: durante el beta, QA E2E de Stripe Connect
   (ZAL-13/27/42) sigue activo. El equipo no puede absorber más de 12-15
   testers sin descuidar el cierre de cobros. Por encima de 15, el SLA
   de respuesta a bugs se degrada.
5. **Estadística**: con N=10-12 no se pretende significancia estadística.
   Sirve para detectar **patrones gruesos** de fricción UX, validar el
   flujo de cobro post-E2E, y triangular hipótesis del ICP. Para
   significancia se necesita N≥30 (condición de cierre de ZAL-187).

**Por qué NO menos de 8**: por debajo de 8, la cobertura de los 3 ejes
(segmento × geografía × modalidad) deja ángulos muertos y el feedback se
vuelve mono-dimensional.

**Por qué NO más de 15**: por encima de 15, el coste de gestión semanal
del beta + el QA E2E abierto saturan al equipo. El board puede subir el
techo si el cierre de ZAL-13/27/42 ocurre durante el beta.

### 2.2 Criterio de salida del beta

El cohorte se considera cerrado cuando:

- Han pasado 4 semanas desde el kickoff del último tester incorporado.
- Se ha realizado la sesión de cierre con cada tester.
- Se han procesado las encuestas estructuradas.
- Se ha hecho un debrief interno con Engineering Lead + Product Lead.

## 3. Canal de contacto y mensaje base

### 3.1 Canal

**Outreach warm uno-a-uno vía LinkedIn personal del fundador/head of
growth**, con email como canal secundario cuando el tester lo prefiera.

Por qué LinkedIn y no otros:

| Canal | Recomendación | Razón |
| --- | --- | --- |
| LinkedIn personal (1-a-1) | **Primario** | Permite mensaje personalizado, identifica al dueño/director por nombre, no rompe el principio de "comunicación interna primero" (no es Zaltyko el canal), y permite verificar identidad profesional. |
| LinkedIn página empresa | **Evitar** | Outreach masivo rompe el principio de "warm 1-a-1" y no permite personalizar. |
| Email | **Secundario** | Solo si el tester prefiere email o si LinkedIn no es operativo en su país. |
| Instagram / TikTok / WhatsApp | **Evitar** | [[Mensajes aprobados#Mensajes de gimnasia en validacion]] + "WhatsApp oculto como canal secundario" per [[Guia de trabajo para agentes#Direccion activa]]. Además, outreach frío por redes sociales a dueños de academias cae bajo "captura masiva" no autorizada. |
| Metabuscador / scraping | **Evitar** | Sin base de datos consentida, esto viola RGPD/LGPD desde el origen. |
| Referral del board / de contactos existentes | **Aceptable** | Si el board tiene una lista corta de 3-5 dueños/directores contactables personalmente, es el camino más cálido. |

### 3.2 Mensaje base (NO enviar hasta aprobación board)

Estructura del mensaje en LinkedIn / email. **Esto es un borrador, no se
envía a nadie hasta que board apruebe el outreach.** Cada outreach debe
personalizarse con nombre, academia, modalidad y motivo concreto del
contacto.

```
Asunto (si email): Zaltyko — beta cerrada con dueños de academias
de gimnasia (10 plazas, sin venta)
```

```
Hola [nombre],

Soy [remitente], de Zaltyko. Encontré [academia / perfil / referencia
concreta] y me pareció que tu caso encaja con algo que estamos
preparando.

Estamos abriendo una beta cerrada de 10 plazas con dueños y directores
de academias de gimnasia artística y rítmica en español. No es una
demo comercial ni una venta: es una prueba de 4 semanas donde tú
pruebas Zaltyko con datos sintéticos (no vamos a tocar los datos
reales de tus atletas) y nos das feedback estructurado.

Qué te pediríamos:
- 1 sesión inicial de 60 min para configurar tu academia de prueba.
- 4 semanas usando el producto en paralelo a tu operación normal.
- 1 sesión de cierre de 60 min y una encuesta corta.
- Reportar bugs críticos en menos de 24h por el canal que acordemos.

Qué ofrecemos a cambio (sujeto a aprobación final del board):
- Acceso completo a las funciones core durante el beta.
- Comunicación directa con el equipo de producto durante las 4 semanas.
- [Beneficio concreto al cierre, p.ej. gift card / meses gratis /
  descuento, que el board debe definir antes del outreach].

Lo que NO es:
- No es una venta ni un descuento de pricing v3.
- No vamos a pedirte datos de tus atletas (todo sintético en el beta).
- Puedes parar cuando quieras, sin penalización.

¿Te encaja? Si sí, te paso los detalles del proceso y el formulario de
consentimiento. Si no encaja ahora, sin problema — gracias por leer.

[remitente]
[Rol, Zaltyko]
```

### 3.3 Por qué este tono

- **No promete pricing ni descuento**: pricing v3 sigue sin validar.
- **Declara explícitamente datos sintéticos**: desactiva el riesgo PII
  de menores desde el primer mensaje.
- **Pide consentimiento informado desde el outreach**: coherente con
  cadena GTM-DEP (ZAL-139/ZAL-158) que está en implementación.
- **Salida explícita sin penalización**: coherente con el principio
  "primero el usuario, no el cierre comercial".
- **Marca el outreach como no-comercial**: ayuda a distinguir del
  sales freeze y del outreach de venta.

## 4. Compromiso pedido al tester

### 4.1 Lo que Zaltyko pide

| Compromiso del tester | Detalle | Tiempo estimado |
| --- | --- | --- |
| Sesión kickoff | Videollamada 60 min: configurar academia de prueba, entender alcance, firmar consentimiento y NDA si P&S lo requiere. | 60 min |
| Uso del producto durante 4 semanas | Probar las funciones core: atletas, clases, asistencia, pagos, comunicación interna. Datos sintéticos. | Variable, ~3-5 h/semana |
| Reporte de bugs críticos | Canal directo (email o Slack del equipo) con respuesta en <24h. | 5-15 min por bug |
| Sesión de cierre | Videollamada 60 min: feedback estructurado sobre fricción, propuesta de valor, pricing v3 (sin compromiso de compra). | 60 min |
| Encuesta estructurada | 1 encuesta corta (~15 min) al cierre. | 15 min |
| Grabación de sesiones (con consentimiento) | Opcional pero recomendado para research. | — |

**Tiempo total estimado por tester**: 6-8 horas en 4 semanas.

### 4.2 Lo que Zaltyko ofrece (sujeto a aprobación board)

Esto **NO se compromete hasta que board apruebe**:

- Acceso completo a funciones core durante 4 semanas.
- Comunicación directa con el equipo durante el beta.
- [Beneficio al cierre: gift card / meses gratis / descuento] — board
  debe decidir antes del outreach. **No usar como palanca de venta**.
- Carta de agradecimiento + reconocimiento como "beta founding academy"
  si el tester lo desea (sin publicar nada sin consentimiento explícito).
- SLA de respuesta a bugs: crítico <24h, no-crítico <72h.

### 4.3 Lo que Zaltyko NO ofrece

- NO acceso a datos reales de atletas del tester.
- NO promesa de pricing futuro (v3 sigue sin validar).
- NO garantía de continuidad del producto más allá del beta.
- NO testimonio publicable con nombre, academia, volumen o resultado
  (per [[Mensajes aprobados#CTAs y claims seguros a 2026-07-12]]).
- NO acceso a roadmap detallado ni a features no-shipped.

## 5. Riesgos a marcar

### 5.1 PII de atletas menores de edad (RIESGO CRÍTICO)

Zaltyko maneja datos de **atletas menores de edad** (gimnastas en
academias). Cualquier tester real implica una academia con menores en su
operación. Si el tester carga datos reales de sus atletas al producto,
Zaltyko recibe PII de menores bajo su control.

**Mitigación propuesta (defensa en profundidad)**:

1. **Datos sintéticos por defecto**: el beta se realiza con datos
   sintéticos generados por Zaltyko. El tester usa la academia de
   prueba como si fuera suya, pero los nombres de atletas son ficticios.
2. **Prohibición explícita de cargar datos reales**: el consentimiento
   del beta incluye cláusula de no-carga de datos reales de atletas.
3. **Si el tester quiere evaluar con datos reales**: requiere
   aprobación explícita de P&S + DPA + consentimiento parental +
   revisión caso por caso. Por defecto, esto **NO se ofrece** en el
   primer cohorte.
4. **Limitación de acceso a portal atletas**: durante el beta, el
   tester no tiene invitación a portal `parent`/`athlete` con datos
   reales. Si necesita evaluar ese flujo, se usa con datos sintéticos.

**Por qué esto bloquea la activación**:
[[Mensajes aprobados#CTAs y claims seguros a 2026-07-12]] limita claims
sobre privacidad y RGPD. [[ZAL-158]] (Consent gate, in_progress en cadena
GTM-DEP) está bloqueando hasta que ZAL-139 cierre y P&S firme §7.6.
**No se puede activar outreach beta sin que ZAL-158 cierre con §7.6
firmado por P&S.**

### 5.2 PII del dueño del tester

Nombre, email, teléfono, dirección de academia = PII estándar bajo
RGPD/LGPD. Implica:

- Consentimiento explícito para tratamiento de datos con fines de beta.
- Identificación del responsable del tratamiento (Zaltyko o el tester).
- Cláusula de retención y borrado al cierre del beta.
- Canal para ejercer derechos ARCO/DSAR (aunque GDPR DSAR está fuera
  de scope del proyecto GTM Instrumentación, sí aplica al tratamiento
  de datos del tester).

**Mitigación**: formulario de consentimiento al inicio del beta + DPA
básico + canal de contacto para derechos.

### 5.3 NDA y confidencialidad

El tester ve producto en desarrollo. Implica:

- NDA básico (3-5 cláusulas) que prohíbe screenshot público,
  publicación de features no-shipped, y comparación con competidores.
- Acuerdo de no-comunicación del beta en redes sociales hasta que el
  producto sea público.

### 5.4 Sales freeze (decisión 2026-07-29)

Per [[Decisiones#2026-07-29]] y memory: ventas congeladas hasta que
ZAL-13/27/42 cierre en verde (Stripe Connect E2E). El outreach beta
**NO es venta**, pero:

- Crea pipeline de leads cualificados.
- Implica contacto comercial-adyacente con dueños de academias.
- Si board decide que el freeze aplica a outreach beta, el plan se
  pausa hasta que el freeze se levante o se exceptúe explícitamente.

**Acción necesaria**: el board debe pronunciarse sobre si el outreach
beta cae bajo el freeze o es una excepción. Sin pronunciamiento, **el
outreach no se activa**.

### 5.5 Pricing v3 sin validar

[[Pricing]] v3 (Free 30 / Starter 19 € / Growth 49 € / Network 99 €)
sigue sin validar — 0/10 entrevistas per [[Estado actual de Zaltyko#Lo
que tenemos]]. Esto significa:

- No podemos prometer descuentos sobre pricing v3.
- No podemos regalar meses gratis si el board no aprueba la mecánica.
- El feedback de pricing que den los testers es **cualitativo, no
  cuantitativo**. Hay que tenerlo claro al analizar las encuestas.

**Mitigación**: separar en la encuesta las preguntas sobre pricing de
las preguntas sobre fricción/UX. Las preguntas de pricing son
exploratorias, no de cierre de venta.

### 5.6 Perfil del tester sin validar contra ICP real

Per §1.1, el ICP no está revalidado. Por tanto:

- El perfil del tester es una hipótesis operativa, no caracterización
  validada.
- El feedback de los testers puede no generalizarse al ICP real.
- El board debe entender que los resultados del beta son **señal
  direccional, no validación de mercado**.

**Mitigación**: ser explícito en el reporte final del beta sobre
"qué claim del ICP este cohorte ayudó a validar/refutar".

### 5.7 Bandwidth del equipo durante QA E2E de cobros

ZAL-13/27/42 están abiertos. Engineering Lead + QA + Web Developer están
en cadena de cierre de Stripe Connect. Activar el beta en paralelo
implica:

- 1-2 horas/semana de Engineering Lead o designado para responder
  bugs críticos.
- 1 hora/semana de Marketing o Product para coordinar sesiones.
- 1 sesión/semana de revisión interna.

Si el equipo no puede absorber esto, el cohorte debe reducirse o
pausarse.

### 5.8 Compliance GDPR/LGPD multi-país

> **BLOQUEANTE — criterio explícito (board feedback 2026-08-04,
> ref. comment 0557a88c):** el RGPD se dispara por la **ubicación del
> tester (usuario)**, NO por la ubicación de Zaltyko. **Alcanza con
> UNO SOLO tester residente en la UE o en España** para activar
> obligaciones RGPD completas. País/región de cada candidato debe
> estar **explícitamente registrado** en la shortlist antes de
> cualquier outreach. UE/España = flag visible + P&S approval
> individual pre-contact. Resumen ejecutivo en §0.1.

**Principio de extraterritorialidad del RGPD (board feedback
2026-08-04, ref. comments c7b2f970 + 0557a88c)**: el RGPD **aplica por
la ubicación del usuario (tester), no por la ubicación de Zaltyko**.
Un solo tester residente en la UE o en España activa obligaciones
RGPD completas sobre Zaltyko como responsable o encargado del
tratamiento, aunque Zaltyko opere fuera de la UE. Esto cambia el
coste de cumplimiento real: no es "si Zaltyko entra a la UE" sino
"si CUALQUIER tester está en la UE". Operativamente, si excluir UE/España
de la shortlist inicial baja el coste de cumplimiento, esa es una
decisión del board (resumida en §0.1 punto 5).

Por tester, jurisdiction + marco legal:

- Tester en España o resto UE: **RGPD + LOPDGDD** (España) o
  normativa local de transposición. DPA estricto, base legitimadora
  explícita (consentimiento o ejecución de medidas precontractuales),
  registro de actividades, derechos ARCO/DSAR operativos.
- Tester en México: **LFPDPPP**.
- Tester en Colombia: **Ley 1581/2012**.
- Tester en Argentina: **Ley 25.326**.
- Tester en Chile: **Ley 19.628**.

**Procedimiento de flagging UE pre-contact** (board feedback
2026-08-04, incorporado 2026-08-04):

1. **Pre-shortlist**: en el momento de componer la shortlist de
   candidatos, el board (no Marketing) registra país/región de cada
   candidato.
2. **Flagging**: si CUALQUIER candidato está en la UE/España, la
   shortlist se marca con etiqueta explícita "UE-tester pending P&S
   review". Esto **NO es opcional** — es bloqueante de outreach.
3. **Review P&S pre-contact**: antes de que Marketing envíe CUALQUIER
   mensaje (§3.2) a la shortlist, P&S (6909a098) revisa caso por caso:
   DPA, base legitimadora, derechos ARCO/DSAR, retención, sub-
   encargados, cláusulas contractuales tipo si aplica. P&S firma visto
   bueno por tester individual. **No outreach a tester UE sin firma P&S**.
4. **Re-evaluación por nuevo tester**: cada candidato que se sume a
   la shortlist después del kickoff pasa por el mismo flagging + review.
5. **Visibilidad pública**: la shortlist con flags UE/Non-UE vive en
   el vault (`vault/04-Marketing/ZAL-303 shortlist (DRAFT).md` cuando
   exista) y NO se pega a issues públicos ni a mensajes salientes.

El consentimiento + DPA por tester debe ser revisado por P&S antes de
activar outreach. **No activar outreach sin P&S approval por tester,
no por cohorte.**

## 6. Gates que deben estar verdes antes de activar outreach

Lista de condiciones que el board debe verificar antes de aprobar el
inicio del outreach. **Si alguno está en rojo, el outreach no arranca.**

| Gate | Owner | Estado al 2026-08-04 | Acción |
| --- | --- | --- | --- |
| Board approval explícita del plan de outreach beta | Board | Pendiente | Revisar este documento y pronunciarse. |
| Pronunciamiento sobre sales freeze y outreach beta | Board | Pendiente | Decidir si el outreach beta es excepción al freeze o no. |
| P&S approval de datos sintéticos + DPA + manejo de PII tester | Platform & Security (6909a098) | Pendiente | Revisar §5.1, §5.2, §5.8. Firmar §7.6 RGPD/LGPD. |
| **Flagging UE/España en shortlist + P&S review pre-contact por tester** | Board (flagging) + P&S (review) | Pendiente | Por cada tester en la shortlist: registrar país/región, marcar "UE-tester pending P&S review" si aplica, obtener firma P&S ANTES de outreach. Procedimiento en §5.8. |
| ZAL-158 (Consent gate) cierre + instrumentación Gate 1 operativa | Board activa Web Dev + P&S | Bloqueado por ZAL-139 in_review + board activation | Necesario para que el tester firme consentimiento con copy aprobada. |
| ZAL-139 (Resend templates d0/d2/d7) cierre + board aprobación §A/§B | Board §A (privacy) + §B (sales freeze) | in_review con board | Necesario porque la cadena de emails de onboarding del tester cae bajo esta cadena. |
| ZAL-13/27/42 (Stripe Connect E2E QA) cierre en verde | Engineering Lead + QA + board | Bloqueado por cadena | Necesario porque el beta incluye flujo de cobros. |
| Definición del beneficio al cierre del beta (gift card / meses gratis / descuento) | Board | Pendiente | Sin esto, el outreach no puede comprometer nada en §4.2. |
| Selección de shortlist inicial de candidatos contactables + país/región | Board humano | Pendiente | Board identifica 3-5 contactos cálidos, registra país/región de cada uno. Marketing NO contacta por su cuenta. |
| Revisión final del mensaje base (§3.2) por board | Board | Pendiente | Personalización + tono final antes de enviar. |

## 7. Cambios de esta versión

- 2026-08-04 — Creación inicial. Borrador para revisión del board. NO
  ejecutar hasta que board apruebe y los gates de §6 estén verdes.
- 2026-08-04 — Incorporado feedback board (comment 0557a88c sobre
  extraterritorialidad RGPD): §5.8 ahora explicita que el RGPD aplica
  por ubicación del tester, no de Zaltyko, y describe el procedimiento
  de flagging UE/España pre-contact + P&S review por tester. §6 suma
  gate explícito "Flagging UE/España en shortlist + P&S review
  pre-contact por tester".
