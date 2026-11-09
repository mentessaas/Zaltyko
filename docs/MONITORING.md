# Monitorización propia de producción

Zaltyko incorpora una alerta operativa independiente de Vercel Pro mediante el workflow de GitHub Actions `Production monitoring`.

## Qué comprueba

- Ejecuta cada 15 minutos (y manualmente con `workflow_dispatch`) una petición `GET` a `https://zaltyko.com/api/health`.
- Verifica que HTTP sea `200`, que el estado sea `ok` y que la latencia total no supere 2.500 ms.
- El endpoint ejecuta una consulta `select 1` contra PostgreSQL, sin devolver credenciales, filas ni detalles internos.
- La consulta tiene un tope de 2 s: si PostgreSQL no responde a tiempo, el endpoint devuelve `503` con `checks.database.status = "timeout"`. Ambas respuestas llevan `Cache-Control: no-store`.

Este workflow es una red de seguridad. El monitor externo recomendado (cada minuto, con avisos al móvil), los umbrales de alerta y la plantilla de política de soporte están en `docs/ops/monitorizacion-y-soporte.md`. Para separar caída de la app y de la base de datos existe además `GET /api/health/live`, que no consulta PostgreSQL.

## Cómo alerta

Cuando falla, GitHub Actions crea un issue abierto titulado `[monitoring] Production health degraded` y añade comentarios en ejecuciones posteriores. Cuando el servicio se recupera, añade un comentario y cierra el incidente.

El token `GITHUB_TOKEN` solo tiene permisos `contents: read` e `issues: write`. No se envían correos, no se realizan escrituras de negocio y no se incluyen secretos en los issues.

## Limitaciones

- GitHub puede retrasar los workflows programados; no constituye un SLA.
- Esta primera versión mide disponibilidad y latencia de base de datos, no sustituye alertas de logs de Vercel, Stripe, Brevo o Supabase.
- El umbral está versionado en `.github/workflows/monitoring.yml` (`MAX_LATENCY_MS=2500`). Debe ajustarse solo con evidencia de producción.

## Prueba

Ejecutar el workflow manualmente desde GitHub Actions (`Run workflow`) y comprobar que `/api/health` devuelve `200` y `data.status=ok`, el job termina en verde y no se crea un incidente cuando el servicio está sano.
