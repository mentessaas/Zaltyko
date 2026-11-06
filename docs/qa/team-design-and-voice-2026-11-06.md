# Equipo y navegación: diseño y voz del club

## Hallazgos

Primer corte del cambio solicitado a partir de la captura de Personal: Equipo, navegación compartida y metadatos. Jerarquía de títulos, superficies blancas y suaves, controles consistentes, estados vacíos e iconos decorativos de la dependencia existente. «Mesa de dirección» pasa a «Tu club» y se mantiene explícito que añadir a una persona no crea una cuenta ni envía invitaciones.

El diff de la pantalla comienza en estilos, campos y JSX de presentación. No cambia funciones de escritura, autorización, carga, diario, claves, bloqueo entre pestañas, recuperación ni persistencia. Navegación conserva rutas, consultas, capacidades, cierre del desplegable y devolución del foco. No se amplían los roles que ven Equipo.

## Fuente

Petición y captura del usuario del 6 de noviembre; comparación estática contra 51cf5272333a9d1f7c440040671322fb4a708e5d. Owner implementó la pantalla, Backend congeló y revisó su navegación, QA adaptó los selectores de cuatro suites sin eliminar aserciones. Owner y QA alcanzaron su límite de uso antes del cierre final; coordinación revisó e integró los cambios restantes. No se atribuye a esos agentes una revisión final que no emitieron.

## Importancia

Las pruebas existentes conservan comprobaciones de aislamiento, denegaciones, versión obsoleta, recarga, respuesta perdida, misma clave/cuerpo, ausencia de invitaciones y efectos parciales. El E2E aislado conserva geometría a 375/768/1280: ancho, objetivos de 44 px, intersecciones y texto dentro de contenedores, incluido el editor abierto. Los cambios de prueba son nombres accesibles y textos que cambiaron en la interfaz.

## Verificación y siguiente paso

- Revisión estática y `git diff --check`: realizados; sin ejecución de aplicación en Mac.
- CI principal y aislada del nuevo SHA: pendientes al preparar este documento. No se heredan resultados de 51cf5272.
- Revisión GitHub del nuevo SHA y publicación en entregas: pendientes.
- Capturas y aceptación visual alojada de Equipo y navegación: pendientes tras la publicación autorizada. No se presenta la captura anterior como resultado nuevo.
- El resto del SaaS conserva su diseño actual. Se continuará por recorridos, usando este corte como base y manteniendo la terminología por país y disciplina.

Sin SQL alojado, proveedores, correos, Live, producción, ensayo, instalaciones ni builds/tests locales. Los gates de datos, correo automático y fiscalidad siguen abiertos por separado.
