# Matriz de cierre MVP — 25 de octubre de 2026

## Alcance

Esta matriz registra el candidato de la rama `codex/mvp-main-bridge-20261025`
y separa cuatro estados: **implementado**, **probado aisladamente**,
**comprobado en sandbox** y **publicado**. Una ruta o una prueba con mocks no
demuestra que el flujo esté desplegado o validado contra un usuario y datos
persistidos reales de sandbox.

El candidato inicial revisado fue `234599c92051714b9953393221a5e1be5069cbea`
(PR #234). El typecheck remoto de ese SHA detectó una incompatibilidad de tipo
en `src/lib/limits.ts`; se corrigió en este candidato con `{ ...usage }`. La
corrección aún debe pasar CI en el SHA posterior. No se ejecutó build ni suite
localmente.

## Estado por recorrido

| Recorrido | Implementado en código | Probado aisladamente | Sandbox del candidato actual | Publicado |
| --- | --- | --- | --- | --- |
| Alta, consentimiento, confirmación, recuperación y academia | Sí, rutas Owner y contrato de bootstrap existentes. | **Pendiente de cierre CI.** El E2E autenticado de la CI del candidato inicial fue omitido por falta de credenciales de test. | **NO VERIFICADO.** Las sesiones QA A/B autorizadas no están disponibles en el runtime actual. | No. PR #234 es una rama de revisión. |
| Familias, tutores y gimnastas | Sí, APIs y contratos presentes; se endurecieron rutas de escritura académica en el candidato. | **Pendiente de cierre CI** para el SHA corregido; la CI inicial terminó durante el typecheck. | **NO VERIFICADO** para este SHA. | No. |
| Grupos, clases, horarios e inscripciones | Sí, APIs y contratos presentes; el guard de plan cubre las escrituras revisadas. | **Pendiente de cierre CI** para el SHA corregido. | **NO VERIFICADO** para este SHA. | No. |
| Asistencia y cuotas manuales | Sí. Incluye endpoints de opciones/emisión de factura mensual y registro manual de pagos; no inicia cobros a familias. | **Pendiente de cierre CI** para el SHA corregido. | **NO VERIFICADO** para este SHA. | No. |
| Dashboard y experiencia móvil | Sí, proyección Owner y cliente móvil presentes. | El job móvil de CI del SHA inicial pasó; unitarios, build y navegadores sintéticos seguían pendientes al corte. Revalidar con el SHA corregido. | **NO VERIFICADO** para este SHA. | No. |
| Free: solo lectura sobre límite, archivo y contratación | Sí. El candidato amplía el guard a las escrituras académicas; lectura, archivo y cambio de plan quedan disponibles. | Migraciones Drizzle, cobertura RLS, gates estáticos y móvil pasaron en el SHA inicial; typecheck falló y otros jobs no habían terminado. La repetición exacta del candidato corregido está pendiente. | **NO VERIFICADO**; no se desplegó este candidato. | No. |
| Checkout, Portal, webhooks y ciclo SaaS | Código y configuración de Stripe test existen. | Hay evidencias históricas de eventos de test, pero no acreditan el candidato actual ni un ciclo terminal completo. | **Histórico anterior; NO VERIFICADO en este candidato.** | No. Stripe Live no configurado ni verificado por esta matriz. |
| Reconstrucción SQL desde estado vacío | Snapshot actual del sandbox y manifiesto presentes y con hash coherente. | Replay aislado en GitHub Actions lanzado para el SHA inicial; **pendiente de resultado**. | Se consultó solo catálogo, migraciones y extensiones del proyecto `aeeootdmuiqkfeernskw`; no se aplicó SQL ni se leyeron filas de negocio. | No se aplicó sobre ninguna base existente. |

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
  `121159357193`, ejecución Linux efímera. El job aún estaba ejecutando al
  redactar esta matriz. No usa credenciales de Supabase/Vercel/Stripe y no
  escribe en el sandbox de origen.

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

1. Esperar la CI del SHA corregido y el replay aislado; corregir fallos
   concretos sin ejecutar builds ni pruebas en el Mac.
2. Recuperar acceso **solo** a las sesiones existentes A y B desde el sandbox
   para la prueba autenticada. No crear cuentas ni cambiar contraseñas, roles,
   fechas o suscripciones.
3. Revalidar el límite Free y las escrituras denegadas en la preview del
   candidato, con comprobación de ausencia de registros parciales.
4. Completar los huecos demostrados por los resultados y actualizar esta
   matriz antes de cualquier promoción.
5. Mantener producción sin cambios. La configuración y apertura pública
   requieren los gates de producción, revisión de compatibilidad y permisos
   separados descritos en el plan del MVP.
