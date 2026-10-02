# Directorio público — implementación y operación

Fecha: 2 de octubre de 2026. La funcionalidad del directorio y la búsqueda en el alta están integradas en `main`; el hardening de policies explícitas y su prueba están en PR #180.

## Hallazgos clave

1. Las fichas externas existen sin Auth, propietarios, memberships, trials ni suscripciones. No se modifica `owner_id` ni el ledger de academias.
2. Reclamar requiere correo confirmado y aprobación de Super Admin. Se eliminó la transferencia por coincidencia de correo. Los permisos del directorio no son roles del SaaS.
3. Las tablas privadas no están disponibles para `anon` ni `authenticated` a través de Supabase. La edición se autoriza por ficha en servidor y las decisiones se serializan por ficha.
4. RFEG y Perú ofrecen datos HTML preparables; Brasil enlaza calendarios PDF. Ninguna extracción publica fichas ni acredita derechos de reutilización.
5. Producción no se ha migrado ni activado. Todos los interruptores del directorio están apagados por defecto.

## Entregado

- Migración aditiva de once tablas y bucket privado, índices, restricciones y RLS. Retirada de proyecciones si se elimina el espacio operativo de origen.
- Proyección común de academias/eventos públicos existentes más fichas independientes. Las fichas vinculadas consultan la visibilidad y los datos públicos del espacio operativo en cada lectura.
- Alta manual, previsualización, publicación y retirada en `/super-admin/directorio`. Reclamaciones, transferencias, revocaciones, revisiones, fuentes, lotes, consentimientos y auditoría.
- Fichas, filtros, paginación, fuentes y última revisión. Enlaces antiguos preservados; nuevos enlaces UUID-slug y redirección permanente de nombres/fusiones.
- Registro específico de directorio sin crear perfiles operativos. `/directorio/mis-fichas`, solicitudes, edición habitual directa, revisión de campos sensibles, favoritos y propuestas.
- Activación del SaaS como alta expresa mediante onboarding existente. Cuenta y ficha se vuelven a comprobar dentro de la transacción. Un espacio existente requiere asistencia; no se crean duplicados ni se elevan roles silenciosamente.
- Importación CSV/JSON con hash idempotente, errores por fila, selección de campos públicos y revisión de posibles duplicados. Una referencia ya vinculada produce una propuesta; no sobrescribe cambios del representante.
- Adaptadores oficiales HTML con evidencia privada de extracción, referencias a PDF y red restringida: TLS, IP pública fijada, sin redirecciones, 2 MB y 15 segundos.
- Kit gratuito con ejemplos ficticios, descarga directa. Entrega opcional por correo con finalidad separada.
- Suscripciones por finalidad, confirmación explícita por POST, baja firmada, outbox con exclusión mutua, rebotes/reclamaciones y recuperación conservadora de resultados inciertos. Envío comercial explícitamente marcado exige consentimiento positivo confirmado.
- Cola de correos visible solo para Super Admin, sin acceso público. Un resultado incierto no se reenvía automáticamente: requiere consultar Brevo, confirmar que no aceptó el mensaje y guardar un motivo auditado; el mismo registro conserva su clave de idempotencia y no supera tres intentos.
- Calendario ICS para eventos confirmados: fecha sin hora conserva día completo; hora conocida conserva zona del recinto. Marcado estructurado sin precios inventados; sitemap dinámico y filtros sin indexación combinatoria.
- Imágenes opcionales requieren procedencia y licencia/autorización documentada; pasan por revisión sensible. Pruebas privadas no se suben sin aprobación del escáner de seguridad del archivo exacto.
- Retención extraordinaria de pruebas con motivo registrado, eliminación ordinaria a los 30 días y limpieza de archivos antiguos sin solicitud asociada.
- Invitación preparada para copiar; nunca se envía al importar. Medición de visitas, clics y descarga en el sistema existente; reclamación con identificador idempotente y sin correo/pruebas en analítica. No se deduce que un visitante sea una familia.

- Alta de propietario: búsqueda obligatoria de fichas públicas por nombre y país antes de crear un espacio, con localidad visible. Las coincidencias llevan a reclamación gratuita (solo con el flag de reclamaciones activo) o acceso al administrador existente. Si el catálogo está activo y las reclamaciones no, onboarding ofrece solicitar asistencia en vez de prometer una reclamación. El servidor vuelve a comprobar coincidencias exactas dentro de la transacción y bloquea el duplicado; no transfiere propietarios ni expone academias privadas. Cambiar nombre, país o localidad exige repetir la búsqueda.
- Activar la gestión desde una ficha reclamada vuelve a comparar nombre, país, región y localidad en el servidor, incluso dentro de la transacción. El espacio operativo adopta esos valores aprobados; no se puede cambiar la identidad pública saltándose la revisión de la ficha.
- Antes de activar, el servidor serializa las creaciones del mismo nombre y país y busca tanto fichas públicas alternativas como espacios operativos existentes. Si el posible duplicado es privado, solo devuelve una solicitud de revisión y no revela datos del otro espacio.

