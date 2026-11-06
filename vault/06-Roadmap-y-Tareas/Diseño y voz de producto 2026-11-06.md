# Diseño y voz de producto

## Hallazgos

El usuario identifica una interfaz anticuada y un lenguaje corporativo en el SaaS. La captura de Personal muestra bordes rígidos, jerarquía repetida y términos internos («perfiles operativos», «lectura actual») ocupando el espacio principal. La corrección forma parte del cierre del producto.

## Fuente

Petición y captura del usuario del 6 de noviembre. Inspección de OwnerStaffManager y navegación compartida en el candidato 51cf5272. No es investigación de mercado ni aceptación visual de una propuesta nueva.

## Importancia

El producto debe hablar del trabajo del club: equipo, grupos, clases, gimnastas y cobros. Los detalles de permisos y recuperación siguen siendo claros, expresados con palabras cotidianas. No prometer cuentas, invitaciones, planificación o comunicación que aún no estén disponibles. Mantener terminología por disciplina y país; no sustituirla globalmente con categorías españolas.

## Siguiente paso

Primer corte implementable: Equipo y navegación compartida, superficies suaves, acciones consistentes, foco visible y objetivos táctiles de al menos 44px. Mantener rutas, permisos, diarios, callbacks y contratos. Adaptar selectores de pruebas a los nuevos textos preservando sus aserciones. CI y comprobación visual remotas antes de publicar.

Después, aplicar el mismo lenguaje visual y editorial por recorrido: resumen diario; grupos/clases/asistencia; familias/gimnastas; cuotas/cobros; registro y recuperación. Revisar estados vacíos, errores y operaciones pendientes en cada corte. No declarar renovado todo el SaaS por cambiar esta primera pantalla. Conservar los gates de correo, datos y fiscalidad del plan; este trabajo no los sustituye ni habilita Live.

Un responsable por archivo: Owner en pantalla Equipo; Backend en navegación compartida; QA en selectores/regresiones; coordinación en integración y evidencia. Sin SQL, proveedores, producción, ensayo o builds locales.

Integración: presentación de Equipo y navegación terminadas; metadatos alineados. Los controles conservan foco y tamaño táctil; los selectores adaptados conservan aislamiento, recuperación, no invitaciones y geometría del editor en los tres anchos. Los agentes Owner/QA alcanzaron su límite de uso antes de emitir el cierre; revisión final estática completada por coordinación. CI del nuevo commit, revisión externa y aceptación visual alojada siguen pendientes. Evidencia: `docs/qa/team-design-and-voice-2026-11-06.md`.
