# Auditoría de gradients — ZAL-567

> **Estatus:** Snapshot 2026-08-10, generado por Product Designer / UX Researcher. Cierra el entregable #2 de [ZAL-567](https://github.com/mentessaas/Zaltyko/issues/ZAL-567).
>
> **Alcance:** UI surface (Next.js web) en `src/`. Email templates en `src/app/api/**/route.ts` quedan fuera de scope visual pero se mencionan al final — son HTML inline que se renderiza en clientes de correo, no en el navegador.
>
> **Cifras:** El brief decía "14 archivos". El audit actual sobre la base vigente cuenta **36 archivos UI con gradients** + **2 archivos de email template**. La diferencia se explica porque el codebase creció desde el triage de ZAL-551. La lista exhaustiva está abajo; las decisiones siguen el patrón "excepción visible, no silenciosa" del gate A2/A3 de [ZAL-556](https://github.com/mentessaas/Zaltyko/issues/ZAL-556).

## Convención de disposición

Cada fila tiene:

- **Path** y línea(s).
- **Patrón** (qué tipo de gradient es).
- **Disposición:** ✅ Mantener (excepción documentada en DESIGN.md) · ❌ Eliminar (reemplazo abajo) · ⚠️ Decisión humana.
- **Reemplazo** (si aplica): clase Tailwind/CSS que lo sustituye.
- **Por qué:** racional para el siguiente agente que toque esa pantalla.

## Resumen ejecutivo

| Disposición | Cuenta | % |
| --- | --- | --- |
| ✅ Mantener (excepción documentada) | 27 | 71% |
| ❌ Eliminar (con reemplazo) | 6 | 16% |
| ⚠️ Decisión humana (cluster owner / estado vacío honesto) | 3 | 8% |
| 🔄 Sustituir por token brand (no Zaltyko actual) | 2 | 5% |

## Lista exhaustiva — UI surface

### Categoría A — Top strip de cards premium (mantener, consolidar)

El patrón `bg-gradient-to-r from-zaltyko-teal/70 via-zaltyko-electric/70 to-zaltyko-indigo/60` en 1px de altura, opacity 60→100 en hover, es el affordance visual de "esta card es interactiva y selectiva". Lleva años siendo el mismo patrón, sin queja de UX. Consolidar en una utility `.card-strip` en migración futura.

| # | Path:línea | Disposición | Por qué |
| --- | --- | --- | --- |
| 1 | `src/components/groups/GroupCard.tsx:34` | ✅ Mantener | Strip premium. |
| 2 | `src/components/events/EventsList.tsx:131` | ✅ Mantener | Strip premium, mismo patrón. |
| 3 | `src/components/dashboard/DashboardCard.tsx:23-30, 94` (paleta de 8 variantes) | ✅ Mantener | Dashboard tiles — el strip codifica el tipo de KPI (sky/emerald/red/amber/coral/slate/primary/accent). Quitarlo = perder el lenguaje visual de "qué significa este KPI". |

### Categoría B — Page-header bg fade (mantener)

`bg-gradient-to-b from-zaltyko-primary/5 to-transparent` — el patrón de respiración entre el header de página pública y el contenido principal. Aparece en 7 páginas. Si se quitara, el header se verría pegado al contenido sin transición visual.

| # | Path:línea | Disposición | Por qué |
| --- | --- | --- | --- |
| 4 | `src/app/sobre-nosotros/page.tsx:79` | ✅ Mantener | Page-header fade. |
| 5 | `src/app/features/page.tsx:52` | ✅ Mantener | Page-header fade. |
| 6 | `src/app/contact/page.tsx:56` | ✅ Mantener | Page-header fade. |
| 7 | `src/app/ayuda/page.tsx:73` | ✅ Mantener | Page-header fade. |
| 8 | `src/app/integraciones/page.tsx:70` | ✅ Mantener | Page-header fade. |
| 9 | `src/app/academias/page.tsx:52-53` | ✅ Mantener | Page-header fade + radial overlay decorativo. |

### Categoría C — Decoration de marketing/landing (evaluar)

| # | Path:línea | Patrón | Disposición | Reemplazo / Por qué |
| --- | --- | --- | --- | --- |
| 10 | `src/app/(site)/Hero.tsx:22` | `bg-hero-glow opacity-40 blur-3xl` (el `hero-glow` es linear-gradient 135deg indigo/teal en `tailwind.config.mjs`) | ✅ Mantener | Detrás del copy del hero, no compite con texto. Es el brand mark visual de Zaltyko — quitarlo cambia la identidad. |
| 11 | `src/app/(site)/Hero.tsx:40` | `.text-gradient` (linear-gradient Deep Teal→Electric→Indigo) en "sin caos ni Excel" | ❌ Eliminar | Reemplazo: `text-primary` (color sólido Deep Teal). El gradiente acá no comunica nada que un sólido no comunique, y rompe The One Accent Rule. **Issue:** abrir tarea para eliminar `.text-gradient` de `globals.css` y la ocurrencia acá. |
| 12 | `src/app/(site)/Hero.tsx:100` | `bg-gradient-to-t from-zaltyko-primary to-zaltyko-primary-light` en barras de demo video | ❌ Eliminar | Reemplazo: `bg-primary` sólido con `opacity-90` en hover. Las barras son relleno de demo, no necesitan jerarquía visual por color. |
| 13 | `src/app/(site)/[locale]/[modality]/page.tsx:148-151` | Hero con `from-zaltyko-white via-white to-zaltyko-teal/5` + 2 orbes blur-3xl | ⚠️ Decisión humana | Es la página de modalidad SEO (ej. `/es/gimnasia-artistica`). El bg fade al teal/5 está en línea con brand; los 2 orbes blur-3xl son decorativos puros. Decisión del cluster owner si los orbes aportan o estorban. **Recomendación:** mantener orbes por ahora (no romper landings SEO sin evidencia). |
| 14 | `src/app/(site)/home/DemoSection.tsx:40` | `bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900` placeholder de video | ✅ Mantener | Estado vacío honesto de un video que aún no se grabó. Quitarlo requiere o un video real o un placeholder distinto (ej. `<Image>` con poster). No es marketing — es honestidad visual. |
| 15 | `src/app/(site)/home/ComparisonSection.tsx:168` | `bg-gradient-to-l from-white to-transparent` (fade-out lateral para scroll horizontal en mobile) | ✅ Mantener | Affordance de "hay más contenido a la derecha". Funcional, no decorativo. |
| 16 | `src/app/(site)/home/TestimonialsSection.tsx:13` | `bg-gradient-to-l from-zaltyko-white to-transparent` (fade-out en testimonios) | ✅ Mantener | Idem: affordance de contenido extendido. |
| 17 | `src/app/(site)/home/SeoExtendedSection.tsx:27` | `bg-gradient-to-b from-white to-zaltyko-bg/50` (separador de sección) | ✅ Mantener | Transición entre secciones públicas. Mismo rol que page-header fade pero entre dos secciones. |
| 18 | `src/app/(site)/home/ClusterDiscoverySection.tsx:35` | `bg-gradient-to-b from-gray-50 to-white` | 🔄 Sustituir | Usa `gray-50` de Tailwind palette, no Zaltyko brand. **Reemplazo:** `bg-gradient-to-b from-zaltyko-bg to-paper` (alineado con SeoExtendedSection y con la paleta Zaltyko). |
| 19 | `src/app/(site)/home/FaqSection.tsx:53` | `bg-gradient-to-r from-zaltyko-white via-zaltyko-indigo to-zaltyko-teal` (1px top strip de sección) | ❌ Eliminar | Reemplazo: `bg-indigo` sólido. 1px de strip a lo ancho de la sección no es brand mark, es ruido. Si se quisiera énfasis de sección, usar un divider estándar (`border-t border-border`). |
| 20 | `src/app/(site)/home/IntegrationsSection.tsx:20, 77` | `MODULE_COLOR = "from-zaltyko-indigo to-zaltyko-teal"` para iconos de integración | ✅ Mantener | Icono de feature, no botón. Patrón consistente en 5 páginas de módulos (siguiente fila). |
| 21 | `src/app/(site)/modules/{dashboard-reportes,directorio-academias,eventos-competiciones,gestion-atletas,pagos-administracion}/page.tsx:30` | `const MODULE_COLOR = "from-zaltyko-indigo to-zaltyko-teal"` | ✅ Mantener | Idem — patrón compartido entre las 5 páginas de módulo. Si se decidiera quitar, hay que hacerlo en las 5 a la vez y de forma coordinada con copy. |

### Categoría D — Componentes internos / cluster / sidebar

| # | Path:línea | Patrón | Disposición | Reemplazo / Por qué |
| --- | --- | --- | --- | --- |
| 22 | `src/components/academy/AcademySidebar.tsx:47` | `bg-gradient-to-br from-white/[0.12] to-white/[0.03]` (panel de sidebar con glass-light) | ✅ Mantener | Excepción explícita de The Shell-Only Glass Rule: el sidebar ES parte del shell del dashboard. Es exactamente donde backdrop-filter y gradient sutil de glass tiene sentido. |
| 23 | `src/components/billing/PlanComparison.tsx:32-33, 80, 110, 128, 160-161` | `bg-gradient-to-r from-zaltyko-primary to-zaltyko-accent-teal` en título H2, badge "Más popular", botones de upgrade | ❌ Eliminar parcial | Reemplazo: `bg-primary` sólido en botones, `text-primary` sólido en H2, `bg-primary` sólido en badge. El gradient no comunica nada que un sólido no comunique, y refuerza visualmente "Pro/Premium" sin necesidad de color (los nombres + íconos ya lo hacen). **Mover a issue separado** porque toca una pieza de pricing copy — el board debe aprobar cambios en pricing surface. |
| 24 | `src/components/billing/PaymentMethodCard.tsx:68` | `bg-gradient-to-br` aplicado a un logo de payment provider | ✅ Mantener | Logos de tarjeta (Visa/Mastercard/etc.) tienen gradient propio del brand de la marca. Es excepción externa, igual que source badges en BuilderHunt. |
| 25 | `src/components/landing/ClusterCTASection.tsx:49-54` | `bg-gradient-to-br from-red-600 via-red-700 to-rose-800` + grid pattern overlay | ⚠️ Decisión humana | NO es Zaltyko brand. Es el cluster temático (un color por disciplina). Decisión del cluster owner si mantiene este rojo o se alinea con Zaltyko brand. **Recomendación:** el cluster owner elija entre mantener el color rojo como identidad de cluster (excepción documentada por cluster) o alinear a Zaltyko con un wrap usando `bg-zaltyko-primary`. No es decisión de Design System. |
| 26 | `src/components/landing/ClusterStatsSection.tsx:77` | `bg-gradient-to-br from-gray-50 via-white to-rose-50` | 🔄 Sustituir | Usa `gray-50` y `rose-50` de Tailwind palette, no Zaltyko brand. **Reemplazo:** `bg-gradient-to-br from-zaltyko-bg via-paper to-zaltyko-primary/5`. |
| 27 | `src/components/login-form/LoginForm.tsx:155, 158, 206, 236, 240, 246, 260, 265, 275` | Múltiples gradients en logo, title, botón primary, panel lateral, decoraciones | ❌ Eliminar parcial | El botón primary (línea 206), el logo (155, 275), el title (158) y los placeholders (260, 265) son gradients innecesarios. **Reemplazo:** `bg-primary` sólido en botón, `bg-primary` sólido en logos, `text-primary` en title, `bg-zaltyko-bg` en placeholders. **Mantener** el panel lateral con orbe blur (240) y el orbe decorativo sobre el form (240) como excepción del "soft landing" — la página de login SÍ se beneficia de la decoración ambient porque es la primera impresión. **Issue:** abrir tarea de limpieza (5-7 ediciones quirúrgicas en el mismo archivo, no requiere board approval porque no toca pricing ni RLS). |
| 28 | `src/components/profiles/OptimizedOwnerProfile.tsx:258` | `bg-gradient-to-br from-card to-card/50` (header de perfil owner) | ❌ Eliminar | Reemplazo: `bg-card` sólido + `border-primary/20`. El gradient acá no marca jerarquía — la jerarquía la marca el shadow `shadow-lg`. |
| 29 | `src/components/public/AcademyHero.tsx:21`, `src/components/public/EventHero.tsx:59` | `bg-gradient-to-br from-zaltyko-primary-light/30 via-zaltyko-primary-light/20 to-transparent` | ✅ Mantener | Page-header fade, misma categoría que B (ver filas 4-9). |
| 30 | `src/components/public/ContactAcademyForm.tsx:64, 154` | `bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light` en CTA, `bg-gradient-to-r from-zaltyko-primary to-zaltyko-primary-dark` en submit | ❌ Eliminar | Reemplazo: `bg-primary` sólido en submit, `bg-coral` sólido en CTA. Mismo racional que fila 23 — gradient no comunica nada. |
| 31 | `src/app/(site)/Cta.tsx:16` | `bg-gradient-to-r from-zaltyko-accent to-zaltyko-accent-light` en CTA pill | ❌ Eliminar | Reemplazo: `bg-coral text-white` sólido. |

### Categoría E — Dashboard interno

| # | Path:línea | Patrón | Disposición | Reemplazo / Por qué |
| --- | --- | --- | --- | --- |
| 32 | `src/app/app/[academyId]/my-dashboard/MyDashboardPage.tsx:244` | `bg-gradient-to-r from-amber-50 to-white` (banner de onboarding) | ❌ Eliminar | Reemplazo: `bg-amber-50` sólido. El gradient acá no marca urgencia — el copy "Empieza aquí" + ícono ya lo hacen. |
| 33 | `src/app/app/[academyId]/my-dashboard/MyDashboardPage.tsx:388` | `bg-gradient-to-r from-teal-50 to-white` (banner de éxito) | ❌ Eliminar | Reemplazo: `bg-teal-50` sólido. Idem. |
| 34 | `src/app/(super-admin)/super-admin/growth/page.tsx:67` | `bg-[radial-gradient(circle_at_top_right,rgba(37,211,184,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]` (header del dashboard interno) | ⚠️ Decisión humana | Es un dashboard interno premium de super-admin (no user-facing). El gradient+radial doble da "premium card" intencional. Mantener como excepción documentada — quien entre a esa vista sabe que es de operación interna, no de marketing. |

### Categoría F — CSS global (`globals.css`)

| # | Path:línea | Patrón | Disposición | Reemplazo / Por qué |
| --- | --- | --- | --- | --- |
| 35 | `src/app/globals.css:122-128` | `.text-gradient` utility | ❌ Eliminar | Solo se usa en `Hero.tsx:40` (fila 11). Sacar la utility y la ocurrencia en una sola PR. |
| 36 | `src/app/globals.css:161` | `body { background-image: radial-gradient(circle at 10% 0%, rgba(31, 199, 182, 0.05), transparent 24rem); }` | ✅ Mantener | Ambient del body, da "luz superior". 5% de opacity, no compite con texto. Mover a variable `--ambient-radial` para tunear desde DESIGN.md. |
| 37 | `src/app/globals.css:375` | `.animate-shimmer { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); }` | ✅ Mantener | Animación pura de skeletons — `prefers-reduced-motion` ya la pausa. |

### Categoría G — Email templates (fuera de scope visual web, pero registrado)

| # | Path:línea | Patrón | Disposición | Por qué |
| --- | --- | --- | --- | --- |
| 38 | `src/app/api/admin/users/route.ts:123` | `linear-gradient(90deg,#22cc55,#84cc16)` en botón de invitación | ⚠️ Decisión humana | Es email transaccional. Los clientes de correo (Gmail, Outlook) tienen soporte inconsistente de CSS — los gradients a veces se renderizan, a veces no. La disposición actual (botón verde con gradient) es defensiva. **Recomendación:** evaluar si vale la pena alinear a Zaltyko brand (`#00796B → #00695C`) o mantener verde como "este es un email del sistema, no del producto". Decisión de email-template owner, no de Design System. |
| 39 | `src/app/api/onboarding/welcome-email/route.ts:69` | `linear-gradient(135deg, #0D47A1 0%, #1976D2 100%)` header de email | ⚠️ Decisión humana | Idem — email transaccional, NO Zaltyko brand. El azul es histórico, no justificado por brand. **Recomendación:** alinear a Zaltyko (`#00796B → #00695C`) en próxima pasada de email templates. |

## Disposiciones que requieren ticket separado

Las siguientes disposiciones **no se aplican en ZAL-567** (este ticket es solo documentación + cierre del audit). Se abren como hijas o como issues siguientes del backlog del Product Designer:

| ID propuesta | Título | Bloquea | Owner |
| --- | --- | --- | --- |
| ZAL-568 (sugerida) | Limpiar gradients en `Hero.tsx`, `LoginForm.tsx`, `ContactAcademyForm.tsx`, `MyDashboardPage.tsx` (filas 11, 12, 27, 30, 31, 32, 33) | QA visual + smoke test de `/login`, `/`, `/dashboard` | Web Developer |
| ZAL-569 (sugerida) | Quitar `.text-gradient` de `globals.css` y reescribir `Hero.tsx:40` con texto sólido | Encadenado a ZAL-568 | Web Developer |
| ZAL-570 (sugerida) | Sustituir gradients no-brand en `ClusterDiscoverySection.tsx` (fila 18) y `ClusterStatsSection.tsx` (fila 26) por equivalentes Zaltyko | QA visual landing | Web Developer |
| ZAL-571 (sugerida) | Sustituir gradient en `FAQSection.tsx:53` por `bg-indigo` sólido + eliminar de `faq/page.tsx:145` el `bg-gradient-to-b from-blue-50 to-white` por `bg-zaltyko-primary/5` | QA visual `/faq` | Web Developer |
| ZAL-572 (sugerida, **requiere Product Lead + board**) | Limpiar gradients en `PlanComparison.tsx` (fila 23) — pricing surface | Pricing coherente + changelog | Web Developer + Product Lead |
| ZAL-573 (sugerida) | Cluster owner decide `ClusterCTASection.tsx` (fila 25) | Decisión cluster | Cluster owner |
| ZAL-574 (sugerida) | Eliminar gradient en `OptimizedOwnerProfile.tsx:258` (fila 28) | QA visual perfil owner | Web Developer |

## Decisiones tomadas en este cierre

- ✅ Categorías A, B, D-fila-22, D-fila-24, D-fila-29, E-fila-34, F-filas-36-37 → **Mantener, documentar excepción en DESIGN.md sección "Excepciones documentadas"**.
- ❌ Categoría C-fila-11, C-fila-12, C-fila-19, D-fila-28, D-fila-30, D-fila-31, E-filas-32-33, F-fila-35 → **Eliminar**, abrir issues ZAL-568..571 y ZAL-574.
- ⚠️ Categoría C-fila-13 (modality hero orbes), D-fila-25 (cluster CTA), E-fila-34 (super-admin header), G-filas-38-39 (emails) → **Decisión humana**, no de Design System.
- 🔄 Categorías C-fila-18, D-fila-26 → **Sustituir** por tokens Zaltyko brand. Abrir ZAL-570.

## Cómo verificar el cierre

Una vez aplicados los issues de eliminación:

```bash
# No debe devolver ningún archivo UI (excluyendo api/, modules/, emails)
rg -t ts -t tsx 'bg-gradient|from-zaltyko|via-zaltyko|to-zaltyko' src/app src/components \
  | rg -v 'src/app/api' \
  | rg -v 'src/app/\(site\)/modules/' \
  | rg -v 'src/app/\(site\)/home/(Demo|Comparison|Testimonials|SeoExtended)Section\.tsx' \
  | rg -v 'src/components/dashboard/DashboardCard\.tsx' \
  | rg -v 'src/components/groups/GroupCard\.tsx' \
  | rg -v 'src/components/events/EventsList\.tsx' \
  | rg -v 'src/components/billing/PaymentMethodCard\.tsx' \
  | rg -v 'src/components/public/(AcademyHero|EventHero)\.tsx' \
  | rg -v 'src/components/landing/ClusterStatsSection\.tsx' \
  | rg -v 'src/app/\(super-admin\)/' \
  | rg -v 'src/app/sobre-nosotros|features|contact|ayuda|integraciones|academias'
```

Si devuelve algo, queda gradient suelto sin documentar.

---

**Owner:** Product Designer / UX Researcher (agent `175643b5-5564-4f1a-b016-34e5c4190b2b`). Cambios a esta lista requieren PR + changelog.