## Validación observada

- Suite web completa anterior a los últimos ajustes: **415 archivos, 1.867 pruebas aprobadas**; un archivo y tres casos omitidos.
- Suite focalizada anterior: **91 pruebas aprobadas en trece archivos**. Tras el ajuste de flags, las pruebas de onboarding, flujo de propietario y API de reclamación pasan **10/10**; el build local y TypeScript terminan correctamente.
- PostgreSQL aislado, ambas migraciones, dump/restauración y **61 comprobaciones de integración aprobadas**. La prueba SQL adicional verifica RLS, grants, proyección pública y denegaciones con roles anon/authenticated/service_role; el workflow de PR #180 la ejecuta automáticamente. CI de #180 sigue en curso.
- Onboarding en navegador local: búsqueda de una academia externa ficticia y enlace de reclamación visibles. El intento directo de crear la misma sede devuelve HTTP 409 `ACADEMY_ALREADY_LISTED`; la solicitud enviada queda pendiente sin permiso de edición concedido; las academias operativas permanecen en 6 y los permisos operativos en 12.
- Supabase local real y navegador: representante sin perfil operativo solicita; Super Admin aprueba; representante ve y edita; segundo representante no ve gestión y recibe HTTP 403 al intentar editar. Owner/admin/coach/parent/athlete reciben 403 en API de administración.
- Formulario de representante y Mis fichas: comprobación de ancho a 390 px y zoom CSS del 200 %, captura y navegación Tab. Esta comprobación **no** equivale a VoiceOver manual ni a todos los recorridos de accesibilidad del producto.
- Integridad: 7 migraciones Drizzle y 91 Supabase validadas; RLS estático y gates de lecturas/autorización/rutas aprobados.
- Storage real local: anónimo y cuenta ajena no pueden descargar ni firmar pruebas privadas; URL temporal de 60 segundos validada y archivo ficticio retirado.
- Páginas existentes por país: fichas externas filtradas por disciplina comprobadas en navegador, con URL conservada. Solicitud de demo y reintento comprobados mediante API local; un único evento de conversión con ID de ficha y sin datos personales.
- Proveedor de correo: pruebas con callback local controlado; **ningún correo real enviado**. Webhook Brevo implementado, configuración y prueba con el proveedor pendientes.

## Publicación gradual

Variables, todas `false` por defecto:

| Variable | Activa |
|---|---|
| DIRECTORY_ADMIN_ENABLED | Administración y mantenimiento |
| DIRECTORY_CATALOG_ENABLED | Lectores públicos nuevos y área de fichas |
| DIRECTORY_CLAIMS_ENABLED | Solicitudes de representación |
| DIRECTORY_IMPORTS_ENABLED | Revisión automática de fuentes autorizadas |
| DIRECTORY_COMMUNICATIONS_ENABLED | Suscripciones y envíos |

1. Respaldo del destino y prueba de restauración verificable. Aplicar mediante el procedimiento de migraciones del repositorio; no reparar el ledger para añadir fichas.
2. Activar administración; registrar fuentes y permisos. Preparar borradores y revisar publicación manualmente.
3. Activar catálogo y repetir el recorrido autenticado contra la versión desplegada.
4. Activar reclamaciones tras revisión de permisos y documentos. Configurar el escáner antes de ofrecer subida de archivos; pruebas por canal oficial escrito siguen disponibles.
5. Configurar secreto exclusivo `DIRECTORY_TOKEN_SECRET` (32 caracteres como mínimo), Brevo real, remitente/respuesta, webhook autenticado y prueba de baja/rebote. Solo entonces activar comunicaciones.
6. Activar importaciones programadas únicamente con autorización de fuente documentada. Cron `/api/cron/directory` ejecuta una vez al día (11:17 UTC), compatible con el plan Hobby existente, con autenticación y lease; sin flags no activa estos módulos.

Rollback inicial: apagar flags y volver a lectores anteriores. Conservar tablas y fichas para recuperación; no eliminar cuentas, academias ni propietarios.

## Lo que NO está cerrado

