# Zaltyko Style Guide

## Paleta de Colores

### Colores Principales

- **Primary**: `#B690F0` - Morado principal, usado para botones primarios y acentos
- **Primary Dark**: `#8A63C3` - Variante oscura para hover states
- **Primary Light**: `#EDEAFE` - Lavanda claro para fondos y estados activos

### Fondos

- **Background**: `#FAF9FF` - Fondo principal de la aplicación
- **Background Light**: `#FFFFFF` - Fondo de tarjetas y elementos elevados

### Textos

- **Text Main**: `#1C1C1E` - Texto principal, títulos
- **Text Secondary**: `#6D6D6D` - Texto secundario, descripciones

### Estados

- **Success**: `#4CAF79` - Verde para indicadores positivos
- **Danger**: `#E75C5A` - Rojo para errores y acciones destructivas
- **Warning**: `#F6BC50` - Amarillo para advertencias
- **Info**: `#5E8EEC` - Azul para información

### Bordes

- **Border**: `#E6E6EB` - Borde estándar para cards, inputs, etc.

## Tipografía

### Fuente

- **Familia**: Inter (sans-serif)
- **Pesos**: 400 (regular), 500 (medium), 600 (semibold)

### Escalas

- **H1**: 28–32px, semibold
- **H2**: 20–22px, medium
- **H3**: 16–18px, medium
- **Body**: 14–16px, regular
- **Small**: 12–13px, regular

## Espaciado

### Sistema de Spacing

- **XS**: 4px
- **SM**: 8px
- **MD**: 16px
- **LG**: 24px
- **XL**: 32px

### Dashboard

- Gap entre tarjetas: 24px
- Padding interno de tarjetas: 20–24px
- Padding global del contenido: 32px

## Bordes y Sombras

### Border Radius

- **Base**: 12px (cards, inputs, botones)
- **Large**: 16px (modales, paneles grandes)

### Sombras

- **Soft**: `0 1px 3px rgba(0,0,0,0.06)` - Sombras sutiles
- **Medium**: `0 4px 12px rgba(0,0,0,0.08)` - Sombras medias para elevación

## Componentes

### Cards

- Fondo blanco (`bg-bg-light`)
- Borde sutil (`border-border`)
- Radius de 12px
- Sombra suave (`shadow-soft`)
- Padding de 20px

### Botones

**Primario:**
- Fondo: `#B690F0`
- Texto: blanco
- Hover: `#8A63C3`
- Radius: 10px
- Padding: 10px 16px

**Secundario (Outline):**
- Fondo: blanco
- Borde: `#E6E6EB`
- Texto: `#1C1C1E`

### Inputs

- Fondo: blanco
- Borde: `#E6E6EB`
- Padding: 10px 14px
- Radius: 12px
- Focus: borde `#B690F0` con ring

### Sidebar

- Fondo: blanco
- Borde derecho: `#E6E6EB`
- Item activo:
  - Fondo: `#EDEAFE`
  - Texto: `#8A63C3`
  - Borde izquierdo: 3px sólido `#B690F0`

## Ejemplos de Uso

### Card Básica

```tsx
<Card className="p-5">
  <CardHeader>
    <CardTitle>Título</CardTitle>
  </CardHeader>
  <CardContent>
    Contenido
  </CardContent>
</Card>
```

### Botón Primario

```tsx
<Button>Acción</Button>
```

### Botón Secundario

```tsx
<Button variant="outline">Cancelar</Button>
```

### Input

```tsx
<Input placeholder="Escribe aquí..." />
```

