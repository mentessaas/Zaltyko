# Worker local del outbox canónico

**Implementación:** `src/modules/analytics/application/outbox-dispatcher.ts` y
`src/app/api/cron/zaltyko-outbox/route.ts`.

El dispatcher reutiliza `outbox_events.status`, `attempts`, `available_at` y
`last_error`; no añade otra cola ni esquema. En una transacción reclama hasta 100
eventos debidos con `FOR UPDATE SKIP LOCKED`, pasa a `processing`, aumenta el
contador y usa `available_at` como deadline del lease. Un proceso que cae no
retiene locks; al vencer el lease, otro worker lo recupera. El acuse compara
organización, id y número de intento, de forma que una ejecución antigua no
pueda cerrar la reclamación nueva.

El handler actual consume invalidaciones de métricas y delega al consumidor
idempotente `consumeMetricInvalidationEvent`. Eventos `metrics.*` se reconocen
como ya consumidos y se marcan como processed para no crear ciclos. Los fallos
persisten únicamente un código estable, reintentan con backoff exponencial (15 s
a 15 min) y pasan a `failed` tras ocho intentos. Los leases caducados agotados se
dead-letterean al siguiente barrido. No se almacena texto de excepción que
pudiera contener datos sensibles.

La ruta POST requiere `CRON_SECRET` y un advisory lease global evita dos barridos
simultáneos del mismo endpoint. Está implementada pero **no está registrada en
`vercel.json`**, no desplegada y no probada contra Supabase remoto. No debe
presentarse como worker operativo ni como cumplimiento del SLA de 15 minutos.

Verificación local: `bash scripts/run-zaltyko-metrics-engine-local.sh` prueba
tres dispatchers concurrentes reclamando una sola vez, invalida métricas una
sola vez y recupera un evento con lease expirado. **No verificado:** error
transitorio→backoff ni dead-letter mediante fallo inyectado, disponibilidad
continua, métricas operativas, cron remoto, recompute/score/insights orquestados y
digest.
