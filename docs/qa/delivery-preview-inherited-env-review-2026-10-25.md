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


## Arbol validado de la entrega 91eb0c21

La CI de PR usa checkout por defecto de refs/pull/234/merge, no checkout explicito del HEAD. Se comparo el merge temporal GitHub 7f54ee3969c9340f9fbe90e25d698844f9c0d0ce con el HEAD91eb0c21: ambos arboles son 5fd138e182c4bc31bfa81301aa9761a9c93c2a18. Los padres del merge temporal son main f84fd6dc y91eb0c21; main es ancestro del HEAD. Esto acredita identidad de contenido para ese corte, no identidad de SHA ni un despliegue. CI40199478736 sigue pendiente de WebKit al registrar esta comparacion; no heredar este resultado a cambios posteriores.


## Solicitud ejecutada tras CI completa

CI40199478736 termino SUCCESS, incluidos Chromium/Firefox/WebKit. Se envio una sola solicitud del template con SHA91eb0c21 exacto, env/build.env short-paid apagados, sin target productivo y autoAssignCustomDomains=false. Resultado: dpl_ADr6BZQaTyahJ6VrJN5FPNnngLXH, URL https://zaltyko-5zm4bowpq-mentessaas-projects.vercel.app, estado inicial INITIALIZING. Respuesta acredita proyecto prj_tUepgxfFz4UMpxJ7PrCjWRC66GYT, target null (preview), gitSource SHA/ref exactos. No acredita build ni runtime todavia. Consulta separada del alias congelado confirma que sigue en dpl_8GL6DqKiuuZUoPs44fjbmRpHaZhY. No se movieron alias ni se leyeron secretos; la herencia efectiva debe pasar preflight antes de avanzar. No hubo build local.


## Herencia contradicha por API efectiva: no publicar

La primera solicitud dpl_ADr6BZQaTyahJ6VrJN5FPNnngLXH dejo projectSettings.buildCommand=null y env/build.env vacios al leerla. Se cancelo y quedo CANCELED; no seguir ese despliegue. La documentacion del SDK sobre herencia no basta cuando se combina con nueva gitSource.

Segunda solicitud acotada: meta.action=redeploy, forceNew=1 y projectSettings explicitos (comando sandbox y pnpm congelado), mismo SHA/ref y sin alias. dpl_9jSqfyDYSZMQXpzCpZAcHHNmYrpz termino ERROR. El preflight fue ejecutado y bloqueo ANTES de tipos/Next: deliveryIsolation y target preview true, pero DB/TLS CA dedicada, configuracion SaaS test, Redis y aislamiento de proveedores no pasaron. Los metadatos contienen167 claves frente188 del origen: no acreditar herencia de los overrides secretos que se pasaron originalmente por CLI. No hubo preview READY ni validacion autenticada del candidato; no repetir despliegues hasta preparar configuracion explicita completa. No registrar valores ni logs completos. El template fija ahora los comandos obligatorios, pero NO resuelve esa falta de configuracion.

## Alternativa de alcance de rama: prueba reversible

El SDK oficial permite PATCH /v9/projects/{project}/env/{id} con gitBranch y target,
sin enviar value. Fuente: https://github.com/vercel/sdk/blob/main/docs/models/editprojectenvrequestbody.md
y https://github.com/vercel/sdk/blob/main/src/funcs/projectsEditProjectEnv.ts.
Se comprobo SOLO con DATABASE_CA_CERT_PATH, variable no secreta, target preview:
la API confirmo nueva rama, mismo ID y mismo tipo. Se devolvio inmediatamente a
codex/fix-f84-build-hang-20261019 y se confirmo restauracion exacta de rama/target/ID.
No se enviaron valores ni se modificaron variables sensibles; no hubo deployment.
Esto prueba el cambio de alcance de una variable publica, no la herencia de un
build ni un conjunto secreto completo. La lista actual contiene 42 variables
del sandbox en la rama antigua; no debe ampliarse a preview global ni produccion.
Antes de usar temporalmente ese conjunto para una entrega, conservar el manifiesto
de IDs/tipos/alcances sin valores, confirmar todos los controles y restaurar los
alcances originales incluso ante fallo. No rotar valores ni crear roles para ello.


## Corte efectivo: candidato 78c6e38b, alcances restaurados

Las42 variables sandbox se trasladaron temporalmente por ID a la rama de entrega sin enviar valores ni cambiar tipos; las42 se restauraron y su ID/tipo/target/rama se releían iguales al origen. Manifiesto y reporte JSON separados conservan solo metadatos públicos. El primer deployment dpl_8C9MRH1gm5sx9RHt7yxoosyLUwPm fue cancelado prematuramente durante la hidratación de metadatos; una lectura posterior mostró191 claves y todas las42 requeridas. No tratar una lista env vacía transitoria como fallo de aislamiento.

El redeploy sin overrides dpl_Gjx1VZH1b2CHo6fCvVzEjP7Ajg2m terminó ERROR: resolvió163 claves y perdió24 overrides. La herencia efectiva no queda acreditada y no debe reutilizarse para esta entrega.

Una solicitud directa nueva con los alcances sandbox temporalmente presentes creó dpl_HmnwaCCDPfps15iCUvNPpekTpb6b, SHA78c6e38b exacto, targetnull. Resolvió191 claves, incluidas las42 requeridas. Sus controles Supabase/DB, Stripe test, catálogo, Redis, TLS verificado y proveedores apagados resultaron true. Se detuvo antes de tipos/Next porque NODE_EXTRA_CA_CERTS no quedó vacío: databaseCaOnly=false/globalCaEmpty=false, aunque la ruta dedicada y el certificado sí existen. No omitir el control ni debilitar TLS. La próxima solicitud necesita declarar explícitamente ese valor público vacío en env y build.env, manteniendo DATABASE_CA_CERT_PATH dedicado. No se recuperó ningún secreto.

Todos estos intentos dejaron intacto el alias congelado y restauraron los42 alcances originales. No hay nueva preview READY ni evidencia autenticada del candidato. Fuente: metadatos API y líneas booleanas filtradas de build; no se guardan logs completos ni valores. La CI40203109015 y replaySQL40203116706 sí terminaron SUCCESS para78c6e38b; no acreditan los cambios de familias posteriores sin commit.


## CA resuelta; rechazo de capacidad distinguido del exceso

Solicitud dpl_2pH3xwHmABpywcW5RBdhZsGZvqTv para78c6e38b, con NODE_EXTRA_CA_CERTS vacío explícito en env/build.env. Las42 variables se restauraron de nuevo por ID/tipo/target/rama. Preflight: todos los14 booleanos true; no se relajó TLS ni aislamiento. El gate remoto ejecutó221 pruebas:220PASS y1FAIL, por lo que no empezó tipos/Next ni publicó.

Fallo localizado en tests/saas-preview-regularization-pg.test.ts: tras regularizar la fixture transaccional a30/3/10, el test de altas31/4/11 esperaba PLAN_OVER_CAPACITY, pero recibió CAPACITY_FULL. Ese resultado corresponde a cupo lleno sin excedente; PLAN_OVER_CAPACITY se conserva en las aserciones previas con excedente. Se corrigen únicamente esas tres expectativas posteriores, manteniendo snapshot22tablas tras cada rechazo, cero recursos remanentes de fixture y rollback externo obligatorio. La corrección necesita nueva CI/gate remoto; no se afirma PASS por inspección. No se modificaron los datos protegidos ni las fechas del ensayo.
