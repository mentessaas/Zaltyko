# Auditoría estática de la superficie de datos sensibles

Fecha: 2026-11-05  
Checkout examinado: Zaltyko-main-bridge-20261025  
HEAD: bd022b63499749ff0dce7e8338b53b0d57f54c77  
Alcance: fuente del candidato de release; no representa por sí sola main, un despliegue ni producción.

## Alcance y método

Lectura estática de formularios, rutas API, esquemas, persistencia, almacenamiento y telemetría. No se ejecutaron tests, builds, navegador, llamadas a proveedores ni consultas de cuentas/entornos. Los cambios previos de documentación legal y los demás archivos dirty quedaron intactos.

## Hallazgos

### 1. El flujo Owner canónico no recoge campos médicos dedicados

**Hallazgo — [VERIFICADO EN CÓDIGO]. Importancia: media.**  
El alta Owner activa envía organización, nombre, apellidos y vínculo familiar. El esquema Zod es estricto y solo admite esos campos. La edición de ficha Owner activa envía nombre y apellidos; su esquema de API también es estricto. En los formularios Owner inspeccionados no hay campos de alergias, lesiones, medicación, diagnóstico ni documento médico.

**Fuente:**  
- src/app/owner/athletes/page.tsx:58-68 conecta la página con OwnerAthleteIntakeWorkspace.
- src/components/owner-dashboard/OwnerAthleteIntakeWorkspace.tsx:611-619 construye el payload.
- src/modules/athletes/application/owner-athlete-intake.ts:53-60 define el esquema estricto.
- src/app/api/v1/owner/athlete-intake/route.ts:133-177 valida, autoriza y llama al servicio.
- src/components/owner-dashboard/OwnerAthleteProfileEditor.tsx:401-418, 496-528 muestra y envía solo nombre/apellidos.
- src/modules/athletes/application/owner-athlete-profile.ts:43-54 y src/app/api/v1/owner/athletes/[athleteId]/route.ts:39-46 restringen también el contrato de edición.

### 2. El dashboard anterior sí recoge la fecha de caducidad de un certificado médico

**Hallazgo — [VERIFICADO EN CÓDIGO]. Importancia: alta.**  
La página de licencias de /app monta CreateLicenseDialog. El campo opcional “Certificado médico” recoge una fecha, no el contenido del certificado; el mismo formulario admite además notas de texto libre. El cliente envía ambos valores a POST /api/licenses. La ruta valida el payload, exige tenant y relación de atleta, y guarda medicalCertificateExpiry y notes en federative_licenses. La fecha se muestra después en la página.

Este recorrido pertenece a la interfaz /app de licencias, no al alta de gimnasta del Owner canónico.

**Fuente:**  
- src/app/app/[academyId]/licenses/page.tsx:158-179 monta CreateLicenseDialog; :314-318 muestra la fecha.
- src/components/licenses/CreateLicenseDialog.tsx:111-130 crea el payload; :286-307 muestra fecha y notas.
- src/app/api/licenses/route.ts:14-28 define el esquema; :135-177 aplica withTenant y comprueba pertenencia; :193-214 escribe el registro.
- src/db/schema/federative-licenses.ts:8-27 contiene la fecha y las notas.

### 3. Existe un endpoint para subir certificados, pero no encontré el control de subida montado en la página actual

**Hallazgo — [VERIFICADO EN CÓDIGO; UI NO OBSERVADA COMO ACTIVA]. Importancia: alta si se habilita.**  
El tipo de documento incluye “Certificado Médico”. DocumentUploadModal permite elegir PDF o imagen y envía los bytes a POST /api/athletes/{athleteId}/documents/upload; luego envía los metadatos (tipo, fechas y notas) a POST /api/athletes/{athleteId}/documents. La primera ruta aplica withTenant y authorizeAthleteResource y escribe el archivo en el bucket uploads mediante el cliente de Supabase. La segunda aplica las mismas barreras de tenant/recurso y persiste metadatos en athlete_documents.

Sin embargo, AthleteDocumentsPage importa DocumentUploadModal pero no lo renderiza en su JSX; la página dice que se use un botón inferior que no aparece en su salida. AthleteDocumentsSection sí contiene el modal, pero no encontré consumidores de ese componente fuera de sí mismo. Por tanto, el selector de certificado y la subida no quedan demostrados como controles accesibles del producto actual. Las rutas API existen y siguen requiriendo autorización; esto no prueba que haya archivos médicos almacenados ni que el bucket esté configurado de una manera concreta.

**Fuente:**  
- src/types/athletes.ts:14-35 enumera medical_certificate y su etiqueta.
- src/components/athletes/DocumentUploadModal.tsx:73-109 envía archivo y metadatos; :145-190 muestra tipos y selector de archivo; :229-235 admite notas.
- src/app/app/[academyId]/athletes/[athleteId]/documents/page.tsx:9 y :84-130: import sin render del modal; texto de botón en :107-115.
- src/components/athletes/AthleteDocumentsSection.tsx:201-215 contiene una instancia del modal, sin uso externo observado.
- src/app/api/athletes/[athleteId]/documents/upload/route.ts:18-54 aplica autorización y validación; :72-82 sube bytes y devuelve la ruta.
- src/lib/supabase/storage-helpers.ts:16-28 selecciona Supabase Storage y el bucket uploads.
- src/app/api/athletes/[athleteId]/documents/route.ts:29-38 define metadatos; :81-105 valida alcance; :113-155 persiste.
- src/db/schema/athlete-documents.ts:15-56 define el tipo y los metadatos.

### 4. No observé formularios dedicados de alergias, lesiones o medicación; las coincidencias restantes son de configuración o presentación

