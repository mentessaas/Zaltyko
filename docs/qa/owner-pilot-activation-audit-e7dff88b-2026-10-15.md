# Activación operativa del piloto: auditoría estática

15 octubre2026. Fuente: lectura Backend81 del SHA `e7dff88b39ba4fdf19c2f35f1f918a8ff3fa02a1`, sin consultas remotas ni cambios. No prueba qué candidato está publicado, valores desplegados ni schedulers externos.

## Hallazgos

- `/owner/setup` y `src/app/api/v1/organizations/bootstrap/route.ts`: sesión, consentimiento, validación, idempotencia y bootstrap transaccional. Sin flag de preparación ni allowlist de participantes observados. El consentimiento se registra antes del bootstrap y podría persistir aunque este falle después.
- `src/app/api/v1/owner/billing/monthly-invoices/issue/route.ts` y `manual-payments/route.ts`: sesión, autorización financiera/organización/sede e idempotencia; emisión añade rate limit y revalidación transaccional. No cierre de activación específico observado.
- `src/app/api/cron/zaltyko-outbox/route.ts`: autenticación cron, actor sistema y lease/advisory lock; no pausa del piloto antes del dispatcher/cierre de acciones vencidas. Reclamar eventos ya modifica estado. La exclusión concurrente no decide si el piloto está activado.
- `src/modules/shared/infrastructure/operational-authorization.ts` valida miembro/rol/sede; el helper humano revisado no comprueba estado de organización. Suspender una organización no demuestra un cierre universal de mutaciones.
- `DIRECTORY_CATALOG_ENABLED`, `scheduledReports`, `admin` y restricciones de preview protegen otras superficies. `vercel.json` no programa este outbox, sí el collector legacy. Deshabilitar despliegues no deshabilita endpoints existentes.

## Por qué importa y siguiente paso

Si se desplegara con tablas ausentes, peticiones autorizadas podrían llegar a errores DB, no a mantenimiento controlado. Si ese código ya estuviera expuesto, crear esquema podría habilitar escrituras inmediatamente. Completar18migraciones, por sí solo, no acredita una activación posterior controlada. Son inferencias del flujo estático, no incidentes observados.

Accionable: sí. Mantener no-deploy, validar esquema/rol/recuperación y orden de activación antes de decidir release. Como opción para una preparación por fases, Backend propone controles exclusivamente servidor, cerrados por defecto, antes del consentimiento/bootstrap, mutaciones Owner y lease/outbox. Nombres propuestos `ZALTYKO_OWNER_BOOTSTRAP_ENABLED`, `ZALTYKO_OWNER_WRITES_ENABLED`, `ZALTYKO_OUTBOX_ENABLED`: **no existen actualmente y no se han implementado ni configurado**. No aprobar un guard parcial como cierre universal ni añadirlo sin revisar superficie, pruebas, compatibilidad y activación E2E. Drenar operaciones en vuelo sería independiente de cambiar configuración.

No implica exigir nuevo desarrollo si la publicación atómica y el orden de preparación pueden verificarse con las protecciones existentes. No equivale a autorización DDL/deploy ni a permiso para automatizar cobros. Mantener separado este riesgo de las pruebas funcionales y del esquema remoto.
