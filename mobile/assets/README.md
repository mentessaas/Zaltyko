# Assets móviles

Esta carpeta contiene los assets visuales que Expo espera encontrar al construir. Por ahora hay placeholders vacíos (los archivos binarios se generan en la **Semana 8** del plan).

## Archivos necesarios

| Archivo | Tamaño | Uso |
|---|---|---|
| `icon.png` | 1024×1024 | App Store + Google Play |
| `splash.png` | 1284×2778 | Pantalla de arranque iOS |
| `adaptive-icon.png` | 1024×1024 (FG) | Android adaptive icon foreground |
| `notification-icon.png` | 96×96 blanco | Notificaciones Android |
| `favicon.png` | 48×48 | Web fallback |

## Mientras tanto

`app.json` apunta a estos paths pero el build fallará hasta que existan. **No ejecutar `eas build` hasta Semana 8.** Para iterar localmente, basta con poner dos PNGs de prueba (un cuadrado oscuro y un splash oscuro).

## Convenciones

- Sin transparencias en `icon.png` (Apple las rechaza).
- Fondos sólidos `#0F172A` mientras la paleta esté sincronizada con `lib/theme.ts`.
- Colores Zaltyko: ver `tailwind.config.ts` raíz para la fuente canónica.