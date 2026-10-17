# Protección de despliegues y CI aislado — 15 octubre 2026

Autorización humana explícita: proteger despliegues, preparar CI sin Sandbox y actualizar PR #226. No desplegar ni tocar datos de producción.

## Configuración aplicada y releída

- Proyecto Vercel `zaltyko`: `previewDeploymentsDisabled=true`. Se mantiene el vínculo Git y su rama de producción `main`; no se desconecta el proyecto ni se altera la versión servida.
- Workflow GitHub `deploy.yml`: `disabled_manually`, verificado por API. Ningún dispatch realizado.
- Entorno GitHub `Production`: aprobación de `@elvisvaldes`, `prevent_self_review=true`; inicialmente solo ramas protegidas, después restringido a una política explícita de rama `main`. La API informa `can_admins_bypass=true`: no afirmar imposibilidad absoluta de bypass administrativo. Intentar desactivar ese bypass con `prevent_admins_bypass` fue rechazado (422, campo no admitido); la creación de política antes de activar el modo personalizado recibió 404. Después se activó correctamente el modo personalizado y se creó la política `main`.
- Protección `main`: seis checks requeridos, los cinco existentes más `Local Synthetic Owner E2E Required Gate`, actualizados con `strict=true`; `enforce_admins=true`. Se conserva una aprobación independiente de PR.
- Permisos predeterminados de Actions: lectura; los workflows no pueden aprobar PRs.

## Defensa versionada del candidato

`7a411ea4`: `vercel.json` desactiva despliegues Git para el candidato. El workflow Deploy ya no contiene push, credenciales ni pasos de publicación: un dispatch fallaría explícitamente. CI declara permisos de lectura; la matriz sintética no conserva credenciales checkout. Codecov no recibe token y solo se ejecutaría en push a main. Los jobs remotos del Sandbox mantienen `if: false`.

Contrato local: dos archivos, seis pruebas PASS, salida 0; `git diff --check` PASS. Revisión independiente de código y configuración solicitada antes de actualizar el PR. CI remoto del nuevo candidato aún no ejecutado al redactar.

Seguimiento: revisión Frontend 55 GO para fast-forward, revisión QA 92 confirma ajustes principales. PR #226 actualizado sin merge al SHA `5001651cc860548bde69ba8c5b878bac7c29da8b`; comentario de evidencia publicado. CI remoto `38698304250` en curso; jobs Sandbox observados SKIPPED. Consulta de despliegues Vercel filtrada por ese SHA devuelve cero. No repetir ni despachar runners adicionales mientras corre la matriz. Este seguimiento documental queda local para no cancelar/reiniciar CI con otro push.

GitHub notificó siete alertas de dependencias en la rama principal (dos críticas y cinco altas); su aplicabilidad al candidato está en auditoría, no se da por mitigada ni por explotable en runtime solo a partir de esa notificación.

No se modifican secretos, datos, esquema, despliegues existentes ni cron jobs activos. Estas protecciones no constituyen permiso de merge o release. Restablecer cualquier despliegue requiere una decisión explícita posterior.
