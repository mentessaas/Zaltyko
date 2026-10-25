# Matriz de cierre MVP — 25 de octubre de 2026

## Alcance

Esta matriz registra el candidato de la rama `codex/mvp-main-bridge-20261025`
y separa cuatro estados: **implementado**, **probado aisladamente**,
**comprobado en sandbox** y **publicado**. Una ruta o una prueba con mocks no
demuestra que el flujo esté desplegado o validado contra un usuario y datos
persistidos reales de sandbox.

El plan indicó partir de `f626351`, pero el candidato publicado en PR #234
termina en `1637221798bee56b8aee9db176a277429103db40` y apunta a `main` desde
`f84fd6dc316e41aa7b6a599e67dc8cf2ea0dd74c`. `f626351` no es ancestro de ese
HEAD. No se hizo reset ni rebase; esta diferencia de procedencia queda abierta
para revisión antes de promoción. El PR tiene 418 archivos (+59.034/-5.476),
está abierto y GitHub exige revisión independiente.

Hay además una integración pendiente con la PR #236 de seguridad de dependencias
(también abierta y `REVIEW_REQUIRED`). GitHub devuelve 94 rutas compartidas con
la PR #234, incluidos `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y
`pnpmfile.cjs`. Ambas CI pasan por separado, pero no validan una rama combinada;
por ejemplo, actualizan `@sentry/nextjs` a versiones distintas (`10.76.2` en
#234 y `10.75.2` en #236). Resolver y volver a validar esta integración antes
de fusionar o publicar cualquiera de los dos candidatos.

La CI remota exacta del HEAD actual terminó **SUCCESS** en el run
[`40193392534`](https://github.com/mentessaas/Zaltyko/actions/runs/40193392534):
lint/tipos, unitarios, build remoto, móvil, Chromium, Firefox, WebKit, controles
RLS, integridad Drizzle, SBOM/seguridad y gate Owner sintético. No se ejecutó
ningún build ni prueba en este Mac. Los jobs de E2E autenticado, readiness de
credenciales, smoke, público y Lighthouse quedaron **SKIPPED**; no cuentan como
aprobados. La integridad de fuentes SQL exacta del HEAD pasó en
[`40193392553`](https://github.com/mentessaas/Zaltyko/actions/runs/40193392553)
y los gates operativos en [`40193392526`](https://github.com/mentessaas/Zaltyko/actions/runs/40193392526).

La reconstrucción aislada de PostgreSQL desde vacío pasó en el run
[`40190197121`](https://github.com/mentessaas/Zaltyko/actions/runs/40190197121)
para `234599c92051714b9953393221a5e1be5069cbea`. No hay cambios bajo `supabase/`
desde ese SHA hasta el HEAD actual, por lo que el SQL revisado es idéntico; la
CI de fuentes SQL del HEAD actual es una comprobación estática, no un segundo
replay. Ninguna base existente recibió SQL.

## Estado por recorrido

| Recorrido | Implementado en código | Probado aisladamente | Sandbox del candidato actual | Publicado |
| --- | --- | --- | --- | --- |
| Alta, consentimiento, confirmación, recuperación y academia | Sí, rutas Owner y bootstrap existentes. | Unitarios y Owner sintético pasan en CI; E2E autenticado **SKIPPED**. | **NO VERIFICADO** en este HEAD. | No; PR #234 requiere revisión. |
| Familias, tutores y gimnastas | Sí, APIs y contratos presentes; el candidato endurece escrituras académicas. | Unitarios y navegadores Owner sintéticos pasan; no prueban cuentas reales. | **NO VERIFICADO** en este HEAD. | No. |
| Grupos, clases, horarios e inscripciones | Sí, APIs y contratos presentes; las escrituras revisadas usan guard transaccional de plan. | Unitarios y navegadores Owner sintéticos pasan. | **NO VERIFICADO** en este HEAD. | No. |
| Asistencia y cuotas manuales | Sí, incluye emisión de cuotas y registro de pagos manuales; no inicia cobros familiares automáticos. | Unitarios, E2E Owner sintético y CI pasan. | **NO VERIFICADO** en este HEAD. | No. |
| Dashboard y experiencia móvil | Sí, proyección Owner y cliente móvil presentes. | Build remoto, job móvil y navegadores sintéticos pasan. | **NO VERIFICADO** con una academia QA autenticada en este HEAD. | No. |
| Free: solo lectura sobre límite, archivo y contratación | Sí, el candidato aplica guard transaccional a escrituras operativas y deja lectura, archivo y cambio de plan como salidas de regularización. | Unitarios y E2E Owner sintético pasan; el SQL de snapshot se replayó desde vacío en SHA anterior con SQL idéntico. | **NO VERIFICADO** con sesiones A/B en este HEAD; límites y ausencia de efectos parciales requieren prueba sandbox. | No. |
| Checkout, Portal, webhooks y ciclo SaaS | Código y configuración Stripe TEST presentes. | CI de código pasa; eventos de Stripe previos son evidencia histórica y no validan esta versión ni el ciclo terminal completo. | **NO VERIFICADO** en este HEAD. | No; Stripe Live y producción no se han configurado/verificado aquí. |
| Reconstrucción SQL desde estado vacío | Snapshot y manifiesto con hash coherente; el SQL no cambió desde el replay. | Replay desechable PostgreSQL pasa para SHA `234599c9`; validación de fuentes SQL y RLS pasa en HEAD actual. | No se aplicó SQL al sandbox original ni se leyeron filas de negocio. | No. |

## Evidencia del esquema

- Origen autorizado: `Zaltyko E2E Sandbox` (`aeeootdmuiqkfeernskw`), PostgreSQL
  17.6, región `eu-north-1`.
- Artefacto de estado actual:
  [`20261024172153_sandbox_schema_snapshot_baseline.sql`](../../supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql),
  SHA-256 `fd1bf2597b0dfd40dc6db824fa24773461f2776fa2ed7c994649be534c6a4b36`.
- Manifiesto:
  [`schema-snapshot-manifest.json`](../../supabase/schema-snapshot-manifest.json).
  El hash recalculado localmente coincide con el manifiesto. El snapshot dice
  explícitamente que **no recupera el historial de migraciones**.
- Conteos observados del snapshot: 231 tablas, 326 políticas, 502 claves
  foráneas, 38 rutinas y 78 entradas de migración listadas por la herramienta
  de metadatos. La inspección actual confirma 231 tablas y 230 con RLS habilitada;
  estos conteos no demuestran semántica correcta ni igualdad objeto por objeto.
- Extensiones instaladas observadas: `btree_gist`, `pg_stat_statements`,
  `pgcrypto`, `plpgsql`, `supabase_vault` y `uuid-ossp`.
- Replay remoto desechable: workflow `40190197121`, job
  `121159357193`, ejecución Linux efímera; **SUCCESS**. No usa credenciales de
  Supabase/Vercel/Stripe y no escribe en el sandbox de origen. El SHA actual
  conserva exactamente los mismos archivos SQL.

## CI del candidato inicial

Run `40189930084`, SHA `234599c92051714b9953393221a5e1be5069cbea`:

- **Pass observados:** integridad de migraciones Drizzle, cobertura RLS,
  móvil y SBOM/seguridad de dependencias.
- **Fallo observado:** typecheck en `src/lib/limits.ts:349`, por incompatibilidad
  entre `AcademyOperationalUsage` y `Record<string, unknown>`. Se corrigió en
  el código fuente del candidato posterior; el resultado remoto aún no existe.
- **Pendientes al corte:** unitarios, build y E2E sintético; Firefox/WebKit en
  cola. Flujos E2E autenticados omitidos por falta de credenciales.
- Run `40189930100` (gates estáticos) y run `40189930073` (integridad SQL)
  terminaron correctamente para el SHA inicial; no sustituyen el flujo
  autenticado ni el replay completo de base vacía.

## Decisiones y siguiente paso

1. Obtener revisión independiente de PR #234 y resolver explícitamente la
   diferencia de procedencia entre `f626351` y la base/HEAD reales del PR;
   reconciliar también las 94 rutas compartidas con PR #236 y volver a pasar CI
   sobre la combinación antes de integrar.
2. Ejecutar E2E autenticado contra **este candidato** usando solo las dos
   sesiones QA existentes y el sandbox autorizado. CI omitió ese job por falta
   de credenciales configuradas. Hubo una restauración histórica de sesiones y
   lecturas de uso en otra preview, pero no acreditan este HEAD; no crear cuentas
   ni cambiar contraseñas, roles, fechas o suscripciones para marcarlo como
   aprobado.
3. Probar en sandbox los límites Free y que las escrituras denegadas no dejen
   registros parciales. Mantener intactas las cuatro academias protegidas y
   los ensayos de caducidad/impago.
4. Preparar preview de entrega separada y configuración productiva aislada solo
   después de cerrar los gates anteriores; esta rama no se desplegó.
5. Mantener producción sin cambios. Ninguna consulta ni escritura productiva,
   migración de destino, promoción o cambio de dominio está aprobada por esta
   matriz.
