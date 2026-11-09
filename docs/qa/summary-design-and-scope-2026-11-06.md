# Resumen: diseño y contexto del club

## Hallazgos

Segundo corte de diseño tras Equipo: Resumen conserva las operaciones y cifras persistidas, con contexto del club, selector de sede adaptable, tarjetas legibles y accesos consistentes. Se mantienen las diferencias entre datos actuales y del periodo, moneda, cobros brutos y datos indisponibles. No se añaden métricas, previsiones ni funciones deportivas.

## Fuente

OwnerEssentialDashboard y OwnerOperationalSummaryPanel. Las regresiones de owner-essential-dashboard conservan permisos de Owner/Admin/manager y resumen nulo sin ceros inventados; añaden contexto academia/sede, alcance organizativo de Gimnastas y formulario GET. El E2E existente añade geometría de nueve controles a375/768/1280 sin sustituir las aserciones anteriores. Los nombres largos se cubren en la unitaria, no equivalen a geometría de navegador.

## Importancia

El cambio es de presentación y copy. No cambian servicios, APIs, consultas, permisos, cálculos, fechas o diarios de recuperación. No hay migración. Invitaciones, correo aislado y Live permanecen desactivados. No se ejecutaron builds/tests/lint/tipos/servicios/instalaciones en Mac.

## Siguiente paso

CI completa del commit exacto, principal y aislada (incluido PostgreSQL efímero remoto), Static, Directory y GitGuardian. Después revisión externa y aceptación visual alojada antes de publicar solo en entregas. Los resultados se registrarán con sus ejecuciones; esta nota no acredita pruebas aún pendientes. No se heredan PASS del diseño Equipo.

La preview permanece657393fd. Correo real desde la aplicación, consumidores de envío que ignoran false, suplencia humana, devolución integral/supresión/recuperación, revisión fiscal y contratos siguen como frentes separados. No se modifica producción ni el ensayo.
