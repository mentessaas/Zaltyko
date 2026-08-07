---
status: draft
owner: marketing
last_reviewed: 2026-08-02
source:
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ./Mensajes aprobados.md
  - ../06-Roadmap-y-Tareas/Decisiones.md
---

# Brief — Taxonomía y atribución GTM (DRAFT)

> **DRAFT — requiere aprobación board antes de subir a `Mensajes aprobados.md` o a copy público.**
> Owner: Marketing (04643dd6). Lead proyecto GTM-DEP. Brief de coherencia de marketing sobre la taxonomía implementada por Web Dev en ZAL-157/ZAL-159.

## 1. Lo que valida Marketing (lectura 2026-08-02)

Marketing confirma coherencia con el GTM outline (Honey) y con el discovery de buyer personas Gimnasia de la nota [[Buyer personas]]:

- La regla de precedencia **`paid > social > email > organic > direct`** refleja cómo el dueño de academia busca Zaltyko: primero campañas de búsqueda pagada, después contenido en redes sociales LATAM (Instagram/TikTok/WhatsApp/LinkedIn), email transaccional o marketing, orgánico SEO y por último tráfico directo sin huella.
- `whatsapp` se mantiene explícitamente como `social` (no `direct`), coherente con la decisión de comunicación interna priorizada en Zaltyko y con la realidad LATAM de distribución por WhatsApp; alineado también con [[Mensajes aprobados#Mensajes de gimnasia en validacion]] y con la regla "WhatsApp oculto como canal secundario".
- La taxonomía `utm_source → canal` cubre exactamente los `utm_source` esperados para los canales activos en el GTM inicial; no introduce nuevos nombres que obliguen a copy comercial.
- El snapshot inmutable de `canal_registro` en signup coincide con la postura de Fase 4: medir con evidencia first-party sin recalcular históricos (ver [[Decisiones#2026-07-13 - Fase 4 se mide con evidencia first-party y entrevistas verificables]]).

## 2. Tabla validada de marketing (idéntica a ZAL-159 § Taxonomía)

| utm_source | Uso esperado | Canal derivado |
|---|---|---|
| google_ads | campañas pagadas de Google | paid |
| meta_ads | campañas pagadas de Meta | paid |
| tiktok_ads | campañas pagadas de TikTok | paid |
| instagram | contenido o campañas sociales | social |
| tiktok | contenido o campañas sociales | social |
| facebook | contenido o campañas sociales | social |
| linkedin | contenido o campañas sociales | social |
| whatsapp | distribución social LATAM | social |
| resend_email | email transaccional/marketing | email |
| google_organic | búsqueda orgánica | organic |
| google | fuente genérica; `utm_medium` determina el canal | según precedencia |

> **Observación marketing**: el alias `google` debe usarse solo cuando la campaña no distingue `google_ads` de `google_organic`; el equipo de campañas debe preferir fuentes específicas siempre que sea posible para no degradar la atribución.

## 3. Lo que NO se publica todavía

- No se publica promesa pública de "ROI por canal" en landing hasta tener denominador real (`canal_registro` poblado y `academies.canal_registro` con `n ≥ 1` por canal). Mientras el denominador sea cero, los dashboards muestran `sin base`, coherente con [[Decisiones#2026-07-13]].
- No se introducen nuevos CTAs por canal hasta validar el funnel end-to-end con tráfico real.
- No se hacen claims sobre preferencia de canal ("Instagram convierte más") sin muestra mínima.

## 4. Pendientes de marketing para próximos heartbeats

- Cuando `canal_registro` tenga denominador (≥10 registros con UTMs válidos), preparar claim cuantitativo provisional para discovery y entrevista de pricing.
- Cuando ZAL-160 (page_view consentido) entre a QA, coordinar con QA un smoke específico de atribución first-touch vs UTM en URL directa.
- Cuando ZAL-158 (consent gate) entre a implementación, entregar el copy de consentimiento (ver brief hermano) a Web Dev para integrarlo en el banner.

## 5. Riesgos / fuera de scope

- **GDPR Data Subject Access Request**: confirmado fuera de scope por ZAL-156 (LATAM + US). Si entra scope EU, hay que revisar taxonomía y storage.
- **Multi-touch attribution**: confirmado fuera de scope MVP (first-touch only). Cualquier promoción de multi-touch requiere brief de marketing separado y board approval.
- **Server-side UTM stamping**: confirmado fuera de scope MVP. Si Vercel o Supabase cambian el enrutado de forma que se pierdan cookies de first-touch, hay que revisar.

## 6. Estado y próximos pasos

- **Estado**: draft interno, coherente con ZAL-157 y ZAL-159 tal como están al 2026-08-02.
- **Próximo paso (este lead)**: añadir comentario de coordinación en ZAL-191 con la fecha de revisión y los blockers no automatizables.
- **Próximo paso (board)**: confirmar que la tabla puede promoverse a `Mensajes aprobados.md` cuando haya denominador real; mientras tanto se mantiene como brief interno.