# ZALTYKO – Guía de Marca Oficial

## 1. Identidad

Zaltyko es un SaaS creado para revolucionar la gestión de academias de gimnasia.  
Representa disciplina, precisión y crecimiento constante.

**Eslogan:**  
"Gestión inteligente para academias imbatibles."

## 2. Logotipo

### Versión Principal
- **Archivo:** `logo-zaltyko.svg`
- **Descripción:** Logo con zorro estilizado geométrico mirando a la derecha + texto "Zaltyko" en azul profundo
- **Colores:** Azul profundo `#0D47A1` y dorado `#FBC02D`
- **Tipografía:** Poppins Bold

### Versiones Disponibles

1. **logo-zaltyko.svg** - Versión principal (azul profundo)
2. **logo-zaltyko-dark.svg** - Para fondos oscuros (zorro dorado, texto blanco)
3. **logo-zaltyko-light.svg** - Para fondos claros (zorro azul, texto dorado)
4. **logo-zaltyko-monochrome.svg** - Versión monocromática gris para documentos

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
| Azul profundo | `#0D47A1` | Fondo primario, textos principales | hsl(215, 85%, 34%) |
| Azul claro | `#42A5F5` | Botones, acentos, hover states | hsl(207, 90%, 61%) |
| Dorado | `#FBC02D` | Íconos, highlights, CTAs | hsl(45, 96%, 54%) |
| Dorado claro | `#FFE082` | Hover states, variantes | hsl(45, 100%, 75%) |
| Blanco | `#FFFFFF` | Fondo claro, textos sobre azul | - |
| Gris neutro | `#F5F7FA` | Fondos UI, divisores | - |
| Gris oscuro | `#1E1E1E` | Textos oscuros | - |

### Uso Recomendado

**Primario (Azul profundo):**
- Navbar y headers principales
- Botones primarios
- Links importantes
- Fondos de secciones destacadas

**Secundario (Azul claro):**
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
- **Colores:** Azul profundo + dorado

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
- **Fondo:** Azul profundo `#0D47A1`
- **Logo:** Versión dark (zorro dorado, texto blanco)
- **Texto:** Blanco o dorado claro
- **Hover:** Azul claro `#42A5F5`

### Dashboard
- **Fondo:** Gris neutro `#F5F7FA` o blanco
- **Cards:** Blanco con sombra suave
- **Botones primarios:** Azul profundo
- **Botones secundarios:** Dorado
- **Acentos:** Azul claro para estados activos

### Landing Page
- **Hero:** Contraste azul profundo + dorado
- **Gradientes:** Azul profundo → azul claro
- **CTAs:** Dorado sobre azul profundo
- **Tipografía:** Poppins para títulos, Inter para textos

### Login y Formularios
- **Fondo:** Blanco o gris neutro claro
- **Inputs:** Bordes azul claro, focus azul profundo
- **Botones:** Azul profundo con hover azul claro
- **Logo:** Versión principal (azul)

## 7. Archivos del Kit

Todos los archivos están disponibles en `/public/branding/zaltyko/`:

```
logo-zaltyko.svg              # Versión principal
logo-zaltyko-dark.svg         # Para fondos oscuros
logo-zaltyko-light.svg        # Para fondos claros
logo-zaltyko-monochrome.svg   # Versión monocromática
favicon-zaltyko.svg           # Favicon SVG
favicon-zaltyko.ico           # Favicon ICO (generar desde SVG)
branding.md                   # Esta guía
```

## 8. Uso en Código

### React/Next.js

```tsx
import Image from "next/image";

// Logo principal
<Image 
  src="/branding/zaltyko/logo-zaltyko.svg" 
  alt="Zaltyko" 
  width={160} 
  height={40} 
/>

// Logo para navbar oscuro
<Image 
  src="/branding/zaltyko/logo-zaltyko-dark.svg" 
  alt="Zaltyko" 
  width={160} 
  height={40} 
/>

// Favicon (en layout.tsx)
<link rel="icon" href="/branding/zaltyko/favicon-zaltyko.svg" />
```

### Tailwind CSS

```tsx
// Usar colores de marca
<div className="bg-zaltyko-primary text-white">
<div className="bg-zaltyko-accent text-zaltyko-primary-dark">
<div className="text-zaltyko-primary-light">

// Usar fuentes
<h1 className="font-display font-bold">Título</h1>
<p className="font-sans">Texto de cuerpo</p>
```

## 9. Tono de Marca

### Personalidad
- **Profesional:** Serio pero accesible
- **Inspirador:** Motiva a la excelencia
- **Confiable:** Transmite seguridad y estabilidad
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
- **Hover:** Cambio de color suave (azul profundo → azul claro)
- **Active:** Escala ligeramente reducida
- **Focus:** Ring azul profundo con offset

## 12. Accesibilidad

### Contraste
- **Texto sobre azul profundo:** Blanco o dorado claro (WCAG AA)
- **Texto sobre blanco:** Azul profundo o gris oscuro
- **Ratios mínimos:** 4.5:1 para texto normal, 3:1 para texto grande

### Tamaños Mínimos
- **Botones:** Mínimo 44x44px en móvil
- **Texto:** Mínimo 16px (previene zoom en iOS)
- **Touch targets:** Espaciado adecuado entre elementos

## 13. Versiones y Actualizaciones

**Versión actual:** 1.0  
**Fecha:** 2025-01  
**Última actualización:** Rebranding completo a Zaltyko

---

**Contacto:** Para preguntas sobre el uso de la marca, contacta al equipo de diseño.

