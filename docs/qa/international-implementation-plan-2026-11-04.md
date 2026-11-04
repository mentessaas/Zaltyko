# Zaltyko: gestión internacional y especialización progresiva

## Decisión y procedencia

Fuente: plan humano aprobado el 4 de noviembre de 2026, «Zaltyko: gestión internacional y especialización progresiva en gimnasia». Sustituye el alcance estratégico anterior; conserva evidencias históricas, autorizaciones específicas y límites de seguridad. Este documento describe ejecución y dependencias, no acredita una publicación.

Importancia: un club podrá utilizar la administración comprobada sin disponer de un paquete federativo de su país. La ausencia de ese paquete no debe convertirse en una selección falsa de España. Gestión, especialización y contratación son capacidades independientes.

## Orden de entrega y responsables

| Prioridad | Entrega | Responsable | Criterio de aceptación |
| --- | --- | --- | --- |
| P0 | Cierre del núcleo y procedimientos de datos | Coordinación + QA | Recorrido persistido, roles, reintentos, correo real, devolución y procedimientos de conservación/supresión/recuperación selectiva |
| P0 | Separación de capacidades administrativas, deportivas y comerciales | Backend | Registry único; sin heredar reglas ES ni habilitar contratación internacional por seleccionar país |
| P0 | Alta ES/MX, moneda manual y zona de sede | Backend + Owner, archivos separados | ES mantiene reintentos antiguos; MX exige zona explícita; EUR/MXN sin conversiones ni sumas cruzadas |
| P1 | Propuestas honestas y demanda medible | Coordinación + Owner | Máximo tres propuestas por perfil; sin operaciones ficticias, falsa restricción de pago, campañas o datos de menores |
| P1 | Experiencia real por trabajo y disciplina | Owner + QA | Dirección, manager, entrenador y familia muestran únicamente recorridos autorizados e implementados |
| P1 | Pilotos y apertura del núcleo | Coordinación | Candidato congelado, revisión, CI, aceptación alojada y requisitos para datos reales |
| P2 | Biblioteca y progreso GAF/GAM | Frente deportivo + Backend | Catálogo versionado, objetivos y observaciones sobre personas canónicas, historial y visibilidad explícita |
| P2 | Planificación conectada | Frente deportivo + Owner | Reutiliza clases, sesiones y asistencia; prerrequisitos y decisión del entrenador |
| P3 | Preparación de ejercicios | Frente deportivo + QA independiente | Orden, repeticiones, salidas y cobertura validados; trazabilidad de entradas y cálculo; nada de nota total con cobertura incompleta |
| P3 | Modelo propio de rítmica | Frente deportivo | Individuales/conjuntos, aparatos y composición, con reglas propias verificadas |
| Posterior | Captación, eventos, reputación y gamificación | Frentes separados según demanda | Dependencias, privacidad, moderación y transacciones resueltas; no bloquean el núcleo |

Un responsable por archivo. Owner implementa interfaz; Backend contratos y persistencia; QA revisa regresiones/evidencia; coordinación integra y ejecuta únicamente CI remota. Ningún frente despliega o modifica proveedores por su cuenta.

## Primera entrega de código

1. Registry de mercados independiente de reglas federativas: país real, moneda manual, zonas IANA de sede y descripción de cobertura. España no equivale siempre a Europe/Madrid; México no tiene una zona deducida por defecto.
2. Bootstrap ES/MX con moneda y zona explícitas. Conservar el mismo hash de las solicitudes ES anteriores cuando los campos se omiten. El mismo intento conserva cuerpo y clave, aunque el usuario cambie el formulario después de una respuesta incierta.
3. Identidad deportiva MX general, vacía de reglamentos, sin utilizar perfiles ES. Si el esquema/permisos existentes no permiten representarla, documentar la dependencia y preparar un candidato incremental para revisión; no ampliar permisos ni aplicar SQL por inferencia.
4. Formularios con cobertura administrativa y limitaciones antes de finalizar. Los mercados aún no comprobados no se anuncian como disponibles. Solicitud asistida para otros países sin academia ficticia; no confundir un enlace de contacto con un embudo de captación persistido.
5. Catálogo compartible de propuestas: competiciones, captación y progreso. Disponibilidad, permisos, capacidad y contratación no son el mismo control. Una propuesta no tiene endpoint de ejecución deportiva ni comercial.
6. Señales estructuradas de exposición/apertura sin actor, deduplicadas por academia, y selección actual de interés por miembro/sede en una tabla propia. Retirar interés elimina la selección; no se guarda en auditoría inmutable. Nada de texto libre sensible, correos nuevos, sesión grabada, outbox de métricas o campañas automáticas. La medición permanece deshabilitada sin el esquema autorizado; leer una propuesta no depende de activarla.

Los cambios de esta primera entrega siguen pendientes de validación remota y aceptación alojada hasta que existan enlaces y evidencias del SHA exacto. Ningún PASS anterior se hereda como ejecución de código nuevo.

## Contratos y comportamiento internacional

- Administración: personas/familias/entrenadores, grupos/clases, inscripciones, asistencia, cuotas y pagos manuales.
- Especialización: aparato/conjunto, objetivo, progreso y ejercicio. Sin reglamento disponible se usa identidad general declarada; no categorías o títulos federativos inventados.
- Localización: idioma disponible, terminología, formato, moneda operativa y zonas por sede. País, federación y temporada son ejes distintos.
- Comercial: Starter 19 €/mes o 190 €/año; Growth 49 €/mes o 490 €/año, base sin IVA. Network acompañado. No se cambian importes ni se infiere un impuesto universal.
- La moneda manual de cuotas pertenece al contrato y permanece en cada importe histórico. El SaaS conserva su moneda comercial configurada. No convertir ni agregar EUR y MXN, ni presentar pagos manuales en pesos como factura fiscal mexicana.
- España y México son recorridos objetivo de aceptación. «Registry configurado», «prueba aislada» y «autoservicio alojado comprobado» son estados distintos. Países restantes: acceso asistido o piloto según capacidades verificadas.

