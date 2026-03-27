# Templates de Semillas por País

Este directorio contiene las semillas de templates para cada país/federación.

## Estructura

```
templates/
├── README.md              # Este archivo
├── espana-gr.ts           # Template España - Gimnasia Rítmica
├── espana-gr-elements.ts  # Skills/Elementos GR (cuerda, pelota, mazas, aro, cinta)
├── espana-ga.ts           # Template España - Gimnasia Artística
├── espana-ga-elements.ts  # Skills/Elementos GA (VT, UB, BB, FX)
└── portugal-gr.ts        # Template Portugal - Gimnasia Rítmica (ejemplo)
```

## Cómo agregar un nuevo país

### 1. Copiar estructura

Copia `espana-gr.ts` → `nuevopais-gr.ts` y adapta:
- `country: "Portugal"` → `countryCode: "PT"`
- `discipline: "rhythmic"`
- Cambia age categories si la federación tiene otras
- Cambia competition levels
- Actualiza scoring config si hay diferencias

### 2. Crear elementos (opcional pero recomendado)

Copia `espana-gr-elements.ts` → `nuevopais-gr-elements.ts` y adapta los skillCodes:
- GR usa códigos como `R-G1-SJ` (Rope-Group1-SaltitoJump)
- Añade aparato según la federación local

### 3. Integrar en seed.ts

```typescript
import { seedNuevoPaisGR } from "@/db/seeds/templates/nuevopais-gr";
import { seedNuevoPaisGRElements } from "@/db/seeds/templates/nuevopais-gr-elements";

// En main():
await seedNuevoPaisGR();
await seedNuevoPaisGRElements(TENANT_ID);
```

### 4. Elementos para GA

Si también tienes GA:
- `espana-ga.ts` → `nuevopais-ga.ts`
- `espana-ga-elements.ts` → `nuevopais-ga-elements.ts`

## Skills por Disciplina

| Disciplina | Códigos | Ejemplo |
|-----------|----------|---------|
| GR (Rítmica) | rope, ball, clubs, hoop, ribbon | R-G1-SJ |
| GA (Artística F) | vt, ub, bb, fx | VT-Y1, BB-AC1 |
| GA (Artística M) | fx, ph, sr, vt, pb, hb | — |
| Trampolín | trampoline | — |

## Tablas involucradas

- `templates` — Template principal (1 por país/disciplina)
- `template_age_categories` — Categorías de edad
- `template_apparatus` — Aparatos válidos
- `template_competition_levels` — Niveles competitivos
- `template_scoring_config` — Configuración de puntuación
- `template_competition_flow` — Flujo competitivo
- `template_license_config` — Requisitos de licencia federativa
- `skillCatalog` — Elementos/skills por disciplina
