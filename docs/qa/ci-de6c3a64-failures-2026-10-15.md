# CI de6c3a64 — cierre y correcciones locales

## Evidencia remota

[CI 38703429157](https://github.com/mentessaas/Zaltyko/actions/runs/38703429157), candidato `de6c3a64534c8ccdd3d71050a00aa728c733a5d6`, terminó FAILURE. Static Gates `38703429248` y Directory integrity `38703429149`: SUCCESS.

- Chromium `116316872724` y WebKit `116316872867`: fallo en precarga, exit 1 e indicador fijo `rate-limit`. El runner funcional no inició. La serialización no elimina esta limitación externa.
- Firefox `116316873046`: superó precarga, inició build y agotó su límite existente de 240000 ms. Compilación 2.8 min; generó 294/294 páginas y llegó a `Collecting build traces`. Playwright no inició. El runner registró parada del stack y eliminación de volúmenes; no hay inventario independiente de recursos.
- Unit Tests `116316872810`: dos regresiones móviles no resuelven `expo/package.json` desde el cwd raíz; la paginación mensual agotó 5000 ms. La regresión shell-quote pasó: su carga de dependencias anterior quedó resuelta.
- Build, lint/typecheck, móvil dedicado, seguridad/SBOM, cobertura declarativa RLS e integridad de migraciones: SUCCESS. Jobs con Sandbox: SKIPPED. Gate sintético agregado: FAILURE, correctamente.

## Correcciones locales revisadas, no publicadas

1. Frontend `7627dc6c`: cwd explícito mobile, calculado desde import.meta.url, para ambos subprocesos de seguridad. Frontend reprodujo el fallo y verificó 2/2 desde raíz y desde mobile, typecheck/lint/formato. Main integró el cambio tras revisar diff. Main no pudo ejecutar esas dos pruebas en integración por ausencia de mobile/node_modules; no declarar PASS integrado ni excluirlas del gate.
2. Main reprodujo paginación: 6108 ms > límite de 5000. El mock interpretaba recursivamente el árbol WHERE y recorría listas IN por cada fila. Ahora compila una vez por consulta y crea sets de pertenencia. No cambia servicio, fixtures de 4001 familias/201 planes, paginación, filtros, relaciones, aserciones ni deadline. Frontend68 revisó GO la equivalencia para estas fixtures. Prueba adicional cubre comparación, booleanos vacíos/anidados, null/undefined y pertenencia.
3. Ejecución focal Main con coverage: 4/4 PASS, caso grande 2155 ms. Esta prueba sigue sin validar joins ni SQL PostgreSQL; no reemplaza las pruebas financieras ya registradas.

## Bloqueos aún abiertos

- Descargas: QA113 comparó metadata de 13/13 manifiestos linux/amd64 ECR y repositorios originales Docker Hub, con igualdad de digest/configuración/capas. No descargó capas. Eso no demuestra disponibilidad/cuota durante CI ni autoriza sustituir registros sin revisión. Falta incorporar evidencia detallada y decidir autenticación/pacing/mirror; no relanzar una corrida idéntica.
- Build Firefox: investigar coste de compilación/tracing y solución causal; no ampliar timeout, omitir tracing ni rebajar checks para obtener verde.
- Los nuevos fixes deben revisarse y validarse en un único siguiente candidato; no se ha hecho push/rerun/dispatch en este cierre.
- Esquema destino/backup recuperable, seguridad residual y aprobación independiente del PR siguen separados y pendientes. Manifiesto estático local no acredita base preparada. Sin merge, despliegue, DDL ni modificación de datos de Sandbox/producción.
