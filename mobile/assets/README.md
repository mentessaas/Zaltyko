# Assets móviles

Estos assets son los binarios de distribución de Expo y usan la marca Zaltyko real: fondo navy, símbolo Z con degradado índigo/teal y wordmark claro en el splash. Los SVG de `splash` y `adaptive-icon` se conservan como fuentes editables para que una futura exportación no vuelva a introducir placeholders.

## Archivos necesarios

| Archivo | Tamaño | Uso |
|---|---|---|
| `icon.png` | 1024×1024 | App Store + Google Play |
| `splash.png` | 1284×2778 | Pantalla de arranque iOS/Android |
| `adaptive-icon.png` | 1024×1024 (FG) | Android adaptive icon foreground transparente |
| `notification-icon.png` | 96×96 blanco | Notificaciones Android monocromas |
| `favicon.png` | 48×48 | Web fallback |

## Regeneración

Los PNG ya están listos para `expo prebuild`/EAS. Si se modifica la marca, renderizar de nuevo `adaptive-icon.svg`, `splash.svg` y el icono canónico `public/icons/icon.svg` con una herramienta SVG→PNG, respetando las dimensiones de la tabla. No sustituirlos por cuadrados de prueba.

## Convenciones

- Sin transparencias en `icon.png` (Apple las rechaza).
- Fondos sólidos `#0F172A` mientras la paleta esté sincronizada con `lib/theme.ts`.
- Colores Zaltyko: ver `tailwind.config.ts` raíz para la fuente canónica.
