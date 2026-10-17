# Experimento local: excluir servicios de gestión

Base exacta: `5344e9d5e246ce6dc91d096e5f57571beaae40fb`.
Parche preparado, no aplicado a integración, no ejecutado ni autorizado para CI.

Cambio: `start --exclude supavisor,studio,postgres-meta`. Se mantienen DB, Auth,
REST, Kong, Storage y el resto de servicios. No altera env, migraciones, health
checks, timeout build 240 s, cleanup, 13 pins ni preload/verificación de identidad.

Evidencia local: `/opt/homebrew/bin/supabase --version` devuelve 2.84.2;
`supabase start --help` enumera separadamente `studio` y `postgres-meta` entre
las exclusiones soportadas. No se ejecutó start ni Docker. Suite revisada:
`tests/e2e-owner-local-setup.spec.ts` y `tests/support/local-e2e-network.ts`;
sin referencias Studio/meta/54323/STUDIO_URL. El spec importa solo ese helper
local además de Node, Playwright y pg. Studio y meta son superficies de gestión;
la independencia en runtime sigue sin comprobarse.

## Fuente oficial versionada y dependencias

- [CLI v2.84.2 start.go](https://github.com/supabase/cli/blob/v2.84.2/internal/start/start.go):
  `run` construye el mapa de exclusiones por nombre; los bloques pg-meta y Studio
  tienen condiciones separadas `!isContainerExcluded(...)`. pg-meta recibe DB
  host/port/user; Studio recibe `STUDIO_PG_META_URL`. Solo los contenedores
  arrancados se incorporan a `started`, pasado a `WaitForHealthyService`.
- [Kong v2.84.2](https://github.com/supabase/cli/blob/v2.84.2/internal/start/templates/kong.yml):
  Auth apunta a GotrueId; REST a RestId; Storage a StorageId. Los upstreams
  PgmetaId y StudioId sirven respectivamente `/pg/*` y `/mcp`. Quedan esas
  superficies de gestión sin backend; no se eliminan sus rutas de Kong.
- Inferencia estática: excluir conjuntamente ambos bloques no elimina DB,
  Gotrue, REST, Storage ni Kong, ni incorpora los ausentes al healthcheck final.
  No demuestra que ningún consumidor indirecto pueda llamar `/pg/*` o `/mcp`.

El parche actualiza los dos contratos existentes del argumento start y añade
un contrato de exclusión exacta, sin desactivar health checks. El nuevo contrato
usa separación de cadenas literales para evitar ambigüedad de escape del regex.
No se ejecutaron builds, E2E ni instalaciones. No demuestra causa del timeout ni
ahorro CPU/RAM. QA debe revisar y Main decidir cualquier ejecución posterior.

Validación local autorizada: archivo `tests/e2e-local-runner-safety.test.ts`,
6/6 PASS (659 ms), en exportación temporal exacta de `5344e9d5` con el parche
aplicado y dependencias ya instaladas enlazadas; sin instalación ni stack.
El parche se aplicó sin errores. No se ejecutó el runner ni comandos Docker.
Vault: Main conserva el cierre integrado; este commit aislado contiene solo
el documento y el parche para respetar la entrega acotada solicitada.

## Integración posterior Main

QA158 GO estático y revisión Main de las fuentes versionadas; aplicados solo los
hunks del runner y contrato sobre HEAD de integración, no archivos enteros de la
base antigua Frontend. El parche documental original no se aplica en runtime.
Se conserva el diagnóstico, guard de status, identidad, pins, entorno y cleanup.
Validación integrada y cualquier nuevo candidato CI deben documentarse por separado;
no es evidencia de resolver el timeout ni de readiness.

Validación Main integrada: 393/393 tests mock en12 archivos PASS6.28s,
incluyendo wiring, núcleo/cleanup, CLI, preload, digest/fallback/representaciones,
diagnósticos y contrato de despliegue, más ambos contratos SQL. Primer focal
18/18 en3 archivos PASS; dos filtros de nombres inexistentes no ejecutaron tests
y no se cuentan como cobertura. No nuevo build, E2E, Docker, pull o instalación.
Main completó TypeScript salida0, ESLint focal0 sin avisos, audit:envPASS73 y
formato/diffcheckPASS. QA159 GO del diff integrado autoriza preparar un candidato
distinto condicionado a estas comprobaciones y protecciones vigentes. Protecciones
Main/Vercel reconfirmadas en solo lectura antes del push; ningún merge/despliegue.
