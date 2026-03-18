# ZALTYKO – Guía de Marca Oficial (Rojo Cereza)

## 1. Identidad

Zaltyko es un SaaS creado para revolucionar la gestión de academias de gimnasia.
Representa **energía, pasión y acción**. El rojo cereza transmite vitalidad y determinación.

**Eslogan:**
"Gestión inteligente para academias imbatibles."

## 2. Logotipo

### Versión Principal
- **Archivo:** `logo-red.svg`
- **Descripción:** Logo con zorro estilizado geométrico mirando a la derecha + texto "Zaltyko" en rojo cereza
- **Colores:** Rojo cereza `#DC2626` y dorado `#F59E0B`
- **Tipografía:** Poppins Bold

### Versiones Disponibles

1. **logo-red.svg** - Versión principal (zorro rojo, texto rojo cereza)
2. **logo-red-dark.svg** - Para fondos oscuros (zorro dorado, texto blanco)
3. **logo-red-light.svg** - Para fondos claros (zorro rojo, texto dorado)
4. **logo-zaltyko.svg** - Versión legacy (azul, mantener para compatibilidad)
5. **favicon-red.svg** - Favicon SVG rojo

### Espaciado Mínimo
- Mantener al menos **1x del tamaño del logotipo** alrededor del logo
- No reducir el logo a menos de 40px de altura

### Usos No Permitidos
- ❌ No rotar el logo
- ❌ No distorsionar proporciones
- ❌ No cambiar colores (excepto versiones oficiales)
- ❌ No usar sobre fondos complejos sin suficiente contraste
- ❌ No estirar o comprimir

## 3. Paleta Cromática

| Color | Hex | Uso Principal | HSL |
|--------|------|----------------|-----|
| Rojo cereza | `#DC2626` | Fondo primario, textos principales | hsl(0, 86%, 42%) |
| Rojo brillante | `#EF4444` | Botones, acentos, hover states | hsl(0, 90%, 59%) |
| Rojo profundo | `#B91C1C` | Estados activos, énfasis | hsl(0, 84%, 37%) |
| Dorado | `#F59E0B` | Íconos, highlights, CTAs | hsl(38, 92%, 50%) |
| Dorado claro | `#FCD34D` | Hover states, variantes | hsl(45, 96%, 71%) |
| Blanco | `#FFFFFF` | Fondo claro, textos sobre rojo | - |
| Rojo ultralight | `#FEF2F2` | Fondos UI, highlight suave | hsl(0, 86%, 97%) |
| Gris oscuro | `#1F2937` | Textos oscuros | - |

### Uso Recomendado

**Primario (Rojo cereza):**
- Navbar y headers principales
- Botones primarios
- Links importantes
- Fondos de secciones destacadas

**Secundario (Rojo brillante):**
- Botones hover
- Acentos en cards
- Estados activos
- Bordes destacados

**Acento (Dorado):**
- Íconos del logo
- Botones de acción destacada
- Badges y etiquetas premium
- Highlights y llamadas a la acción

## 4. Tipografía

### Fuentes Principales

**Títulos y Display:**
- **Fuente:** Poppins
- **Pesos:** 400, 500, 600, 700, 800
- **Uso:** H1, H2, H3, H4, títulos de secciones, navbar
- **Clase Tailwind:** `font-display`

**Textos y Body:**
- **Fuente:** Inter
- **Pesos:** 400, 500, 600
- **Uso:** Párrafos, textos de cuerpo, formularios, botones
- **Clase Tailwind:** `font-sans`

### Jerarquía Tipográfica

```css
h1: Poppins 700, 3xl-4xl
h2: Poppins 700, 2xl-3xl
h3: Poppins 600, xl-2xl
h4: Poppins 600, lg-xl
p: Inter 400, base
```

## 5. Iconografía

### Ícono Principal
- **Símbolo:** Cabeza de zorro geométrica minimalista
- **Estilo:** Líneas suaves y angulosas, diseño geométrico
- **Orientación:** Mirando hacia la derecha (progreso, avance)
- **Colores:** Rojo cereza `#DC2626` + dorado `#F59E0B`

### Símbolo Alternativo
- **Letra Z estilizada** dentro de un círculo dorado
- Uso en favicons y espacios reducidos

### Características
- Esquinas redondeadas suaves
- Proporciones geométricas consistentes
- Estilo minimalista y moderno
- Escalable sin pérdida de calidad (SVG)

## 6. Aplicaciones Visuales

### Navbar
- **Fondo:** Rojo cereza `#DC2626`
- **Logo:** Versión dark (zorro dorado, texto blanco)
- **Texto:** Blanco o dorado claro
- **Hover:** Rojo brillante `#EF4444`