**Hallazgo — [NO OBSERVADO en los formularios y rutas inspeccionados]. Importancia: media.**  
La coincidencia “injury/Lesión” está en el mapa de etiquetas del informe de bajas. La función que calcula ese informe usa motivos explícitos de metadatos o estados genéricos; no encontré un formulario de lesión ni escrituras a churn_reasons en src. La tabla conserva reason y notes genéricos, por lo que este análisis no permite afirmar que no haya filas históricas.

medicalCertificateRequired y documentsRequired aparecen en plantillas seed y en el esquema de configuración. No encontré un consumidor de runtime en src que los convierta en un formulario activo.

**Fuente:**  
- src/components/reports/ChurnReport.tsx:177-190 traduce el literal injury.
- src/lib/reports/churn-report.ts:196-224 infiere motivos desde metadatos/estado.
- src/db/schema/leak-profitability.ts:100-130 define la tabla genérica; src/app/api/reports/leaks/route.ts:106-109 la lee.
- src/db/seeds/templates/espana-ga.ts:166-167 y src/db/seeds/templates/espana-gr.ts:433-439 contienen requisitos de plantilla.
- src/db/schema/templates/template-license-config.ts:17-21 define configuración, sin consumidor activo observado.

### 5. El chat general puede transportar texto escrito por el usuario; no es un formulario médico

**Hallazgo — [VERIFICADO EN CÓDIGO; contenido médico NO OBSERVADO]. Importancia: media.**  
El compositor activo de mensajes envía texto libre al API; el servidor lo guarda y genera una notificación in-app y una notificación push cuyo cuerpo contiene los primeros 100 caracteres. Si una persona escribe voluntariamente un dato de salud, ese fragmento puede llegar al endpoint de push asociado a la suscripción. No observé captura de mensajes en el evento analítico: message_sent registra conversationId, messageId y si había adjunto. Este flujo pertenece al chat general, no al Owner ni a un campo clínico. La activación real de push y sus destinos no se verificó.

**Fuente:**  
- src/components/messages/MessageInput.tsx:11-15, 63-83 recoge texto libre.
- src/components/messages/MessagesPage.tsx:124-137 envía content.
- src/app/api/messages/conversations/[id]/messages/route.ts:28-34 valida texto genérico; :238-259 lo persiste y crea preview; :312-345 lo copia a notificaciones.
- src/lib/notifications/push-service.ts:181-200 serializa el payload y lo entrega a webPush.sendNotification.
- src/app/api/messages/conversations/[id]/messages/route.ts:348-356 muestra los campos del evento analítico.

### 6. Hay telemetría global sin un gate de consentimiento común; PostHog sí aplica opt-in

**Hallazgo — [VERIFICADO EN CÓDIGO; emisiones y configuración de despliegue NO VERIFICADAS]. Importancia: alta.**  
PostHog se inicializa tras consentimiento explícito, con autocapture y pageview automáticos desactivados. Los pageviews manuales pasan pathname, que en rutas privadas puede incluir IDs de academia/gimnasta. El filtro de nombres sensibles del outbox aplica a eventos de dominio que pasan por appendOutboxEvent; no es un filtro de contenido ni un gate global para todos los trackers.

El layout global monta Vercel Analytics y Speed Insights sin conectarlos al estado local de consentimiento. GoogleAdsTracking también se monta globalmente y configura gtag cuando existe NEXT_PUBLIC_GOOGLE_ADS_ID; isGoogleAdsEnabled solo comprueba ese ID. En ese árbol no aparece un gate de consentimiento/revocación compartido. Esto demuestra una diferencia técnica en el código, no que las claves estén configuradas ni que se haya emitido un evento en un despliegue.

Sentry tiene un control más restrictivo en la inicialización revisada: sendDefaultPii desactivado, sin breadcrumbs ni adjuntos y con sanitizer que reemplaza el detalle de errores/mensajes y elimina spans. La ruta de subida no pasa el cuerpo ni los bytes al logger. Esto reduce el riesgo de que el contenido del documento se incluya en eventos Sentry, pero no verifica ajustes de cuenta ni registros reales.

**Fuente:**  
- src/app/layout.tsx:10-17, 185-194 monta trackers en el layout global.
- src/components/PostHogProvider.tsx:13-48 exige consentimiento para inicializar y enviar pageviews.
- src/lib/analytics.ts:41-95 configura PostHog; :126-151 envía path; :203-230 envía IDs y metadatos tras consentimiento.
- src/components/GoogleAdsTracking.tsx:26-53 configura gtag sin leer el estado local de consentimiento.
- src/lib/google-ads.ts:22-36 habilita tracking solo según ADS_ID.
- src/modules/events/domain/domain-event.ts:3-5, 34-68 filtra ciertas claves en payloads de eventos de dominio; src/modules/shared/infrastructure/transactional-records.ts:82-107 lo aplica al outbox.
- src/lib/monitoring/sentry-privacy.ts:32-86; instrumentation.ts:31-61.
- src/app/api/athletes/[athleteId]/documents/upload/route.ts:83-92 no añade cuerpo ni bytes al logger.

## Límites de evidencia

**NO VERIFICADO:** despliegue o tráfico actual; valores de las claves/DSN; eventos recibidos por Vercel, Google, PostHog o Sentry; datos reales en tablas o Storage; política, región y permisos efectivos del bucket; proveedores concretos de push por endpoint; contratos y ajustes de retención de cuentas. No se accedió a proveedores ni a producción.

## Siguiente paso

Preparar un cambio separado y revisable que mantenga Vercel Analytics, Speed Insights y Google Ads en estado denegado por defecto hasta el consentimiento explícito y respete la revocación. Sin cambios de proveedor ni nuevas métricas. Evaluar aparte si se reactiva el modal de documentos y qué política de carga aplica a certificados médicos. No se hizo ninguna modificación de código en esta auditoría.

