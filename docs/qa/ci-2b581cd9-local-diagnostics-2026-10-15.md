# Diagnóstico local posterior al cierre de CI 2b581cd9

15 de octubre, 10:12 UTC. No es una ejecución nueva de CI ni una optimización demostrada.

## Hallazgos y cambios revisados

- Frontend91 dio GO estático independiente a QA `c9a70c8b` y Backend `c276a1a6`. Main integró únicamente el import y función de identidad de QA, las definiciones de diagnóstico y las pruebas nuevas; conservó su guard de status primario entero positivo. No se reemplazó el helper completo de la base antigua de QA. Backend parte exactamente de `2b581cd9`.
- Identidad: seis claves fijas, estados booleanos/not-evaluated; sin valores observados, stdout, stderr ni cause. Mantiene plataforma/config/RepoDigest exactos antes y después del retag, alternativa única y presupuesto compartido de 600 s. El fixture familiar `kong@digest` sigue rechazado en esta integración instrumental.
- Build: cuatro hitos fijos recibidos de stdout/stderr, reloj monotónico y entrada acotada a 1 MiB; trazas con cinco fases permitidas y count/acumulado/máximo, límite de 8 MiB. La suma de spans no es tiempo de pared. Se emite el mismo resumen al finalizar éxito o fallo, sin sustituir resultado/error ni cleanup. Conserva Node22, Sentry/tracing, entorno, grupos de procesos y timeout240s.
- Docker/Moby usa nombres familiares en RepoDigests: la fixture Kong demuestra un defecto de compatibilidad del comparador actual. No demuestra cuál fue el campo rechazado en el job WebKit. Frontend91 aprobó un diseño separado de alias exactos derivados del pin; QA prepara un commit LOCAL separado, aún no integrado ni validado por Main.

## Validación Main

Ocho archivos, 126/126 pruebas mock PASS, duración8.90s, tests2.23s. Incluye identidad, fallback y guard de status, precargador, wiring, progreso/trazas, ciclo de proceso y contrato de variable de entorno. `tsc --noEmit`: salida0. ESLint focal: salida0 con un warning por parámetro mock sin uso, retirado después sin cambiar comportamiento; segunda pasada ESLint salida0 sin avisos y suite identidad18/18PASS1.33s. `pnpm audit:env`: PASS73. Prettier focal y `git diff --check`: PASS. No se ejecutaron builds, E2E, Docker, pulls, instalaciones, consultas remotas ni nuevos runners.

## Fuentes y límites

- Commits locales QA `c9a70c8bad96ef89a37579dd9d38f2477be0a2b6`, Backend `c276a1a68f8b37b9e76df48bacac4244c6bd04c9`, revisión Frontend91 y comandos Main indicados arriba.
- [Moby28: RepoDigests y FamiliarString](https://raw.githubusercontent.com/moby/moby/v28.0.0/daemon/images/image_inspect.go), [distribution/reference0.6: familiarización](https://raw.githubusercontent.com/distribution/reference/v0.6.0/normalize.go). Solo respaldan equivalencia de nombres del mismo repositorio/digest; no autorizan otros registros o repositorios.
- [CI original 38713511027](https://github.com/mentessaas/Zaltyko/actions/runs/38713511027): FAILURE, no cambia por integrar instrumentación local. Campo real del rechazo de identidad y causa del build240s: NO VERIFICADOS. No afirmar resolución de Firefox/WebKit.

Importa para obtener evidencia comparable y corregir una incompatibilidad demostrable sin rebajar identidad. Accionable: sí, revisar y probar el commit separado de alias; solo después valorar un candidato nuevo con protecciones reconfirmadas. Sin push, dispatch, rerun, DDL, merge o despliegue en esta pasada. NO-GO para publicar: CI, seguridad residual, esquema/recuperación/rol app y aprobación independiente siguen separados y pendientes. La solicitud de Backups ya existe; no repetirla.