## Datos, deporte y contenidos

Upgrade Gymnastics sirve como referencia interna de conceptos. Su aplicación con roster/localStorage no se integra como segundo censo. Revisar y adaptar el mapper existente al modelo canónico antes de importar. Nunca deducir equivalencias entre IDs legacy y canónicos.

Separar identidad de elemento, valores reglamentarios y recursos visuales. Procedencia, versión y revisión obligatorias. Primer paso de cualquier importación: informe sin escrituras e idempotencia por contenido. Sustituir imágenes no cambia progreso o ejercicios. Los recursos extraídos sin derechos acreditados no se publican; utilizar recursos propios, licenciados o neutrales.

El motor de ejercicios requiere revisión independiente de adyacencia en orden de ejecución, elementos computables, repeticiones, salidas, precisión, desconocidos y cobertura por paquete. Dificultad calculada, observación del entrenador y resultado oficial son cosas distintas. Las sugerencias no se basan únicamente en dificultad. Una corrección conserva autor, contexto, fecha e historial.

Desde el diseño, los módulos nuevos deben entrar en devolución, conservación y supresión. Archivo no equivale a borrado. La exportación parcial actual no se anuncia como devolución integral. No inventar plazos de conservación o mecanismos de restauración que todavía no estén implementados y probados.

## Ampliaciones que no bloquean el núcleo

- Captación: página del club → solicitud → prueba → lista de espera/oferta → inscripción, reutilizando familias/capacidad. Procedencia y seguimiento; comunicaciones revisables, sin envíos masivos automáticos.
- Eventos: descubrimiento local/nacional/internacional, organizador y delegaciones, individuales/conjuntos/equipos/entrenadores, pagos externos manuales, cupos transaccionales y actualizaciones. Invitados pueden usar academia Free completa. Datos mínimos compartidos expresamente con adultos; familias informadas mediante su club.
- Reputación: relación verificable, moderación, denuncia, respuesta y reclamación antes de reseñas de eventos, clubes o federaciones.
- Gamificación: objetivos personales y retos acordados con el entrenador. Sin rankings públicos de menores ni incentivos a dificultad peligrosa o ignorar descanso.
- Demanda: academia elegible expuesta → apertura distinta → necesidad/interés/piloto → uso repetido después del lanzamiento. Separar visitantes públicos de miembros y no equiparar registros internacionales con validación de mercado.

## Aceptación y pruebas

Comprobaciones pesadas siempre remotas; las alojadas solo en entregas autorizadas:

1. Registro, confirmación, recuperación, academia y logout; dos academias y dos sedes; permitidos y denegados por rol.
2. Familia/gimnasta → grupo/clase → inscripción → asistencia → cuota manual → pago → dashboard persistido.
3. Doble envío, concurrencia, recarga y respuesta perdida; rechazo sin registros operativos parciales.
4. Free 31/4/11, bloqueo por excedente y archivo hasta 30/3/10, conservando historial y desbloqueando.
5. ES/MX: monedas y zonas correctas, cambios horarios, fecha civil de sede frente a UTC y ausencia de valores ES heredados.
6. EUR/MXN manuales sin suma cruzada; contratación SaaS separada. País sin reglas: administración con limitación clara; país pendiente: acceso asistido sin academia ficticia.
7. Propuestas visibles, interés/retirada, alcance de API, deduplicación y ausencia de efectos comerciales/operativos.
8. Stripe test aislado: Checkout/Portal, firma, concesión única, cancelación, caducidad e impago. Rechazo inicial, caducidad de trial y agotamiento terminal no se sustituyen entre sí.
9. Interfaz esencial a 375, 768 y 1280 px, incluidos errores/vacíos.
10. Futuros catálogos: importación repetida, trazabilidad, reemplazo visual, reglas/cálculos revisados independientemente.

Reutilizar evidencia de código no afectado; no repetir por sistema el recorrido completo ante cada ajuste visual. Aceptación final sobre un SHA congelado con CI, revisión externa y GitGuardian del mismo SHA. Los jobs omitidos siguen omitidos.

## Apertura y límites

Versión técnicamente lista y apertura comercial son resultados distintos. Preparación productiva: configuración propia Auth/correo/base/permisos/TLS/Redis/observabilidad/recuperación; sin secretos, destinos u objetos sandbox. SQL incremental revisado y autorizado aparte; nunca aplicar el baseline a una base existente.

Publicación futura: build remoto con configuración productiva sin dominio público, comprobación y promoción del mismo artefacto, conservando el anterior. No activar cron, procesador global de métricas, Connect ni cobro automático familiar. Ante fallo crítico, detener y revertir únicamente aplicación cuando sea seguro; no deshacer datos automáticamente.

Live permanece cerrado hasta alta efectiva/datos fiscales publicables, reglas del asesor, textos contractuales finales y Stripe Live propio. Soporte humano: Elvis; asistencia de IA no sustituye a un suplente humano por confirmar. Primera contratación externa auténtica para verificar apertura comercial, sin compra propia simulada.

Siguiente paso: integrar la primera entrega, revisar diferencias, ejecutar CI remota y registrar SHA/evidencia. Después aceptar ES/MX y propuestas en entregas. Ninguna operación sobre producción, proveedores o ensayo forma parte de esta implementación por autorización implícita.
