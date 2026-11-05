# Lote de cierre e integración — 5nov2026

## Estado

Preparado tras revisar los fallos del candidato `527d4c2d`. Este documento describe el cambio; no convierte revisión estática en ejecución ni en publicación. Los resultados remotos se registrarán por SHA exacto en la evidencia de entrega. La preview conserva `64dc9381` hasta completar gates y revisión externa.

## Cambios y comprobaciones previstas

| Área | Cambio concreto | Comprobación |
|---|---|---|
| TypeScript | Presupuesto de4GB también en los dos pasos standalone; callback PostHog rechaza null | CI principal e aislada, sin sustituir un build por el otro |
| Inbox | Selector de prueba acotado a solicitudes guardadas | Unitarias; no cambia permisos ni persistencia |
| Cuotas | Prueba PostgreSQL real de factura que mezcla EUR/MXN: total y moneda nulos, emisión rechazada | Runner aislado incluye el caso; snapshots de ocho tablas en ambas academias, sin registros parciales |
| Personal | Directorio canónico sin acceso digital, Owner activo con alcance all | Contratos, HTTP con mocks, PostgreSQL desechable y navegador; no incluye invitaciones o asignaciones |
| Recuperación de personal | Journal exacto y Web Locks por academia; replay manual, recibo original separado de lectura actual | Recarga sin POST, misma clave/cuerpo, conflicto CAS, doble pestaña y denegaciones tras incertidumbre |
| Privacidad | Tracking público opcional cerrado, atribución del alta descartada hasta disponer de contrato de consentimiento | Cliente, receptor404 sin body/DB y alta compatible con payload legado; hitos esenciales sin UTM |
| Contacto | UUID opaco por solicitud explícita, no por visita | Replay idéntico sin ID persistente, solicitudes intencionales nuevas con IDs nuevos |
| Alta internacional | Textos públicos distinguen administración ES/MX de fiscalidad y contratación SaaS | Contrato de catálogo y metadatos; sin nuevos mercados o cobros habilitados |

## Personal: alcance que se ofrece

- Crear personas/perfiles sin `member_id`, listar activos/archivados, editar nombres no compartidos, archivar y reactivar conservando IDs e historial.
- No crea cuentas Auth, membresías, permisos, invitaciones, acceso de entrenador ni asignaciones por sesión/sede. Personas compartidas con atletas/tutores no se editan desde este flujo.
- Cada edición conserva la versión del borrador al abrirlo. Refrescar la lista no actualiza silenciosamente esa versión ni autoriza sobrescribir cambios de otro Owner.
- Auditoría/outbox y recibos no guardan nombres en claro. El hash de comando y los identificadores tienen finalidad de idempotencia y no se presentan como datos anónimos.
- La exportación parcial existente ya incluye `people` y `staff_profiles`. Esto no la convierte en devolución integral ni implementa supresión o recuperación selectiva.

## Límites de verificación y apertura

Las pruebas PostgreSQL usan exclusivamente bases desechables en GitHub y fixtures sintéticas. Las pruebas de rutas con mocks no acreditan RLS; los navegadores locales del runner no acreditan una sesión alojada de entregas. Los jobs omitidos se enumeran por separado.

El ensayo de backup/restauración es otra rama experimental, sin incorporación automática a los procedimientos productivos. Su resultado no sustituye Auth/Storage alojado, recuperación selectiva ni preparación de copias reales.

No hay SQL alojado nuevo, cambios de proveedores, activación Live, producción, ensayo, builds/tests/servicios/instalaciones en Mac o despliegue implícito. Los borradores contractuales pendientes quedan fuera del lote. La revisión GitHub externa del SHA final y la aceptación incremental en entregas siguen siendo necesarias.

Para abrir a clientes siguen separados: preparación técnica, condiciones y datos del vendedor, reglas fiscales aprobadas, soporte operativo, configuración propia de Stripe Live y primera contratación auténtica externa. Ningún resultado de CI habilita por sí solo esos requisitos.

## Navegador: aceptación incremental de Personal

Nuevo tercer caso con registro, consentimiento y bootstrap de una academia sintética propia en Supabase local del runner. La primera creación se envía de verdad con `route.fetch()`, se exige201 y se aborta únicamente la respuesta visible. Se comparan cuatro snapshots hash/count tras commit, recarga sin POST y replay manual exacto; se preservan Auth users, membresías, scopes e invitaciones. Auditoría y outbox se consultan con la clave persistida `staff_` + SHA256 de la clave HTTP. No es un stub de éxito ni una escritura alojada.

El primer freeze33c636c2 no incluía geometría responsive ni el lifecycle posterior de Personal en navegador. El siguiente candidato amplía ese mismo caso: una edición concurrente real cambia V1 a V2, el borrador V1 sigue enviando V1 y recibe409 sin cambios en los snapshots ni historial; después se edita con la versión actual, archiva y reactiva conservando identidad, acceso e historial. Añade geometría375/768/1280 con formulario abierto y navegación. La revisión independiente del delta fue estática; la ejecución remota de estas aserciones sigue pendiente. El recorrido histórico conserva href, visibilidad, click y URL del enlace Plan y abre Más antes de buscarlos.

## Fallos medidos y correcciones del primer lote

El SHA33c636c2 ejecutó CI principal41961261801 e aislada41961272235. Ambas unitarias:5615PASS/1FAIL/6skip; el único fallo es el pin antiguo del runner después de añadir la suiteStaff. Se actualizan el pin del runner en el manifiesto y el pin secundario del manifiesto en el generador de propuesta, conservando el anterior como histórico. Snapshot, seed y SQL candidato permanecen sin cambios.

Typecheck y build terminaron con4TS2339 en el acceso a current.command del reintento, porque invalid|unavailable compartían una variante de objeto. Se separan en dos variantes discriminadas: no hay casts, JS ni eliminación de guards. El presupuesto4GB evitó el OOM anterior, pero esa observación no se presenta como un build aprobado.

Chromium y Firefox fallaron en la aserción del enlacePlan antes de abrir el menúMás; el locatorporrole no incluye el contenido cerrado. Se mueve la apertura antes de las aserciones manteniendo href, visibilidad, click y URL. Contacto y Personal quedaron omitidos por serial y no cuentan como ejecución. PostgreSQL desechable127027954074 terminóSUCCESS; su salida de éxito es agregada y no publica recuentos individuales. WebKit terminó con la misma causa Plan y dos casos omitidos; los tres navegadores requieren repetir las pruebas exactas. El recibo de Personal añade overflow-wrap:anywhere para permitir envolver UUID y versión larga sin alterar su contenido. Los nuevos deltas requieren otra ejecución exacta completa.
