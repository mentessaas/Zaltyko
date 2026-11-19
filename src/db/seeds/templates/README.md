# Templates de Semillas por País

Este directorio contiene las semillas de templates para cada país/federación.

## Estructura

```
templates/
├── README.md              # Este archivo
├── espana-gr.ts           # Template España - Gimnasia Rítmica
├── espana-ga.ts           # Template España - Gimnasia Artística
└── portugal-gr.ts        # Template Portugal - Gimnasia Rítmica (ejemplo)
```

Los elementos (antes `espana-gr-elements.ts` y `espana-ga-elements.ts`, que
llenaban la tabla antigua `skill_catalog`) ya no se siembran aquí: viven en la
biblioteca de elementos (ADR-0029), con sus propias semillas en
`docs/deployment/candidates/`.

## Cómo agregar un nuevo país

### 1. Copiar estructura

Copia `espana-gr.ts` → `nuevopais-gr.ts` y adapta:
- `country: "Portugal"` → `countryCode: "PT"`
- `discipline: "rhythmic"`
- Cambia age categories si la federación tiene otras
- Cambia competition levels
- Actualiza scoring config si hay diferencias

### 2. Integrar en seed.ts

```typescript
import { seedNuevoPaisGR } from "@/db/seeds/templates/nuevopais-gr";

// En main():
await seedNuevoPaisGR();
```

### 3. GA

Si también tienes GA: `espana-ga.ts` → `nuevopais-ga.ts`.

## Tablas involucradas

- `templates` — Template principal (1 por país/disciplina)
- `template_age_categories` — Categorías de edad
- `template_apparatus` — Aparatos válidos
- `template_competition_levels` — Niveles competitivos
- `template_scoring_config` — Configuración de puntuación
- `template_competition_flow` — Flujo competitivo
- `template_license_config` — Requisitos de licencia federativa
