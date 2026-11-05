# Inventario-only de clientes PostgreSQL nativos

Fecha: 5 de noviembre de 2026. Worktree experimental: `codex/disposable-backup-probe-20261105`, base `cbb026bf833834d1e11ed9357d656e2c2fbee3b7`.

## Alcance preparado

El único modo soportado por este probe es un dispatch `schema-replay` en la rama experimental exacta y con SHA completo coincidente. Este documento no certifica cobertura ni comportamiento de otros modos, incluido `checks-and-build`; Root coordina por separado la guardia explícita del workflow.

Tras comprobar el stack Supabase nativo y su identidad local, el script inspecciona `CLI_HOME` antes de la primera consulta o migración SQL. Solo busca los nombres `pg_dump` y `pg_restore`. Antes de invocar `--version`, valida que el home sea privado y esté bajo `RUNNER_TEMP`, que el ejecutable sea regular, ejecutable, propiedad del runner, no escribible por grupo/otros y que su ruta resuelta permanezca dentro del home. Rechaza enlaces que escapen del home. Emite un JSON reducido con nombre, ruta relativa, versión, SHA-256 observado y marcador de rama/run/SHA; el digest es evidencia para revisión, no una allowlist ni autenticación por hash esperado. Si falta un binario, sus campos quedan nulos.

El `trap` conserva el código de salida original. Antes de crear el stack, el script rechaza rutas temporales preexistentes de este `run_id`/intento. Si la CLI devuelve error al ejecutar `stack stop`, marca fallo, retiene `CI_WORKDIR`, `CLI_HOME` y los archivos temporales, y mantiene el output crudo oculto. Tras un stop con código 0 —o si nunca se inició el stack— intenta borrar solo directorios y archivos propios de esta ejecución, y comprueba que ya no existan. Cualquier fallo de borrado/verificación produce salida no cero si la tarea original había terminado en cero; si la tarea original falló, conserva ese código.

## Límites y estado

Este probe no ejecuta SQL, Auth, fixtures, creación de bases, dump ni restore. El script conserva el replay anterior debajo del `exit 0`; este camino experimental termina antes de alcanzarlo. El nombre del modo `schema-replay` se conserva por el contrato del dispatch, pero este camino es inventario exclusivamente: su éxito no demuestra replay, RLS ni restore. El código 0 de `stack stop` es solo acuse de la CLI; no se inspecciona el sistema operativo ni se demuestra que procesos o PID hayan terminado.

No se ejecutó ninguna suite. No se ha confirmado que el CLI instale ambos clientes en `CLI_HOME`, ni que sus versiones sean compatibles con el servidor.

**NO EJECUTADO.** Este archivo y el código son preparación para revisión de QA. No se despachó CI, no se ejecutó el probe, ni se hicieron commit, push o despliegue. No crear Auth/clientes, bases nuevas, dumps o restores en esta tarea.

## Siguiente paso

Tras cerrar la revisión independiente y fijar el SHA, Root coordina la corrida efímera de inventario en GitHub bajo la autorización humana de 8 horas vigente. Esa autorización cubre el inventario sin SQL, fixtures, dump ni restore. Un dump/restore quedaría para una fase experimental posterior y acotada; esta tarea no autoriza operaciones en Supabase Hosted ni en producción.

Vault: no aplica a esta tarea acotada de preparación, por instrucción de alcance.
