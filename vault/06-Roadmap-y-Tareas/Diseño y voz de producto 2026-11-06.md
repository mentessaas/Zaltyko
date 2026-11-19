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


## Resultado CI657393fd

CI principal42183554004 e aislada42183562606 completas SUCCESS del mismoSHA; dos builds, unitarias5998PASS/6omitidas en ambas, Chromium3/3, Firefox3/3 y WebKit3/3, RequiredGate, PostgreSQL desechable, Static, Directory y GitGuardianSUCCESS. Los siete jobs condicionales omitidos no acreditan sus recorridos. Geometría del editor375/768/1280 sin desbordes/intersecciones/objetivos menores44px. Merge82170f28407de26d4fd5aec007feca2123873fdd y HEAD comparten árbol2f40a66009b81896210e8b50b18b83c04710ffa5; buildaisladoHEADexacto confirmado. GitHubREVIEW_REQUIRED. Preview51cf5272 intacta, aceptación visual alojada del diseño pendiente. Estado actualizado localmente sin nuevo commit para conservar el candidato. Evidencia externa team-design-657393fd-status.md; nota de diseño y backlog actualizados. Sin SQL/Live/producción/ensayo/proveedores/correos ni builds/testsMac.


## Publicación y aceptación alojada657393fd

**Hallazgos.** Revisión externa exacta APPROVED; deployment dpl_DRqwKTQE2LXXSe6gXHt1Yr5wFm9p READY publicado solo en el alias de entregas. Anterior51cf5272 conservado READY. Owner QA A comprueba Equipo, menú y formulario/editor a375/768/1280 sin desbordes ni objetivos menores44px. Una fixture sintética creada y archivada, Activos vacío después de recargar, historial conservado.

**Fuente.** auditorias/2026-11-06/team-design-657393fd-publication.md, equipo-657393fd-hosted-metrics.json y capturas reales del SHA. CI y revisión exactas revalidadas. Buffer de red truncado: no afirma escaneo global. Manager autenticado de este SHA no repetido con esta sesión Owner; reglas sin cambios y regresiones CI conservadas.

**Importancia.** Primer corte visible publicado, no rediseño completo ni MVP abierto. Invitaciones y correo aislado OFF; Live cerrado. Sin SQL, proveedores, producción, ensayo, nuevos accesos o builds/tests locales. Estado actualizado localmente sin nuevo commit para conservar el aprobado.

**Siguiente paso.** Resumen y recorridos operativos con la misma voz del club; completar correo automático real, procedimientos de datos, suplencia y fiscalidad/contratos. Alta de autónomo documentada; fiscalidad del software pendiente del asesor.
