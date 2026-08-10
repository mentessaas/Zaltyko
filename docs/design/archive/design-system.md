# 🟣 Zaltyko Design System 1.0

> **SUPERSEDED — 2026-08-10.** Este documento describe la paleta original (morado/lavanda, v0.x) y queda archivado. La fuente de verdad vigente es [`../DESIGN.md`](../DESIGN.md) (ZAL-567). Mantenido en `docs/design/archive/` por trazabilidad histórica, no para uso.

## Tokens Globales

### Colores

```css
--color-primary: #B690F0;        /* Morado principal */
--color-primary-dark: #8A63C3;   /* Morado oscuro */
--color-primary-light: #EDEAFE;   /* Lavanda claro */
--color-bg: #FAF9FF;             /* Fondo principal */
--color-bg-light: #FFFFFF;      /* Fondo claro/blanco */
--color-border: #E6E6EB;         /* Borde */
--color-text-main: #1C1C1E;      /* Texto principal */
--color-text-secondary: #6D6D6D; /* Texto secundario */
--color-success: #4CAF79;        /* Verde éxito */
--color-danger: #E75C5A;         /* Rojo peligro */
--color-warning: #F6BC50;        /* Amarillo advertencia */
--color-info: #5E8EEC;           /* Azul información */
```

### Tipografía

- **Font Family**: `Inter`, sans-serif
- **H1**: 28–32px, semibold
- **H2**: 20–22px, medium
- **H3**: 16–18px, medium
- **Body**: 14–16px
- **Small**: 12–13px

### Radius y Sombras

```css
--radius-base: 12px;
--radius-large: 16px;
--shadow-soft: 0 1px 3px rgba(0,0,0,0.06);
--shadow-medium: 0 4px 12px rgba(0,0,0,0.08);
```

### Spacing

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
```

**Dashboard específico:**
- Gap entre tarjetas: 24px
- Padding tarjeta: 20–24px
- Padding global: 32px

## Componentes Base

### Card

```tsx
<Card className="rounded-[12px] border border-border bg-bg-light shadow-soft p-5">
  {/* Contenido */}
</Card>
```

Variante secundaria:
```tsx
<Card className="bg-bg border-primary-light">
  {/* Contenido */}
</Card>
```

### Button Primario

```tsx
<Button className="bg-primary text-white rounded-[10px] px-4 py-2.5 font-medium hover:bg-primary-dark">
  Texto
</Button>
```

### Button Secundario (Outline)

```tsx
<Button variant="outline" className="bg-bg-light border-border text-text-main">
  Texto
</Button>
```

### Input

```tsx
<Input className="bg-bg-light border-border rounded-[12px] px-[14px] py-2.5" />
```

### Sidebar

- Fondo: blanco (`bg-bg-light`)
- Borde derecho suave (`border-border`)
- Iconos outline gris oscuro
- Activo:
  - `bg-primary-light`
  - `text-primary-dark`
  - `border-l-3 border-l-primary`

## Componentes del Dashboard

### SummaryCard

Muestra KPIs con gráficos y comparativas.

### BusinessStatsCard

Lista vertical de estadísticas de negocio.

### UpcomingClassesCard

Card con lista de clases próximas estilo calendario.

### RecentActivityCard

Lista de actividades recientes con iconos circulares.

## Uso en Tailwind

Los tokens están disponibles como clases de Tailwind:

- `bg-primary`, `bg-primary-dark`, `bg-primary-light`
- `bg-bg`, `bg-bg-light`
- `text-text-main`, `text-text-secondary`
- `border-border`
- `text-success`, `text-danger`, `text-warning`, `text-info`
- `rounded-base` (12px), `rounded-large` (16px)
- `shadow-soft`, `shadow-medium`