- Migración, despliegue y comprobación autenticada en producción: no realizados.
- Publicación inicial de 60 academias y 30 eventos revisados: no alcanzada. No se han publicado datos reales en esta entrega. Los 1.370 registros del CRM no son publicaciones verificadas.
- Autorización de reutilización de las tres fuentes, revisión jurídica por país y materiales gráficos: no acreditadas. El campo de autorización debe contener evidencia real, no una inferencia por ser una web pública.
- Extracción automática de los PDF de Brasil/OCR: los enlaces se descubren; la estructuración de sus contenidos sigue siendo revisión manual. Redes sociales: enlaces/propuestas manuales exclusivamente.
- Escáner de documentos y entrega real de correo/webhook: no configurados ni probados externamente.
- Avisos de reclamación, acciones masivas y vinculación asistida están implementados; avisos reales aún requieren configurar y validar el proveedor. Páginas existentes por país integradas con el directorio externo y lista visible. Nuevas páginas por localidad: condicionadas a contenido útil; no se han creado páginas vacías. El estado de reclamación ya se consulta en Mis fichas y el catálogo no promete esas funciones pendientes.
- Medición de solicitud y aprobación de reclamación, suscripción confirmada y activación SaaS con identificador idempotente incorporada. Solicitudes de demo atribuidas a una ficha y descargas desde ella incorporadas. Distinción de familias identificadas: no cerrada; audiencia desconocida permanece desconocida. Se informa únicamente de los eventos observados.
- Alta nueva por formulario del directorio comprobada contra Auth local: devuelve a la ficha y no crea perfil operativo. Activación expresa del SaaS comprobada en navegador: crea y vincula el espacio, conserva la URL de la ficha y el reintento reutiliza el vínculo. El formulario conserva nombre y ubicación de la ficha, con borrador separado por ficha. Confirmación real por correo, OAuth y regresión completa de destinos de todos los roles: pendientes. Las denegaciones de API no sustituyen esos recorridos.
- Revalidación de guardas de onboarding (2026-10-01): **34 pruebas focalizadas**, TypeScript, ESLint focal y `git diff --check` pasan. La integración PostgreSQL aislada verifica que la ficha reclamada se excluya a sí misma, que el bloqueo serialice altas del mismo nombre/país entre localidades y que las colisiones con academias operativas devuelvan solo una señal de revisión, sin revelar datos privados. Ningún cambio de esquema remoto, publicación ni activación de flags.
- VoiceOver manual sobre el build desplegado permanece diferenciado y pendiente por decisión anterior.
- El sandbox E2E recibió las dos migraciones mediante el historial nativo de Supabase. Su ledger aplicacional `zaltyko_schema_migrations` sigue en 45 entradas, hasta `20260805150000`; no registra las migraciones del directorio. No ejecutar allí `pnpm db:migrate:ledger --apply` hasta reconciliar el historial completo del sandbox.
- En producción, `directory_entries` aún no existe. El ledger aplicacional tiene 54 entradas hasta `20260913100000`; el historial nativo de Supabase tiene 48 y registra ocho migraciones posteriores con archivos locales, además de `harden_rls_search_paths` sin archivo local. No ejecutar el runner sobre producción hasta comparar ambos historiales y revisar las migraciones locales pendientes.
- Producción sigue sin migrar y con todos los flags apagados. La promoción requiere respaldo y restauración comprobables, más revisión de fuentes y jurisdicciones; la prueba local no sustituye esas condiciones.

## Fuentes y relevancia

- [RFEG](https://rfegimnasia.es/competiciones-nacionales/): candidatos HTML de competiciones; accionable para revisión, no publicación automática.
- [Federación Peruana](https://www.federaciongimnasia.com/calendario): tarjetas con fechas/recintos; ciudad desconocida permanece vacía y enlaces de entradas no se convierten en inscripción deportiva.
- [CBG](https://cbginastica.com.br/calendarios/126/calendarios): PDFs; la fecha de publicación del documento no es la fecha de una competición.
- [Google: eventos](https://developers.google.com/search/docs/appearance/structured-data/event): marcado condicionado a datos reales; no garantiza posicionamiento.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): acceso explícito y pruebas de denegación.
- [LSSI: publicidad](https://lssi.digital.gob.es/lssi/la-ley/aspectos-basicos/publicidad-en-internet): el contacto público no prueba autorización comercial. Los borradores de invitación requieren validar el canal antes de enviarse.

La vista previa de Vercel del commit `90979f5c` se desplegó correctamente con flags apagados; las comprobaciones de build, tipos, pruebas y permisos aprobaron. La primera vista previa fue rechazada por la frecuencia del cron en Vercel Hobby; se corrigió a una ejecución diaria. El navegador reveló y permitió corregir el envío innecesario a revisión por diferencias entre campos opcionales vacíos y ausentes.
