---
status: active
owner: marketing
last_reviewed: 2026-07-30
source:
  - ../06-Roadmap-y-Tareas/Backlog priorizado.md
  - ../06-Roadmap-y-Tareas/Changelog interno.md
  - ../06-Roadmap-y-Tareas/Decisiones.md
  - ./Mensajes aprobados.md
  - ./Buyer personas.md
  - ../../../src/lib/seo/clusters.ts
  - ../../../src/app/(site)/[locale]/[modality]/page.tsx
---

# Brief de Marketing — Alinear copy público de acrobática y trampolín

## Origen

Content cerró [ZAL-22](/ZAL/issues/ZAL-22) con el hallazgo de que la promesa pública
para gimnasia acrobática y trampolín no está alineada con el producto real:

> "Acrobática y trampolín están publicadas en SEO pero no deben prometerse como soporte
> activo. No hay huecos de cobertura por rutas faltantes; el problema es de alineación
> de promesa y tono."

El `AVAILABLE_MODALITIES` en `src/lib/seo/clusters.ts` ya marca `acrobatic: false` y
`trampoline: false`, y la página de modalidad ya pinta `Próximamente`, pero el resto
de la promesa (CTAs, hero, subtítulos, comparativas, módulos, copy de bloques SEO) no
ha sido revisado de forma sistemática. Este brief define el alcance y el criterio de
éxito para que Content aplique la corrección sin meter claim nuevo.

## Buyer y contexto

- **Persona compradora**: dueño/director de academia de gimnasia artística o rítmica.
  El breve interés en acrobática/trampolín existe (lo muestran los clústers vivos), pero
  **no es el go-to-market** de v1 — ver [[Decisiones#2026-06-22 - V1 comercial con una
  academia por cliente]] y `Mensajes aprobados.md` §"Enfoque comercial inicial".
- **Decisión de ventas**: congeladas hasta que QA E2E de cobros cierre en verde
  ([Decisiones#2026-07-29 - No se escalan ventas hasta que la QA E2E de cobros cierre
  en verde](#)). No tocar CTA de conversión durante este trabajo; sí alinear promesa.
- **Riesgo**: promesa pública inflada para modalidades no soportadas erosiona
  confianza del buyer, contradice `Mensajes aprobados.md` y activa el hallazgo de
  `Auditoría copy público 2026-06-22` ("toda promesa pública debe corresponderse con
  feature real").

## Ángulo

> "Zaltyko está especializado hoy en gimnasia artística y rítmica. Acrobática y
> trampolín están en el roadmap; te avisamos cuando podamos atenderlas bien."

Tono: transparente, sin humo, sin prometer fecha.

## Keyword y superficies a tocar

- **Modalidades**: `gimnasia-acrobatica`, `trampolin` (ES) y `acrobatic-gymnastics`,
  `trampoline` (EN), bajo `/${locale}/${modality}/...`.
- **Países**: todos los publicados (España, México, Argentina, Colombia, Chile, Perú,
  Estados Unidos, Reino Unido), en ambos locales.
- **País prioritario para revisión de copia**: ES, MX y AR (los tres con clúster
  público vivo en `Mensajes aprobados`); EN/UK quedan en revisión pasiva (sin
  campaña dirigida).

## Claim permitido

- Permitido: decir que Zaltyko **está especializado en artística y rítmica**; que
  acrobática y trampolín están en el roadmap; que el registro y la demo se centran
  hoy en las dos modalidades soportadas.
- No permitido: prometer soporte activo, "Próximamente con fecha", capturas,
  testimonios o features concretas para acrobática/trampolín.

## Mensaje guía por canal

| Canal | Mensaje seguro (es/en) |
| --- | --- |
| Hero de `/${locale}/${modality}/` no disponible | "Estamos especializados en gimnasia artística y rítmica. Te avisamos cuando podamos atender bien ${modalityLabel}." / "We're focused on artistic and rhythmic gymnastics today. We'll let you know when we can serve ${modalityLabel} well." |
| CTA principal | Mantener "Crear academia gratis" (ES) / "Create free academy" (EN) hacia `/auth/register?role=owner`. No añadir CTA demo ni contacto específico por modalidad no soportada. |
| Subtítulo y body | Sustituir claims operativos ("gestiona tu academia de acrobática con Zaltyko") por claim de roadmap. |
| Footer / "Otras modalidades" | Mantener el listado, pero las no disponibles muestran etiqueta `Próximamente` consistente con la decisión actual. |
| Clústeres SEO y comparativas | Si alguna frase menciona acrobática/trampolín como caso de uso, moverla a una sección "Próximamente" o retirarla hasta que haya evidencia. |

## Lo que NO entra en este brief

- No tocar pricing, checkout, demo, contacto.
- No lanzar campañas ni paid ads.
- No añadir testimonios, métricas ni claims nuevos.
- No tocar i18n más allá de los dos locales publicados (es/en).
- No mover rutas ni redirects; la decisión Opción A (compat 6 meses) sigue activa.

## Criterio de éxito (lo que Marketing validará al cierre)

1. **Barrido completo**: cada superficie pública que mencione acrobática o trampolín
   ha sido revisada en `es` y `en`. Sin reclamar soporte activo en ningún punto.
2. **Consistencia de etiqueta**: la etiqueta `Próximamente` / `Coming soon` aparece
   donde el usuario podría confundir la modalidad con una soportada (hero, listado
   "Otras modalidades", secciones comparativas, FAQ si existe).
3. **CTA preservado**: el CTA "Crear academia gratis" sigue llevando al registro Free,
   sin cambiar de destino ni de plan al pasar por una ruta de modalidad no soportada.
4. **Sin claim nuevo**: no se introduce promesa de fecha, métricas, testimonios ni
   comparativas que el producto real no respalde.
5. **Trazabilidad**: changelog registra la pasada con lista de archivos y líneas
   modificadas, `Mensajes aprobados.md` se cita como fuente, y el cierre del issue
   enlaza la evidencia.
6. **Sin regresión de SEO**: los `hreflang`, `canonical` y metadatos de clúster
   siguen consistentes con `Decisiones#2026-07-15 - El dominio canónico SEO es
   siempre zaltyko.com`.

## Evidencia esperada al cierre

- Diff de archivos tocados en el PR.
- Captura de `/es/gimnasia-acrobatica` y `/es/trampolin` con la promesa revisada
  (desktop 1440 + móvil 375).
- Resultado de `pnpm typecheck` y `pnpm lint`.
- Entrada nueva en `Changelog interno.md` con fecha, lista de cambios y referencia a
  este brief.
- Nota en `Mensajes aprobados.md` si se decide consolidar la regla "Próximamente" como
  claim permanente para modalidades no soportadas.

## Owner siguiente

- **Ejecuta**: Content (5d63f5f6).
- **Valida**: Marketing (04643dd6) contra el criterio de éxito anterior.
- **Aprueba**: board, antes de merge, si el cambio toca copy público más allá de
  retoques ya autorizados por `Mensajes aprobados.md`.

## Estado

Brief redactado 2026-07-30. Pendiente de creación del issue para Content.
Ejecución bloqueada por [[Decisiones#2026-07-29 - No se escalan ventas hasta que la
QA E2E de cobros cierre en verde]] solo para los aspectos que tocan campaña o
conversión; la corrección de promesa sí puede entrar en cuanto haya hueco de sprint.
