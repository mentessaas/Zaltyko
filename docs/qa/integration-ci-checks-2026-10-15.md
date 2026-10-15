# Verificación local de integración CI — 2026-10-15

Candidato: `43050ba3fac9e7fc22e1def8eb4be2067bbb927e`.

Se integró la rama CI hasta `35a2bab961933648f3b803fa1f6fdc3a2d6f4670`, tras revisión independiente Frontend (revisión 43). Incluye corrección del instalador para el archivo oficial con LICENSE, README.md y supabase regulares únicos; mantiene desactivados los dos jobs del Sandbox y define una matriz local sintética bloqueante.

## Evidencia de esta pasada

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit`, salida 0.
- Instalador: `python3 -B scripts/ci/test_install_pinned_supabase_cli.py`, 5/5 PASS, salida 0; archivos sintéticos, sin ejecutar CLI.
- Vitest focal: preloader y runner, 19 pruebas PASS; contrato YAML no pudo cargar `js-yaml`. Resultado global de la invocación: salida 1, **no PASS**. La dependencia está declarada y fijada en lockfile, pero falta sincronizar node_modules local. No se instaló nada en esta pasada.
- Seguimiento 06:02 CEST: QA confirmó que `js-yaml@4.3.2` ya estaba completo en el store local y faltaba únicamente su enlace raíz. Sincronización offline con lockfile congelado y scripts desactivados, `COREPACK_ENABLE_NETWORK=0 npm_config_manage_package_manager_versions=false pnpm install --offline --frozen-lockfile --ignore-scripts`, salida 0 (pnpm 9.15.9); sin cambios versionados de dependencias. Un primer intento con la opción CLI `--manage-package-manager-versions=false` fue rechazado antes de instalar (salida 1). Tras sincronizar, repetición de los tres archivos focales: **23/23 pruebas, 3/3 archivos PASS**, salida 0. Esto resuelve el bloqueo local de carga YAML, no acredita CI remoto.
- Sobre el padre `ee1ea3de`, gates estáticos: lecturas 1797 archivos, autorización 399 y rutas huérfanas 76, sin hallazgos. Cobertura RLS declarativa: 79 tablas, 100%; integridad migraciones: 7 Drizzle + 112 Supabase, salida 0. No son pruebas de aislamiento contra una base remota.

## Publicación: NO-GO

La definición CI está integrada únicamente en local: no se ejecutó GitHub Actions ni se modificó branch protection. Siguen pendientes CI remoto, compatibilidad del esquema de destino, revisión independiente del PR y autorización de publicación. Los PASS locales previos de Chromium, Firefox y WebKit y la suite unitaria completa conservan sus SHAs y alcance documentados; no se repitieron navegadores ni se atribuyen al nuevo CI.

Sin acceso ni cambios al Sandbox o producción. El directorio no versionado `scripts/__pycache__/` preexistente se preservó.
