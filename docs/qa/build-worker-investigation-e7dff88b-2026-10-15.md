# Build240s: investigación y experimento preparado, no corrección demostrada

15 octubre2026. Fuente: lecturas Backend83/84 del candidato `e7dff88b39ba4fdf19c2f35f1f918a8ff3fa02a1`, paquetes instalados Next15.5.27/Sentry10.73.0 coincidentes con lock, y observaciones QA127–130. No builds nuevos ni modificación remota durante la investigación.

## Evidencia antes de hipótesis

- Chromium mismo SHA completó la prueba remota. La celda Firefox agotó240s construyendo, antes de Playwright: el navegador aún no se había ejecutado. No atribuirle el coste a Firefox.
- Ambos usan next build, NODE_ENVproduction y mismo límite240s. Build general usa Node20; matriz sintética usa22. Esa diferencia no explica por sí sola divergencias entre celdas idénticas ni demuestra que22 sea más lento.
- El wrapper filtra VERCEL_ENV; el build usa withSentryConfig como el job Build. sourcemaps.disable ya estrue. Sentry mantiene loaders de instrumentación, coste no medido: no desactivar algo ya apagado ni fingir preview para saltar Sentry.
- El callback Webpack del proyecto desactiva por defecto el build worker según la implementación instalada de Next. Un true explícito es admitido y permite el worker; este recarga config y hereda entorno. Sentry llama al callback usuario y aplica sus reglas; no se identificó bloqueo explícito de compatibilidad, pero no hay build que la demuestre.
- Las294páginas y un span completado webpack169841ms no identifican causa completa; el diagnóstico conserva solo spans terminados. No se encontró glob explícito de tracing para todo el workspace ni llamada del wrapper a swagger scanner. Ambas librerías Swagger ya externalizadas.

## Decisión local y límites

Se descarta bajar la matriz a Node20 como arreglo: [fuente oficial Node.js](https://nodejs.org/en/about/previous-releases) consultada15oct2026 lo marca EOL y22LTS. engines permite20, pero eso no acredita soporte de seguridad. Otros jobs aún en20 son deuda separada; no se han modificado por esta auditoría.

Backend prepara únicamente un experimento LOCAL: `experimental.webpackBuildWorker: true` cuando concurran `E2E_LOCAL_SUPABASE === "true"` y un segundo marcador sintético explícito. El wrapper debe fijar el segundo solo en next build, no heredarlo del ambiente externo ni introducirlo en producción. Pruebas aisladas de matriz de entorno y contratos de wiring antes de revisión Main/QA. No VERCEL_ENVpreview, no omitir Sentry, tracing, compiladores o verificaciones, ni aumentar240s.

La propiedad debe quedar ausente fuera de ambas condiciones. La compilación servidor/edge/cliente continúa; worker no equivale a paralelizar todos los compiladores. Compatibilidad en build y ahorro temporal siguen NO VERIFICADOS. No autoriza una nueva corrida remota hasta cerrar la actual, revisar diff/protecciones y decidir un candidato distinto. No cambios de schema/datos/deploy.
