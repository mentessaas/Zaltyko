# Publicación MVP — procedimiento condicionado por evidencia

## Hallazgos

Este documento prepara la ejecución de la publicación aprobada por el usuario;
no ejecuta comandos ni da por satisfechos los gates. El candidato de aplicación
comprobado aisladamente es474369eade24bd2d647290eefc4523e6c814eb83. Los commits
posteriores preparan SQL/documentación; no acreditan una aplicación productiva.
La matriz vigente está en docs/qa/mvp-status-matrix-2026-10-25.md.

La guía anterior docs/production-setup.md contiene instrucciones históricas de
cron, Realtime y Storage ajenas a este alcance. Sus policies basadas solo en
bucket_id no acreditan aislamiento por academia y no deben aplicarse para
resolver el lanzamiento.

## Fuente

- CI de aplicación40221784665 y PostgreSQL40221815751 SUCCESS, alcance sintético.
- Preview de entregas zaltyko-delivery-preview.vercel.app, deployment
  dpl_BH3CCeYirKqdZsQg5YehLCkyzYhZ: candidato474, sin recorrido real acreditado.
- PR234 exige aprobación externa; no autoaprobar, omitir ni sustituir el gate.
- Candidato SQL exacto fuera de supabase/migrations:
  20261025202902_canonical_domain_installation_candidate.sql, SHA-256
  00ead5a3869bb335f2f17e58ebaaacac2bdc1ae4504493b473c68393359dab00.
  CI40232300015 instala/valida/rechaza replay en PostgreSQL17.6 desechable.
  applyReady=false; producción requiere autorización SQL separada.
- [Promoción Vercel](https://vercel.com/docs/deployments/promoting-a-deployment),
  consultada25oct2026: promover preview reconstruye; promover un deployment
  production staged permite conservar el build comprobado.

## Importancia

No publicar un build distinto del que se comprueba con configuración productiva.
No usar secretos del proceso de publicación en los jobs de CI sin secretos.
La existencia de un secreto ausente o de un handler que devuelve401 no demuestra
que una tarea programada esté desactivada en la plataforma.

## Siguiente paso — orden de ejecución

1. **Cerrar evidencia de entrega.** Fijar SHA/árbol exactos y comprobar todos los
   jobs requeridos; distinguir los jobs omitidos. Completar el alta humana de la
   cuenta dedicada, consentimiento/confirmación/recuperación y recorrido Owner
   real en la preview de entregas. Conservar IDs QA y evidencias sin credenciales.
   Validar aislamiento y persistencia entre academias/sedes y vistas375/768/1280.
   No usar ni modificar las dos fixtures del ensayo natural para esta entrega.
2. **Cerrar revisión.** Obtener aprobación externa de PR234 para el commit
   que vaya a integrarse. Si cambia el producto, renovar los gates pertinentes;
   no extrapolar CI474 a código diferente ni forzar merge.
3. **Resolver SQL por autorización separada.** Presentar archivo/hash/diff y
   destino real. Solo después de autorización, verificar identidad de conexión
   independientemente de GUC/comentarios y revalidar catálogo. Ante divergencia,
   abortar y revisar otro diff. No aplicar el snapshot entero, normalizar ledger,
   mover automáticamente el candidato al historial ni migrar datos legacy.
4. **Verificar configuración productiva.** Revisar equipo/proyecto Vercel,
   Supabase de producción, CA/TLS verificado, roles del servidor, Auth/callbacks,
   Redis y proveedores. Registrar solo presencia/scope/IDs no sensibles, nunca
   valores. Rechazar destinos/objetos/secrets sandbox o TEST en configuración
   destinada a Live. El catálogo/precios/Portal y condiciones de Stripe Live
   requieren evidencia propia; no hacer compras reales de prueba ni activar
   Connect/impuestos/cobro familiar automático.
5. **Verificar tareas y efectos.** vercel.json contiene12 entradas crons y
   git.deploymentEnabled=false en el corte local. Antes de crear el deployment
   production, comparar configuración efectiva de tareas con la autorizada y
   bloquear cualquier alta/activación nueva. Resolver explícitamente cómo se
   excluirán las tareas del artefacto si la plataforma las heredaría; no asumir
   que skip-domain las suprime. No reactivar despliegue automático por push.
6. **Crear staged production solo tras gates.** Compilar remotamente con entorno
   productivo, sin asignación del dominio público. El mecanismo CLI documentado
   es `vercel deploy --prod --skip-domain`; no ejecutarlo en el Mac como build ni
   antes de los gates. Usar un runner remoto autorizado y la versión revisada
   de CLI/API, con secretos acotados. Inspeccionar el deployment resultante:
   targetproduction, SHAs exactos, READY, configuración, artefacto y dominios.
7. **Comprobar el mismo deployment.** Probar acceso/roles, aislamiento,
   persistencia, cuotas manuales y configuración comercial usando únicamente
   fixtures/transacciones expresamente autorizadas para producción. Si exige
   una compra real, decisión fiscal o credencial humana, señalar ese paso; no
   simularlo con objetos test. Mantener el deployment anterior identificado.
8. **Promover el mismo artefacto.** Solo con gates cerrados promover el ID
   production staged comprobado. Confirmar que el dominio público apunta al
   mismo ID, verificar acceso/persistencia/errores y comunicar URL/SHA/evidencia
   y pendientes. Si falla acceso, aislamiento, persistencia o facturación,
   detener promociones y revertir únicamente aplicación cuando sea seguro.
   No borrar ni revertir datos automáticamente.

La autorización de publicación automática no elimina la aprobación SQL separada,
el paso humano de credenciales/condiciones, la revisión obligatoria de GitHub
ni las comprobaciones reales. El objetivo sigue siendo operativa y contratación
completas verificadas en producción; CI verde o preview READY no lo cierran.
