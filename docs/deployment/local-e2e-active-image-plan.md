# Plan activo de precarga local

Base exacta: `210aaddaed46dc4ee6b54191c4398fcf86f9d96d`.

El catálogo y los pins conservan las 13 imágenes de CLI 2.84.2. Precarga y
preflight comparten `ACTIVE_LOCAL_SUPABASE_IMAGES`, un plan fijo tipado de 11
referencias que omite exclusivamente Studio y postgres-meta. El arranque conserva
`--exclude supavisor,studio,postgres-meta`. No depende de env ni entrada externa.

No cambia versiones, dependencias, migraciones, entorno, servicios activos,
health checks, identidad, fallback, presupuesto compartido de 600 s, build de
240 s ni cleanup. Logflare permanece activo y precargado: esta limpieza NO
resuelve directamente su timeout ni demuestra ahorro o causa de lentitud.

Fuente versionada: https://github.com/supabase/cli/blob/v2.84.2/internal/start/start.go
filtra servicios excluidos antes del pull y omite los bloques de Studio/meta.

Validación local: 335/335 PASS en cinco archivos focales (plan activo, preloader,
wiring del runner, fallback y representaciones RepoDigest). Sin Docker, pulls,
build, E2E, instalaciones, push ni nueva ejecución CI. Runtime pendiente.

Integración Main por hunks de4a60de36 tras QA166 GO: mismos335/335 mock PASS en
cinco archivos3.56s; tsc0, ESLint focal0sinavisos, Prettier/diffcheck0. Un sexto
filtro solicitado no correspondía a un archivo existente; no se contabiliza como
cobertura. No se ejecutó instalación, Docker, build, E2E ni nueva corridaCI.
El presupuesto600s es por imagen faltante y compartido en su secuencia, no global.
