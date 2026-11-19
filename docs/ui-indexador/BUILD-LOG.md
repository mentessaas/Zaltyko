# Prueba de ui-indexador en Zaltyko

**Fecha:** 2026-11-08
**Rama:** `claude/ui-indexador-20261108` (worktree `trabajos/Zaltyko-ui-indexador-20261108`)
**Base:** `d5b8d961` de la preview recuperada; el checkout original no se ha tocado.
**Herramienta:** ui-indexador `2852a1e0` en `herramientas/ui-indexador`, índice del 2026-11-08
(72.628 piezas, 323 registros). Búsqueda por palabra clave hasta tener embeddings; luego semántica
con Ollama + `nomic-embed-text`.

## Hallazgos

| Pantalla | Problema en el original | Fuente | Importancia |
|---|---|---|---|
| /pricing | CTAs partidos en dos líneas, iconos de check que encogen, tarjetas de alto distinto (`items-center`), "Incluido" como precio del plan Free | Captura 1440px | Alta: es la página de conversión |
| Footer público | 2 + 5 columnas en una rejilla de 6: "Legal" queda sola en otra fila; texto `white/40` ≈ 3,9:1 sobre navy (falla AA) | Captura + cálculo de contraste | Media |
| /auth/login | "¿Olvidaste tu contraseña?" estilizado como botón grande entre los campos y "Iniciar sesión"; tres botones apilados sin jerarquía | Captura | Media |
| Gimnastas | Fechas ISO partidas (`2015-05-\n01`), estado en texto plano, chip de grupo con el color de la academia como color de texto (contraste no garantizado), cabeceras ordenables sin mayúsculas (preflight pone `text-transform:none` en `<button>`) | Captura | Media |
| Grupos | Recuento duplicado (cuerpo y pastilla), pastilla y "Ver grupo" partidos en dos líneas | Captura | Baja |
| FAQ home | Acordeón con estado propio que **quita** las respuestas cerradas del HTML; botones sin `aria-controls` | Lectura de código | Media (SEO + a11y) |
| Panel | Título del esqueleto "Acciones Rápidas" ≠ "Acciones rápidas" cargado; sin `aria-busy` | Lectura de código | Baja |

## Búsquedas y elecciones

| Sección | Consulta(s) en ui-indexador | Candidatos principales | Elegido | Por qué |
|---|---|---|---|---|
| Precios | `pricing monthly yearly` (kind=pricing, type=block, osi_only) | @8bitcn/pricing2, @velora/pricing-three-tiers, @balick/pricing-01, @devl/pricing-table, @hirael/pricing-01, @uiception/pricing-section-v2 | **@uiception/pricing-section-v2** (MIT) | Único de 4 niveles como Free/Starter/Growth/Network; toggle con radios nativos en `fieldset`; CTA anclado abajo; sin dependencias nuevas |
| Footer | `footer columns` (kind=footer, type=block) | @payload-components/footer-columns, @devl/mega-footer, @hirael/footer-01, @uiception/footer-section-v2 | **@uiception/footer-section-v2** (MIT) | Rejilla 2→3→5 exacta para las 5 secciones; solo estructura, se mantiene la marca oscura |
| Login | `login` (kind=auth, type=block) | @blocks-so/login-01…09 | **@blocks-so/login-06** (MIT, 1,9k★) | Mismo flujo (contraseña + enlace mágico + SSO); enlace secundario y separador "o" |
| FAQ | `accordion` (kind=faq) | @velora/faq-accordion, @hirael/accordion (Radix), @mischief/accordion | **@mischief/accordion** (MIT) | `<details>` nativo: sin dependencias, sin JS para abrir/cerrar, contenido indexable; Radix habría añadido `@radix-ui/react-accordion` |
| Estado de gimnasta | `status badge` | @spaceui/status-badge, @astryx/badge-status (StyleX) | Patrón **@spaceui** (punto + texto) | Sin dependencias; @astryx exige StyleX |
| Métricas de grupo | `stats trend` (kind=stats) | @blocks-so/stats-01, @hirael/stats-02 | Patrón **@blocks-so/stats-01** (rejilla `gap-px`) | Ligero, encaja en tarjeta |

Componentes adaptados a mano (no `shadcn add`) para no sobrescribir los primitivos propios
(`button`, `card`, `input` llevan tokens de marca) ni tocar Tailwind 3 / React 18.
El único archivo nuevo es `src/components/ui/disclosure-accordion.tsx`, con su origen en la cabecera.

## Lo que la prueba enseñó de ui-indexador

- **Sin Ollama la búsqueda es pobre.** En modo palabra clave, `@astryx` (StyleX, 16k★) domina casi
  todas las consultas y hay que filtrar por `kind`/`type` para encontrar algo usable.
- **El ranking por estrellas no garantiza encaje:** el bloque elegido de precios viene de un registro con 3★.
- **Falta un filtro de stack:** nada distingue Tailwind 3 / React 18 de Tailwind 4 / React 19; hubo que leer cada fuente.
- **`npx shadcn view` se cuelga a veces** con algunos registros; leer la URL del directorio
  (`ui.shadcn.com/r/registries.json`) fue más fiable.
- **Con embeddings (47.294 vectores, Ollama local)** desaparece el ruido de @astryx y las consultas en
  lenguaje natural devuelven bloques usables. Aun así, "four tier pricing…" devuelve primero bloques de tres
  niveles (@uiception/pricing-section-v2 no sale en el top 6), y @mischief/accordion aparece 6.º para
  "native details". El orden semántico no sustituye leer los candidatos.
- Útil como **catálogo de patrones** para arreglar problemas concretos; no sustituye al sistema de diseño propio.

## Verificación

- `tsc --noEmit`: 0 errores. `eslint --quiet` sobre los 8 archivos tocados: 0 avisos.
- Capturas 1440px y 390px, original (:3100) frente a copia (:3101), con la misma base Postgres local
  desechable y datos ficticios: `comparacion-ui-indexador-20261108/comparacion.html`.
- No ejecutado: vitest, Playwright e2e, axe. Cobros, eventos y mensajes no se pudieron capturar en
  local (redirige al login / el servidor de desarrollo agotó el tiempo).

## Siguiente paso

Comparar capturas original/copia (`comparacion-ui-indexador-20261108/`) y decidir qué cambios llevar
a la rama real. Nada se ha commiteado, desplegado ni llevado a producción.
