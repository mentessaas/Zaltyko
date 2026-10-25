# Matriz de cierre MVP — 25 de octubre de 2026

## Alcance

Esta matriz registra el candidato de la rama `codex/mvp-main-bridge-20261025`
y separa cuatro estados: **implementado**, **probado aisladamente**,
**comprobado en sandbox** y **publicado**. Una ruta o una prueba con mocks no
demuestra que el flujo esté desplegado o validado contra un usuario y datos
persistidos reales de sandbox.

El candidato publicado en la rama es `b270d9f212efa74979bd262305fb8b17f3667137`.
Integra PR #236 sobre PR #234 y añade el parche de compatibilidad Chromium BiDi,
una regresión del parser real y comprobaciones HTTP de roles comerciales.
Su CI [`40197832794`](https://github.com/mentessaas/Zaltyko/actions/runs/40197832794)
está en curso; no hereda el PASS del padre.

El padre integrado `8ff33d7e02322456db7bcac54a7a5b6a4bc0d983` pasó la CI completa
[`40196302196`](https://github.com/mentessaas/Zaltyko/actions/runs/40196302196):
instalación congelada, lint/tipos, unitarias, seguridad/SBOM, móvil, build,
RLS/integridad SQL y Owner sintético Chromium/Firefox/WebKit. Gates operativos
`40196302181` e integridad de fuentes SQL `40196302183` también SUCCESS.
Los jobs autenticados/readiness permanecen `if:false`; el skip no acredita
credenciales ausentes ni flujo sandbox. Público, smoke y Lighthouse omitidos
no cuentan como aprobados. No se ejecutaron pruebas ni builds en el Mac.

La procedencia desde `f626351` se conserva mediante el origen `d5b8d961`,
descendiente suyo, y una importación de sus 1.939 blobs `src` idénticos sobre
main, con cinco archivos adicionales de main. No equivale a ascendencia Git
directa ni a despliegue. Véase [procedencia e integración](mvp-integration-provenance-2026-10-25.md).
PR #234 sigue pendiente de revisión independiente y ningún despliegue nuevo
ha sido creado. La revisión inicial de QA detectó la incompatibilidad BiDi;
la revisión del parche posterior está pendiente.

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
  cola. Flujos E2E autenticados omitidos; el workflow los desactiva expresamente.
- Run `40189930100` (gates estáticos) y run `40189930073` (integridad SQL)
  terminaron correctamente para el SHA inicial; no sustituyen el flujo
  autenticado ni el replay completo de base vacía.

## Decisiones y siguiente paso

1. Obtener revisión independiente de PR #234 y CI de la nueva integración con
   PR #236. La procedencia desde `f626351` está acreditada por comparación de
   los blobs del origen recuperado y su importación; revisar ese registro junto
   a las resoluciones antes de integrar.
2. Ejecutar E2E autenticado contra **este candidato** usando solo las dos
   sesiones QA existentes y el sandbox autorizado. CI omite ese job mediante `if:false`; no se comprobó
   disponibilidad de credenciales a partir de ese skip. Hubo una restauración histórica de sesiones y
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
