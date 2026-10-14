# Readiness E2E: Owner y facturación mensual — corte 14-10-2026

## Corte vigente de integración

Main `b0efe43d` integra alta real de tarifa con clases/fechas, servicio por
gimnasta, snapshots de emisión y el spec multiclase `34c34d19`. Las afirmaciones
de los apartados siguientes son históricas: el alta ya alcanzó Auth, bootstrap,
operaciones, asistencia y tarifa, pero no se ha probado el recorrido completo.

Verificación independiente: 71 pruebas focales integradas PASS, tipos y lint
focal PASS; dos harness PostgreSQL desechables PASS con alta de cobertura por
servicio real, rollback atómico y emisión/alta concurrentes. Claves ganadoras
de la carrera se verifican explícitamente; no se elimina la prueba negativa
de cotización cambiada para obtener un resultado verde.

CI `38491147838` del candidato publicado `1182f0c6` terminó global SUCCESS
con setup experimental FAILURE tolerado en tres navegadores: fecha requerida
omitida en el spec. La siguiente pasada local llegó a emitir y recibió 500
`42703` por esquema local incompleto. Ambos bloqueos están corregidos en la
integración, sin que ello sea evidencia de E2E PASS. Allowlist de cuota solo
local, separada de las 16 migraciones compartidas de sandbox.

El spec ahora crea dos clases y dos inscripciones de una gimnasta por UI;
selecciona explícitamente clases, tarifa y pagador; verifica una línea de
35 euros, dos snapshots de clase, un cargo y un pago. Mantiene comprobaciones
de otro tenant/sede/roles y tamaños 375/768/1280. No se sembrará cobertura por
SQL. QA espera resultado de la suite unitaria completa antes de iniciar un
único Chromium desde este SHA. Firefox/WebKit requieren ese PASS y cleanup.
Estado: **NO DEMO-READY / NO PILOT-READY**. Sin nuevos cambios remotos.

Suite unitaria completa de Main terminada: 492 archivos PASS y uno omitido;
2.592 pruebas PASS y tres omitidas, 255,16 segundos, exit 0. No sustituye E2E.
QA autorizado para un único Chromium sobre `b0efe43d`, conservando los negativos
y sin sembrar cobertura; requiere informar resultado y cierre del stack antes
de autorizar Firefox/WebKit. La variación documental posterior no cambia código.

Resultado Chromium de ese SHA: FAIL en 12,2 segundos de test, después de alta,
dos clases/inscripciones y asistencia, antes de familia/tarifa/emisión/pago.
El locator de vincular familia resolvió dos botones para la misma gimnasta
porque hay dos inscripciones. QA confirmó stack/volúmenes cerrados, sin nueva
ejecución ni cambios de producto. Corrección autorizada del spec: verificar
dos acciones iniciales, vincular una sola familia por atleta y comprobar que
ambas inscripciones se reconcilian. Mantener negativos y conteos exactos.

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
