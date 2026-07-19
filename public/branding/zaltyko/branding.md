# Zaltyko - Brand Book v1

## Identidad

Zaltyko es un SaaS premium B2B para gestión de academias de gimnasia.
La interfaz debe sentirse precisa, ágil, confiable, humana y en movimiento.

**Tagline:** Ordena tu academia. Eleva tu gestión.

## Paleta

| Token | Hex | Uso |
| --- | --- | --- |
| Midnight Navy | `#0F172A` | Navegación, superficies oscuras, login |
| Deep Indigo | `#2B2E83` | Elementos secundarios, estados activos sobrios |
| Electric Teal | `#1FC7B6` | CTAs, links, métricas clave |
| Coral Accent | `#FF6B57` | Errores y alertas puntuales |
| Warm White | `#F8FAFC` | Fondo dominante |
| Mist Gray | `#CBD5E1` | Bordes, separadores, estados deshabilitados |

## Tipografía

- **Títulos y métricas:** Space Grotesk.
- **UI y cuerpo:** Inter.

## Logotipo

Los assets activos están en `/public/branding/zaltyko/`:

```txt
logo-zaltyko.svg              # Logotipo principal para fondos claros
logo-zaltyko-dark.svg         # Logotipo para fondos oscuros
logo-zaltyko-light.svg        # Variante clara
logo-zaltyko-monochrome.svg   # Isotipo monocromo
favicon-zaltyko.svg           # Favicon/app icon SVG
```

Las rutas antiguas `logo-red*.svg` y `favicon-red.svg` se mantienen solo como alias visuales de compatibilidad y no deben usarse en código nuevo.

## Reglas UI

- Teal solo para acciones primarias, enlaces y datos importantes.
- Coral solo para errores, alertas o estados destructivos.
- Evitar gradientes aleatorios; el gradiente oficial se limita al isotipo Z.
- Sombras sutiles: `0 2px 8px rgba(15,23,42,0.06)`.
- Radio: cards 16px, botones 12px, inputs 10px.

## Uso en Next.js

```tsx
import Image from "next/image";

<Image
  src="/branding/zaltyko/logo-zaltyko.svg"
  alt="Zaltyko"
  width={160}
  height={48}
/>
```
