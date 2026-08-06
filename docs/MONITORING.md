# Monitorización propia de producción

Zaltyko incorpora una alerta operativa independiente de Vercel Pro mediante el workflow de GitHub Actions `Production monitoring`.

## Qué comprueba

- Ejecuta cada 15 minutos (y manualmente con `workflow_dispatch`) una petición `GET` a `https://zaltyko.com/api/health`.
- Verifica que HTTP sea `200`, que el estado sea `ok` y que la latencia total no supere 2.500 ms.
- El endpoint ejecuta una consulta `select 1` contra PostgreSQL, sin devolver credenciales, filas ni detalles internos.

## Cómo alerta

Cuando falla, GitHub Actions crea un issue abierto titulado `[monitoring] Production health degraded` y añade comentarios en ejecuciones posteriores. Cuando el servicio se recupera, añade un comentario y cierra el incidente.

El token `GITHUB_TOKEN` solo tiene permisos `contents: read` e `issues: write`. No se envían correos, no se realizan escrituras de negocio y no se incluyen secretos en los issues.

## Limitaciones

- GitHub puede retrasar los workflows programados; no constituye un SLA.
- Esta primera versión mide disponibilidad y latencia de base de datos, no sustituye alertas de logs de Vercel, Stripe, Brevo o Supabase.
- El umbral está versionado en `.github/workflows/monitoring.yml` (`MAX_LATENCY_MS=2500`). Debe ajustarse solo con evidencia de producción.

## Prueba

Ejecutar el workflow manualmente desde GitHub Actions (`Run workflow`) y comprobar que `/api/health` devuelve `200` y `data.status=ok`, el job termina en verde y no se crea un incidente cuando el servicio está sano.
