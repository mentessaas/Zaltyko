# Auditoría UI/UX y accesibilidad

## Evidencia y límites (Día 5 — 2026-07-21)

Capturas nuevas de esta ejecución, sin mutaciones en producción:

| Evidencia | Viewport/estado | Resultado |
|---|---|---|
| [Local público desktop](evidence/ui/11-day5-public-desktop-viewport.png) | 1440×900, `/` → `/es/gimnasia-artistica` | cluster completo, sin overflow horizontal |
| [Local público mobile](evidence/ui/10-day5-public-mobile-viewport.png) | 375×812, `/es/gimnasia-artistica` | reflow correcto, tarjetas apiladas, sin overflow |
| [Contrato raíz móvil](evidence/ui/13-day5-root-mobile-375.png) | 375 px, `/` read-only | redirección canónica estable a cluster, sin overflow |
| [Cluster 320 px](evidence/ui/14-day5-public-320px.png) | 320×812, read-only | sin overflow, título y tarjetas visibles |
| [Cluster 768 px](evidence/ui/14-day5-public-768px.png) | 768×812, read-only | sin overflow, grid reflowado |
| [Producción público mobile](evidence/ui/03-production-public-mobile.png) | 375 px, read-only | landing sana y responsive |
| [Producción público desktop](evidence/ui/04-production-public-desktop.png) | desktop, read-only | landing sana |
| Login local | 375 px | DOM y controles visibles; no se conserva captura porque el navegador autofilló credenciales locales |

Con autorización explícita se generaron estados owner, coach, super-admin, parent y athlete en producción sobre la academia E2E aislada. Owner/coach/super-admin pasaron el smoke de rol (10/10); parent/athlete llegan autenticados a `/dashboard/profile`. Axe público landing/login pasa 2/2 y axe autenticado owner pasa dashboard/athletes. Tras desplegar PR #54 (`f8c307d`), parent/athlete también pasan axe con cero violaciones. Brevo responde HTTP 200 y no se envió correo real.

## Evaluación por dimensión

- **Navegación por rol:** el modelo `global/academy/limited` es legible y el portal limitado reduce destinos, pero el menú no coincide con la seguridad API mientras exista ROLE-001.
- **Responsive:** el árbol local compilado pasa spot-check en `/` → cluster a 320, 375, 768 y 1440 px: `scrollWidth === innerWidth`, título presente y tarjetas reflowan sin clipping. El login se verificó por DOM a 375 px, con labels y controles visibles; no se conserva captura por autofill local.
- **Estados:** 30 loading, 3 error y 2 not-found para 167 páginas indican cobertura desigual. Los módulos con tablas/formularios deben demostrar vacío, loading, error y retry.
- **Formularios:** login tiene labels, autocomplete y alternativas claras. La base contiene formularios heterogéneos; no se verificó keyboard completo.
- **Copy deportivo:** la orientación gimnasia-first y términos dinámicos se respetan; no normalizar “Gimnastas” a “Atletas”.
- **WCAG 2.2 AA:** hay infraestructura axe y mejoras históricas de target/contraste, pero faltan pruebas nuevas autenticadas y manuales de foco, zoom/reflow y lectores de pantalla.

## Hallazgos

| ID | Archivo/símbolo | Problema y evidencia | Severidad | Riesgo de producción | Recomendación concreta | Responsable |
|---|---|---|---|---|---|---|
| UI-001 | `middleware.ts:256-284`; cluster localizado | El contrato actual redirige `/` al cluster localizado. En la compilación 2026-07-21 no presenta overflow en 320/375/768/1440 px; queda únicamente formalizar si `/` debe seguir siendo cluster o landing. | Baja | Un cambio futuro de contrato puede afectar SEO/funnel si no existe una prueba de canonical. | Formalizar el contrato canónico y conservar la regresión de reflow 320/375/768/1440. | Terra + Luna |
| UI-002 | 167 páginas vs 30 loading/3 error/2 not-found | Cobertura de estados asincrónicos y errores es desigual. | Media | Pantallas en blanco o sin recuperación ante red/API lenta. | Matriz por flujo core y estados compartidos accesibles con retry. | Luna |
| UI-003 | superficies autenticadas | Owner/coach/super-admin pasan role smoke 10/10; parent/athlete llegan autenticados a `/dashboard/profile`. El spot-check responsive automatizado sigue limitado por tiempos/overflow históricos. | Media | Un regresión responsive puede afectar móvil aunque las rutas core estén operativas. | Repetir capturas desktop/375 y revisar foco/zoom manual en el siguiente sprint. | Luna |
| UI-004 | navegación limitada vs API | La navegación por rol y los estados denegados core quedaron cubiertos por role smoke; no se declara cobertura exhaustiva de todos los 294 handlers. | Media | Un estado denegado no cubierto puede confundir a familias y coaches. | Mantener matriz de rutas/API y ampliar smoke en cada módulo transaccional. | Terra |
| A11Y-001 | app autenticada y dialogs | Axe público landing/login y axe autenticado owner, parent y athlete pasan sin violaciones en las rutas verificadas. No se verificaron teclado, zoom 400% ni lector de pantalla. | Media | Incumplimiento WCAG residual fuera de las rutas automatizadas. | Completar revisión manual de foco, nombres, errores, landmarks y 2.4.11/2.5.8. | Luna |
| A11Y-002 | `src/app/(site)/home/HeroSection.tsx`; `ComparisonSection.tsx` | PR #53 (`64b653c`) está desplegado; axe público landing/login pasa 2/2 sin violaciones. | Baja | El riesgo residual queda limitado a superficies no cubiertas por el spot-check. | Mantener axe público en CI y repetirlo tras cambios de copy/colores. | Luna |
| A11Y-003 | `src/components/profiles/ParentProfile.tsx`; `AthleteProfile.tsx` | PR #54 (`f8c307d`) corrigió la estructura `dt/dd`; axe en `/dashboard/profile` para parent y athlete pasa con cero violaciones tras deployment. | Baja | Riesgo residual solo en componentes de perfil no visitados. | Mantener la prueba de perfiles en la regresión por rol. | Luna |

## Fortalezas observadas

La landing productiva conserva jerarquía, CTAs claros y reflow móvil. El login mantiene branding consistente, labels accesibles, targets cómodos y opciones password/magic link/Google sin saturar la pantalla.