### Dashboard
- **Fondo:** Rojo ultralight `#FEF2F2` o blanco
- **Cards:** Blanco con sombra suave
- **Botones primarios:** Rojo cereza
- **Botones secundarios:** Dorado
- **Acentos:** Rojo brillante para estados activos

### Landing Page
- **Hero:** Contraste rojo cereza + dorado
- **Gradientes:** Rojo cereza → rojo brillante
- **CTAs:** Dorado sobre rojo cereza
- **Tipografía:** Poppins para títulos, Inter para textos

### Login y Formularios
- **Fondo:** Blanco o rojo ultralight
- **Inputs:** Bordes rojo claro, focus rojo cereza
- **Botones:** Rojo cereza con hover rojo brillante
- **Logo:** Versión principal (rojo)

## 7. Archivos del Kit

Todos los archivos están disponibles en `/public/branding/zaltyko/`:

```
logo-red.svg              # Versión principal roja
logo-red-dark.svg         # Para fondos oscuros
logo-red-light.svg        # Para fondos claros
logo-zaltyko.svg          # Versión legacy (azul)
favicon-red.svg          # Favicon SVG rojo
favicon-zaltyko.ico       # Favicon ICO legacy
branding.md              # Esta guía
```

## 8. Uso en Código

### React/Next.js

```tsx
import Image from "next/image";

// Logo principal rojo
<Image
  src="/branding/zaltyko/logo-red.svg"
  alt="Zaltyko"
  width={160}
  height={40}
/>

// Logo para navbar oscuro
<Image
  src="/branding/zaltyko/logo-red-dark.svg"
  alt="Zaltyko"
  width={160}
  height={40}
/>

// Favicon (en layout.tsx)
<link rel="icon" href="/branding/zaltyko/favicon-red.svg" />
```

### Tailwind CSS

```tsx
// Usar colores de marca
<div className="bg-zaltyko-primary text-white">
<div className="bg-zaltyko-accent-amber text-white">
<div className="text-zaltyko-primary-light">

// Usar fuentes
<h1 className="font-display font-bold">Título</h1>
<p className="font-sans">Texto de cuerpo</p>
```

## 9. Tono de Marca

### Personalidad
- **Energético:** Transmite vitalidad y acción
- **Apasionado:** Comprometido con la excelencia
- **Confiable:** Serio pero accesible
- **Moderno:** Tecnológico y actualizado

### Mensajes
- Cortos y directos
- Enfocados en resultados
- Comunican progreso y crecimiento
- Resaltan comunidad y excelencia
- Evitan jerga técnica innecesaria

### Ejemplos de Copy

✅ **Bueno:**
- "Gestiona todas tus academias desde un único panel"
- "Registra alumnos, controla pagos, organiza competencias"
- "Haz crecer tu academia sin complicaciones"

❌ **Evitar:**
- "Solución tecnológica disruptiva para el ecosistema deportivo"
- Jerga excesivamente técnica
- Mensajes demasiado largos

## 10. Espaciado y Layout

### Márgenes y Padding
- **Espaciado mínimo alrededor del logo:** 1x del tamaño del logo
- **Padding en cards:** 1rem (móvil) a 1.5rem (desktop)
- **Gap entre elementos:** 0.5rem a 2rem según contexto

### Grid y Layout
- **Grid principal:** Máximo 6 columnas en desktop
- **Breakpoints:** Mobile-first approach
- **Contenedor máximo:** 1280px con padding lateral

## 11. Animaciones y Transiciones

### Transiciones Suaves
- **Duración:** 200ms para interacciones comunes
- **Easing:** `ease-in-out` para la mayoría de elementos
- **Hover:** Escala sutil (scale-[0.98]) en botones

### Estados Interactivos
- **Hover:** Cambio de color suave (rojo cereza → rojo brillante)
- **Active:** Escala ligeramente reducida
- **Focus:** Ring rojo cereza con offset

## 12. Accesibilidad

### Contraste
- **Texto sobre rojo cereza:** Blanco o dorado claro (WCAG AA)
- **Texto sobre blanco:** Rojo cereza o gris oscuro
- **Ratios mínimos:** 4.5:1 para texto normal, 3:1 para texto grande

### Tamaños Mínimos
- **Botones:** Mínimo 44x44px en móvil
- **Texto:** Mínimo 16px (previene zoom en iOS)
- **Touch targets:** Espaciado adecuado entre elementos

## 13. Versiones y Actualizaciones

**Versión actual:** 2.0
**Fecha:** 2026-03
**Cambio:** Rebranding a estilo Rojo Cereza - energía, pasión, acción

---

**Contacto:** Para preguntas sobre el uso de la marca, contacta al equipo de diseño.