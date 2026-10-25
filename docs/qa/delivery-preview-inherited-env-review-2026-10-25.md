# Preview de entregas: herencia de configuracion sin recuperar secretos

## Hallazgos

El SDK oficial Vercel documenta que createDeployment con deploymentId hereda configuracion y variables del despliegue original salvo overrides explicitos. El nuevo despliegue recibe ID, URL y build nuevos. gitSource selecciona fuente Git; es incompatible con files. withLatestCommit quita el SHA anterior: no usarlo porque se necesita SHA exacto. Target omitido significa preview; nunca production ni staging en esta preparacion.

Origen propuesto: dpl_8GL6DqKiuuZUoPs44fjbmRpHaZhY, alias congelado zaltyko-sandbox-preview.vercel.app. Candidato b270d9f212efa74979bd262305fb8b17f3667137, PR234. CI40197832794 en curso. No hay nueva preview ni solicitud de creacion ejecutada.

## Fuente

https://github.com/vercel/sdk/blob/main/docs/models/createdeploymentrequestbody.md y https://github.com/vercel/sdk/blob/main/docs/sdks/deployments/README.md, consultados25oct2026. El manifiesto SDK debe contrastarse con la API efectiva antes de usarlo.

## Importancia

Puede permitir preservar secretos sensibles no recuperables sin rotarlos ni crear roles. La documentacion de herencia no acredita por si sola que source override funcione como se necesita o que la configuracion heredada cumpla el contrato nuevo. No se hereda evidencia de validacion funcional entre SHAs.

## Siguiente paso

Cerrar CI y revision del parche. Revisar contrato API para fuente exacta, control de alias y preflight de destinos. Crear solo preview diferenciada, verificar SHA efectivo y destinos sandbox/Stripe test antes de operaciones autenticadas. No mover alias congelado, no asignar dominios de produccion, no reactivar cron, no modificar fixtures protegidas. Los callbacks/correo/webhook que sigan apuntando al alias anterior no validan automaticamente la preview nueva; resolver ese alcance por separado. No se han leido valores sensibles ni enviado cuerpos API con secretos.


## Preflight de entrega preparado

El build heredado ejecuta preview-sandbox-build.sh y preview-build-preflight.cjs. El preflight anterior exige banderas short-paid del ensayo; no debe reutilizarse tal cual como una entrega independiente. Se añade modo ZALTYKO_DELIVERY_PREVIEW=true que exige rama exacta codex/mvp-main-bridge-20261025, SAAS_QA_SHORT_PAID_ENABLED=false y RUN/EXPIRES_AT vacios. Se mantienen los controles TLS/CA, base, Stripe test/cuenta/catalogo, Redis exacto y proveedores desactivados. El modo historico no cambia. La creacion del deployment debera aplicar esas variables tanto a runtime como build, no solo exportarlas en el shell del build. Las pruebas de preflight usan variables sinteticas y solo procesos de validacion; se ejecutaran remotamente, no en Mac. Pendientes CI y revision.


## Solicitud preparada, no enviada

Template delivery-preview-request-template-2026-10-25.json contiene solo IDs publicos, flags y SHA placeholder deliberadamente no valido. No es evidencia de deployment. CLI56.5 local usa env y build.env, y autoAssignCustomDomains=false para --skip-domain; se inspecciono codigo instalado, no se ejecuto deploy. SDK oficial documenta deploymentId, gitSource y withLatestCommit. Antes de enviar, sustituir SHA por exacto con CI/review, confirmar que API combina nueva fuente con herencia y rechazar cualquier destino no preview. Verificar en respuesta fuente, proyecto, tipo y configuracion antes de continuar; cualquier fallo de preflight cancela el avance sin cambiar el alias del ensayo.
