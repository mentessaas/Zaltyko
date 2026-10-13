# Readiness E2E: Owner y facturación mensual — corte 14-10-2026

## Veredicto

**No hay E2E autenticado verde. La emisión mensual está implementada localmente,
pero aún no se ha demostrado desde una sesión de navegador.** La última pasada
de Chromium llega a la página de login, pero no observa la petición a Supabase
Auth; no alcanza bootstrap de academia ni facturación. El harness y la build
local de producción sí arrancan y limpian su entorno temporal.

## Qué se ejecutó y qué quedó demostrado

- `pnpm test:e2e:local` crea un proyecto Supabase local desechable con
  configuración y directorio únicos. Copia solo la allowlist greenfield de
  `scripts/lib/e2e-domain-migrations.ts`; no aplica las 110 migraciones
  históricas.
- El runner hereda una lista reducida de variables y entrega al proceso solo
  configuración del stack local y valores ficticios `test` de Stripe. No carga
  `.env`/`.env.local`, no accede a proyectos Supabase remotos y no usa datos
  personales reales.
- La aplicación se compila con URL/clave anónima del stack efímero y se sirve
  con `next start` en un puerto local libre. La build terminó correctamente y
  Playwright inició un Chromium y ejecutó el spec.
- Al fallar el flujo, el runner detuvo Supabase con `--no-backup` y eliminó el
  directorio temporal. La auditoría append-only impide borrar por separado una
  academia bootstrap sin perder trazabilidad; el diseño descarta el volumen
  entero, que contiene únicamente fixtures sintéticos.
- La traza del test contiene los pasos de relleno de ambos campos, pero el
  navegador no observó `POST /auth/v1/token`. Al terminar, la página seguía en
  `/auth/login` con valores vacíos y el screenshot muestra la validación nativa
  del campo requerido. No se envió el bootstrap de academia.
- Los 404 de Vercel Analytics/Speed Insights son esperables al probar en
  localhost y no se ha establecido que expliquen el fallo de login. La causa
  raíz del envío/navegación sigue **NO VERIFICADA**.
- Comprobación focal posterior: 7 archivos y 23 tests PASS; `pnpm typecheck` y
  `pnpm lint:app` PASS. Estos gates no reemplazan el E2E.

## Alcance del spec existente

`tests/e2e-owner-local-setup.spec.ts` intenta crear una identidad Auth sintética
local, iniciar sesión desde la UI, crear una academia rítmica y su primera sede
desde `/owner/setup`, y verificar organización, rol owner y sede directamente
en el Postgres efímero. No elimina filas individualmente: al terminar se
destruye el proyecto Supabase completo. El spec no cubre todavía grupos,
inscripciones, sesiones, asistencia, facturación ni pagos.

El job de CI añadido para este harness sigue siendo experimental y
`continue-on-error: true`; no se ha ejecutado en CI y no es un gate de release.
No se autorizó crear una rama Supabase con coste, así que no se ha tocado el
Sandbox remoto.

## Siguiente secuencia de QA

1. Aislar la causa del login en la misma build local: comprobar estado de
   hidratación, envío nativo versus handler React, solicitud de Auth y
   navegación. Corregir solo cuando haya evidencia; no relajar el test para
   simular autenticación.
2. Ejecutar una pasada Chromium del spec de alta y confirmar bootstrap,
   persistencia y destrucción completa del volumen sintético.
3. Ampliar el recorrido para crear fixtures operativos sintéticos y cubrir
   cotización mensual por gimnasta/tarifa, pagador/vencimiento, emisión manual,
   reintento idempotente, cotización obsoleta y pago manual.
4. Verificar tenant/sede y denegación por rol en navegador/BD; después ejecutar
   el job aislado de CI. Solo entonces evaluar sandbox remoto con autorización
   específica.

No declarar terminado el recorrido de Owner ni listo para captar mientras el
login autenticado y el flujo mensual end-to-end no estén demostrados. Esto no
autoriza migraciones remotas, Stripe Live, credenciales, despliegue ni cambios
en Producción.
