# Contrato de encargado del tratamiento (art. 28 RGPD) — Zaltyko

> **Borrador generado por IA, no es asesoramiento jurídico; requiere revisión por abogado o servicio jurídico antes de publicarse.**
>
> - Estado: BORRADOR PARA VALIDACIÓN. No está publicado ni se ofrece a ninguna academia.
> - Versión propuesta: `encargo-tratamiento-v1` (borrador del 13-11-2026).
> - Los datos del titular van como marcadores: `[NOMBRE Y APELLIDOS DEL TITULAR]`,
>   `[NIF DEL TITULAR]`, `[DOMICILIO PROFESIONAL]`. Se completan con los datos de
>   `src/lib/launch/commercial-launch-profile.ts` cuando estén aprobados.
> - Los textos entre corchetes con «PROPUESTA» son plazos o decisiones que no
>   salen del código ni de un documento firmado: el abogado o Elvis deben fijarlos.
> - Las afirmaciones técnicas del Anexo II citan el archivo del repositorio del
>   que salen. Lo que no se ha podido comprobar está marcado «NO VERIFICADO».

---

## Forma de aceptación (nota para quien revise, no forma parte del contrato)

Hoy los Términos (§6) dicen que el DPA se firma «solicitándolo a hola@zaltyko.com».
Se propone que este contrato se incorpore como anexo de los Términos y se
acepte electrónicamente en el registro de la academia (la misma casilla que ya
registra la versión aceptada en `zaltyko.owner_signup_consents.policy_version`),
con opción de firmar una copia si la academia lo pide. El art. 28.9 RGPD admite
el formato electrónico. Hay que validar que una casilla en el registro basta
como «acto jurídico» vinculante para el responsable.

---

## Partes

**Responsable del tratamiento («la Academia»)**: [DENOMINACIÓN DE LA ACADEMIA],
con NIF/CIF [NIF/CIF DE LA ACADEMIA] y domicilio en [DOMICILIO DE LA ACADEMIA],
representada por [NOMBRE DEL REPRESENTANTE], en calidad de [CARGO], que es la
persona que crea la cuenta de la academia en Zaltyko o la administra como
propietaria («owner»).

**Encargado del tratamiento («Zaltyko»)**: [NOMBRE Y APELLIDOS DEL TITULAR],
persona física que ejerce como empresario individual (autónomo) en España, con
NIF [NIF DEL TITULAR] y domicilio profesional en [DOMICILIO PROFESIONAL], que
presta el servicio bajo el nombre comercial «Zaltyko». Contacto:
hola@zaltyko.com.

## Cláusula 1. Objeto

1.1. Este contrato regula el tratamiento de datos personales que Zaltyko realiza
por cuenta de la Academia al prestarle el servicio de software como servicio
(SaaS) descrito en los Términos y condiciones de Zaltyko (gestión de familias,
gimnastas, grupos, clases, inscripciones, asistencia, cuotas con registro
manual de pagos y funciones relacionadas).

1.2. La Academia decide los fines y medios esenciales del tratamiento de los
datos que introduce o recoge mediante la plataforma y es su responsable. Zaltyko
los trata únicamente como encargado y conforme a este contrato.

1.3. Quedan fuera de este contrato los datos que Zaltyko trata como
responsable (por ejemplo, los datos de facturación de la suscripción, la cuenta
del titular de la academia como cliente o la seguridad de la plataforma), que se
rigen por la Política de privacidad de Zaltyko.

## Cláusula 2. Duración

2.1. Este contrato entra en vigor cuando la Academia lo acepta y dura mientras
la Academia tenga una cuenta en Zaltyko, sea cual sea su plan (Free, Starter,
Growth o Network), incluida la prueba gratuita.

2.2. Al terminar, se aplica la cláusula 10 (devolución y supresión). Las
obligaciones de confidencialidad y las relativas a los datos que Zaltyko deba
conservar bloqueados por ley siguen vigentes después de la terminación.

## Cláusula 3. Naturaleza y finalidad del tratamiento

3.1. Naturaleza: recogida (a través de los formularios y de las importaciones
que realiza la Academia), registro, organización, estructuración, conservación,
consulta, modificación, comunicación por transmisión a los usuarios que la
Academia autoriza, envío de notificaciones y correos por cuenta de la Academia,
exportación, supresión y copia de seguridad.

3.2. Finalidad: prestar a la Academia las funciones de la plataforma que tenga
activas y el soporte técnico asociado. Zaltyko no usará los datos para fines
propios, no los venderá, no los usará con fines publicitarios y no elaborará
perfiles individuales de gimnastas por su cuenta.

3.3. Las métricas agregadas de la academia (por ejemplo, el «health score» o los
«insights» del panel del propietario) se calculan para la propia Academia y, según
`docs/privacy/zaltyko-rgpd-assessment.md`, no incluyen nombres, contacto, salud
ni notas de menores. La regla individual `athlete_retention_risk` está en estado
`draft` y no se activará sin una evaluación de impacto (EIPD) y sin acuerdo
previo con la Academia.

## Cláusula 4. Categorías de interesados y de datos

4.1. Interesados:

| Categoría | Observaciones |
| --- | --- |
| Gimnastas | Muchos son **menores de edad**. |
| Familias, tutores legales y pagadores | Madres, padres, tutores y otras personas de contacto o que pagan cuotas. |
| Entrenadoras, entrenadores y personal de la Academia | Incluye a quienes tienen acceso a la plataforma con un rol. |
| Personas interesadas en una clase de prueba o en lista de espera | Datos que llegan por los formularios públicos de la Academia. |

4.2. Categorías de datos (según el modelo de datos del repositorio):

| Categoría | Ejemplos | Fuente en el código |
| --- | --- | --- |
| Identificación | nombre, apellidos, nombre preferido | `src/db/schema/zaltyko-core.ts` (`people`) |
| Fecha de nacimiento y categoría de edad | fecha de nacimiento, categoría calculada | `people.date_of_birth`, `athletes.dob` y `age_category` (esquema anterior) |
| Contacto de familias | correo, teléfono, relación con el gimnasta | `guardian_contacts`, `guardians`, `family_contacts` |
| Relación familiar y pagadores | familia, tutores, quién paga | `families`, `family_guardians`, `family_payers` |
| Actividad deportiva | grupos, clases, inscripciones, asistencia, nivel, aparato, evaluaciones técnicas, resultados de competición | `enrollments`, `attendance_records`, `athlete_assessments`, `competition_results` |
| Económicos | cuotas, cargos, pagos registrados manualmente, devoluciones | `charges`, `payments`, `refunds`, `invoices` (esquema `zaltyko`) |
| Documentos de gimnastas | documento de identidad, partida de nacimiento, licencia federativa, seguro, autorizaciones, fotografía y **certificado médico** | `src/db/schema/athlete-documents.ts`, `src/types/athletes.ts` |
| Licencias federativas | número, validez y **fecha de caducidad del certificado médico** | `src/db/schema/federative-licenses.ts`, `src/components/licenses/CreateLicenseDialog.tsx` |
| Notas de entrenadoras | texto libre | `src/db/schema/coach-notes.ts` |
| Personal | nombre, contacto, rol, sede, foto y biografía opcionales | `organization_members`, `staff_profiles`, `coaches` |
| Datos técnicos de uso | identificador de usuario, rol, registros de auditoría | `audit_log`, `audit_logs` |

4.3. **Datos de salud (categoría especial, art. 9 RGPD). Hallazgo del código**:
el modelo canónico (`zaltyko.people`, `zaltyko.athletes`) **no** tiene campos de
salud. Pero el producto **sí permite** tratar datos de salud en dos sitios:

- La sección de documentos del gimnasta permite subir un archivo de tipo
  «Certificado Médico» (`medical_certificate` en `src/types/athletes.ts`,
  ruta `src/app/api/athletes/[athleteId]/documents/route.ts`, guardado en
  Supabase Storage con URL firmada).
- Las licencias federativas guardan la fecha de caducidad del certificado médico
  (`medicalCertificateExpiry`). Por sí sola es un dato poco revelador, pero
  indica que existe un reconocimiento médico.
- Además, hay campos de texto libre (notas de entrenadoras, notas de documentos)
  en los que la Academia podría escribir datos de salud, y el informe de bajas
  contempla el motivo «Lesión» (`injury` en `src/components/reports/ChurnReport.tsx`,
  tabla `churn_reasons`; no se ha localizado en el código un formulario que lo
  escriba).

No se ha verificado si la sección de documentos y la de licencias (rutas
`/app/[academyId]/…`, esquema anterior) están accesibles en producción.

Redacción propuesta para el contrato, a elegir por el abogado:

- **Opción A (si se mantiene la subida de certificados médicos)**: «La Academia
  podrá almacenar en la plataforma certificados médicos de aptitud deportiva y la
  fecha de su caducidad. Son datos de salud (art. 9 RGPD). La Academia
  garantiza que cuenta con una excepción del art. 9.2 RGPD que le permite
  tratarlos y que solo subirá los certificados que necesite para la práctica
  deportiva o la tramitación de licencias. Zaltyko aplicará a estos archivos las
  medidas del Anexo II y no los tratará para ningún otro fin.»
- **Opción B (si se retira la función)**: «La plataforma no está diseñada para
  tratar datos de salud. La Academia se compromete a no introducir datos de salud
  en campos de texto libre ni en documentos adjuntos.» (Exige retirar antes el
  tipo de documento `medical_certificate` y el campo de caducidad del certificado.)

En ambos casos conviene añadir: «La Academia no introducirá en campos de texto
libre datos de salud, diagnósticos ni lesiones de gimnastas».

## Cláusula 5. Obligaciones de la Academia (responsable)

La Academia se compromete a:

a) Contar con una base jurídica válida para cada tratamiento y haber informado a
los interesados (arts. 13 y 14 RGPD), incluido que usa a Zaltyko como proveedor.

b) Obtener, cuando la base sea el consentimiento, el de los gimnastas mayores de
14 años o el de sus padres o tutores si son menores de 14 años (art. 7 LOPDGDD).

c) Configurar los roles y accesos de su personal con el mínimo privilegio
necesario y retirar el acceso a quien deje de necesitarlo.

d) Introducir solo los datos necesarios (minimización) y mantenerlos exactos.

e) Atender las solicitudes de derechos de los interesados, con la asistencia de
Zaltyko prevista en la cláusula 6.5.

f) Dar a Zaltyko instrucciones conformes con la normativa.

## Cláusula 6. Obligaciones de Zaltyko (encargado)

### 6.1. Instrucciones documentadas

Zaltyko trata los datos solo siguiendo instrucciones documentadas de la
Academia. Son instrucciones documentadas este contrato, los Términos y las
acciones que la Academia realiza en la plataforma (altas, importaciones,
envíos, exportaciones, bajas). Si Zaltyko considera que una instrucción infringe
la normativa, lo comunicará de inmediato a la Academia (art. 28.3 RGPD, último
párrafo). Si una ley de la UE o de un Estado miembro obliga a Zaltyko a tratar
datos, informará antes a la Academia salvo que la ley lo prohíba.

### 6.2. Confidencialidad

Zaltyko garantiza que las personas autorizadas a tratar los datos se han
comprometido a respetar la confidencialidad o están sujetas a una obligación
legal de confidencialidad. A fecha de este borrador, el servicio lo opera el
titular sin empleados; si se incorpora personal o colaboradores, firmarán un
compromiso de confidencialidad antes de acceder a datos.

El acceso del titular a los datos de una academia (por ejemplo, mediante las
funciones de «súper admin» del código, `src/app/(super-admin)/…`) se limita a
soporte, resolución de incidencias y seguridad, y queda registrado cuando la
plataforma lo permite. **Pendiente de verificar**: que todas las acciones de
súper admin generen registro de auditoría.

### 6.3. Seguridad (art. 32 RGPD)

Zaltyko aplica las medidas técnicas y organizativas descritas en el Anexo II,
que tienen en cuenta que se tratan datos de menores. Podrá actualizarlas siempre
que no reduzcan el nivel de seguridad.

### 6.4. Subencargados

a) La Academia otorga una **autorización general** para que Zaltyko recurra a
los subencargados del Anexo III.

b) Zaltyko avisará a la Academia por correo electrónico, a la dirección del
propietario de la cuenta, con al menos [PROPUESTA: 30 días] de antelación antes
de añadir o sustituir un subencargado. La Academia puede oponerse por motivos
razonables relacionados con la protección de datos en ese plazo. Si no se llega
a una solución, la Academia podrá resolver el contrato y, si había pagado por
adelantado, recuperar la parte proporcional del periodo no consumido.

c) Zaltyko impondrá a cada subencargado, mediante contrato, las mismas
obligaciones de protección de datos que este contrato y responde ante la
Academia del cumplimiento del subencargado (art. 28.4 RGPD).

d) La lista vigente del Anexo III se publicará en [PROPUESTA: una página pública
de zaltyko.com, por ejemplo `/subencargados`] con su fecha de actualización.

### 6.5. Asistencia en el ejercicio de derechos

a) La plataforma permite a la Academia consultar, rectificar y dar de baja los
datos de gimnastas, familias y personal, y descargar los datos operativos de la
academia en un archivo JSON («Descargar datos operativos», en Plan:
`src/components/owner-dashboard/OwnerAcademyDataExport.tsx`). Con esas funciones,
la Academia puede atender la mayoría de solicitudes de acceso, rectificación y
portabilidad.

b) Si un interesado se dirige directamente a Zaltyko, Zaltyko trasladará la
solicitud a la Academia en un plazo de [PROPUESTA: 5 días hábiles] y no la
responderá por su cuenta salvo instrucción de la Academia.

c) Para lo que no se pueda hacer desde la plataforma (por ejemplo, la supresión
completa de una persona en todas las tablas y copias, o la entrega de archivos
adjuntos), Zaltyko asistirá a la Academia a petición, en un plazo que permita
cumplir el mes del art. 12.3 RGPD.

### 6.6. Asistencia en seguridad, EIPD y consultas previas

Zaltyko ayudará a la Academia, teniendo en cuenta la información de que dispone,
a cumplir los arts. 32 a 36 RGPD: le facilitará la descripción de medidas del
Anexo II, la lista de subencargados y la información técnica que necesite para
una evaluación de impacto o una consulta previa.

### 6.7. Violaciones de seguridad (brechas)

a) Zaltyko notificará a la Academia, sin dilación indebida y **en un plazo máximo
de [PROPUESTA: 48 horas]** desde que tenga conocimiento, cualquier violación de
seguridad que afecte a sus datos, para que la Academia pueda notificar a la
AEPD dentro de las 72 horas del art. 33 RGPD.

b) La notificación incluirá, en la medida en que se conozca: la naturaleza de la
violación, las categorías y el número aproximado de interesados y registros
afectados, un punto de contacto, las consecuencias probables y las medidas
adoptadas o propuestas. Si no se conoce todo a la vez, se facilitará por fases.

c) Zaltyko no notificará a la AEPD ni a los interesados en nombre de la
Academia salvo que esta se lo pida por escrito.

d) **Pendiente**: no existe en el repositorio un procedimiento escrito de
respuesta a brechas (está en la lista «Gate previo a datos reales» de
`docs/privacy/zaltyko-rgpd-assessment.md`).

### 6.8. Registro de actividades

Zaltyko mantendrá el registro de las categorías de actividades de tratamiento que
efectúa por cuenta de sus clientes (art. 30.2 RGPD).

### 6.9. Delegado de protección de datos

Zaltyko no ha designado delegado de protección de datos. [PROPUESTA: el
abogado debe confirmar que no es obligatorio según el art. 37 RGPD y el art. 34
LOPDGDD, teniendo en cuenta el volumen de datos de menores.] Contacto para
cuestiones de protección de datos: hola@zaltyko.com.

### 6.10. Auditorías e inspecciones

a) Zaltyko pondrá a disposición de la Academia la información necesaria para
demostrar el cumplimiento de este contrato (art. 28.3.h RGPD), en primer lugar
mediante este documento, el Anexo II, la lista de subencargados y respuestas
por escrito a cuestionarios razonables.

b) Si eso no basta, la Academia (o un auditor obligado a confidencialidad que no
sea competidor de Zaltyko) podrá realizar una auditoría con un preaviso de
[PROPUESTA: 30 días], como máximo una vez al año salvo brecha o requerimiento
de una autoridad, en horario laboral y sin acceder a datos de otros clientes.
Cada parte asume sus costes [PROPUESTA: a validar].

c) Zaltyko **no tiene hoy certificaciones** (ISO 27001, ENS, SOC 2 u otras) y
no debe afirmarse lo contrario. Los proveedores del Anexo III tienen sus
propias certificaciones, que se citan solo por remisión a su documentación.

## Cláusula 7. Transferencias internacionales

7.1. La base de datos y el almacenamiento de archivos de la plataforma están en
la Unión Europea (Supabase, región `eu-north-1`, Estocolmo) y las funciones de
servidor se ejecutan en la región `arn1` de Vercel (Estocolmo), según
`vercel.json`.

7.2. Algunos subencargados son empresas con matriz en Estados Unidos o pueden
acceder a datos desde fuera del Espacio Económico Europeo (por ejemplo, para
soporte o por su red de distribución). En esos casos, Zaltyko solo recurrirá a
ellos si la transferencia está amparada por una decisión de adecuación
(incluido el Marco de Privacidad de Datos UE-EE. UU. para empresas
certificadas) o por cláusulas contractuales tipo de la Comisión Europea, con
las medidas complementarias que procedan (arts. 44 a 46 RGPD). El Anexo III
indica el mecanismo previsto para cada uno y si está verificado.

7.3. Zaltyko no activará integraciones con proveedores situados en países sin
decisión de adecuación (ver Anexo III, apartado C) sin avisar antes a la
Academia conforme a la cláusula 6.4.

## Cláusula 8. Datos de menores

8.1. Las partes reconocen que la plataforma trata de forma habitual datos de
menores. Zaltyko no se dirigirá a menores por iniciativa propia; solo les enviará
comunicaciones (por ejemplo, invitaciones de acceso o avisos de asistencia) cuando
la Academia lo ordene mediante la plataforma.

8.2. La Academia es responsable de decidir si los gimnastas menores tienen
acceso propio a la plataforma y de recabar, en su caso, el consentimiento de
sus padres o tutores.

8.3. Zaltyko mantendrá las decisiones de minimización descritas en
`docs/privacy/zaltyko-rgpd-assessment.md` (métricas agregadas, sin perfilado
individual de menores sin EIPD).

## Cláusula 9. Responsabilidad

Cada parte responde de los daños que cause por incumplir este contrato o el RGPD
según el art. 82 RGPD. [PROPUESTA: el abogado debe decidir si el límite de
responsabilidad de los Términos (§8, importe pagado en los últimos 12 meses) se
aplica también a este contrato. Un límite muy bajo frente a datos de menores
puede ser difícil de defender, y con una academia en plan Free el límite
sería cero.]

## Cláusula 10. Fin del encargo: devolución y supresión

10.1. **Devolución**. Antes de cerrar su cuenta, y durante [PROPUESTA: 30 días]
desde la terminación, la Academia podrá descargar sus datos con la función
«Descargar datos operativos». Límites actuales de esa exportación, según
`src/modules/data-rights/application/catalog.ts` y
`src/modules/data-rights/application/canonical-academy-return.ts`:

- formato JSON con manifiesto, sumas de verificación y lista de exclusiones;
- cubre el esquema canónico `zaltyko` (organización, sedes, personas, gimnastas,
  familias, tutores, grupos, clases, sesiones, inscripciones, asistencia,
  pruebas, listas de espera, tarifas, facturas internas, cargos, pagos y
  devoluciones);
- **no incluye** los archivos de Supabase Storage (documentos de gimnastas,
  fotos) ni las tablas del esquema anterior (`public`), donde están, entre
  otras, los documentos y las licencias federativas;
- tiene límites de tamaño (20 000 filas, unos 3,5 MB de respuesta).

Por eso el contrato debe decir: «Lo que no cubra la exportación automática
(archivos adjuntos y datos de módulos anteriores) se entregará a la Academia, si
lo pide, en un formato estructurado de uso común en un plazo de [PROPUESTA: 30
días]».

10.2. **Supresión**. Pasado el plazo de devolución, Zaltyko suprimirá los datos
de la Academia de la base de datos y del almacenamiento en un plazo de
[PROPUESTA: 30 días] y lo certificará por escrito si la Academia lo pide. Las
copias de seguridad se eliminan al vencer su ciclo de retención
([PROPUESTA: indicar el plazo real del plan de Supabase contratado — NO
VERIFICADO]). Hasta entonces quedan aisladas y solo se usarían para restaurar
el servicio.

**Hallazgo**: hoy no existe en el código un proceso automático de supresión de
una academia. `plan-canonical-academy-disposition.ts` solo genera un plan de
revisión y declara que «ninguna entidad es elegible para borrar». La supresión
sería manual y debe documentarse antes de firmar este compromiso.

10.3. **Conservación bloqueada**. Zaltyko solo conservará datos tras la
terminación cuando una ley de la UE o de España lo exija, bloqueados y
durante el plazo legal.

10.4. **Paso a Free**. Cancelar una suscripción de pago no termina este
contrato: la Academia pasa al plan Free y sus datos se conservan (si supera
los límites de Free, en modo solo lectura, según
`src/modules/saas-billing/application/organization-usage.ts`). El contrato
termina cuando la Academia cierra su cuenta o Zaltyko la da de baja conforme a
los Términos.

## Cláusula 11. Modificación, ley aplicable y jurisdicción

11.1. Zaltyko podrá actualizar este contrato para adaptarlo a cambios normativos
o del servicio, con un aviso de [PROPUESTA: 30 días] al propietario de la
cuenta. Los cambios que reduzcan la protección de los datos requieren
aceptación expresa.

11.2. Este contrato se rige por el RGPD, la Ley Orgánica 3/2018 (LOPDGDD) y el
resto de la legislación española. [PROPUESTA: jurisdicción; si la Academia es
consumidora, se respeta la de su domicilio.]

11.3. En caso de contradicción entre este contrato y los Términos en materia de
protección de datos, prevalece este contrato.

---

## Anexo I. Descripción del tratamiento

| Elemento | Contenido |
| --- | --- |
| Responsable | La Academia cliente |
| Encargado | [NOMBRE Y APELLIDOS DEL TITULAR] (Zaltyko), NIF [NIF DEL TITULAR] |
| Objeto | Prestación del servicio SaaS Zaltyko |
| Duración | Mientras exista la cuenta de la Academia más el plazo de devolución y supresión |
| Naturaleza | Ver cláusula 3.1 |
| Finalidad | Ver cláusula 3.2 |
| Interesados | Ver cláusula 4.1 |
| Datos | Ver cláusula 4.2; datos de salud según la opción elegida en 4.3 |
| Ubicación principal | UE: Supabase `eu-north-1` (Estocolmo) y Vercel `arn1` (Estocolmo) |
| Subencargados | Anexo III |

## Anexo II. Medidas técnicas y organizativas

Solo se listan medidas que aparecen en el código o en la documentación del
repositorio. Las marcadas «NO VERIFICADO» están descritas como requisito, pero
no hay evidencia de que funcionen en producción.

### A. Control de acceso y aislamiento entre academias

| Medida | Evidencia |
| --- | --- |
| Autenticación de usuarios con Supabase Auth; contraseñas guardadas como hash por el proveedor | Política de privacidad §2 y §8; `@supabase/ssr` |
| Roles por academia: `owner`, `manager`, `admin`, `coach`; estados `invited`, `active`, `suspended`, `revoked` | `src/db/schema/zaltyko-core.ts` (`member_role`, `member_status`) |
| Alcance por sede: un rol puede quedar limitado a sedes concretas | `member_location_scopes`; `docs/security/zaltyko-threat-model.md` |
| Aislamiento por academia: cada tabla lleva `organization_id`/`tenant_id`, la pertenencia se resuelve por `user_id` y no por el identificador de la URL; claves foráneas compuestas impiden mezclar academias | `docs/security/zaltyko-threat-model.md` |
| Row Level Security (RLS) en PostgreSQL, forzada en el esquema canónico; tablas sensibles sin permisos para el rol `authenticated`, escrituras solo desde el servidor | `docs/security/zaltyko-threat-model.md`, `supabase/rls*.sql`, migraciones |
| Documentos de gimnastas en almacenamiento privado, servidos con URL firmada y limitados a la ruta de la academia y del gimnasta | `src/app/api/athletes/[athleteId]/documents/route.ts` |
| Limitación de peticiones (rate limit) global con Upstash/Vercel KV | `src/lib/rate-limit.ts` (`@vercel/kv`), `.env.example` (`KV_REST_API_URL`) |

### B. Cifrado

| Medida | Evidencia |
| --- | --- |
| Cifrado en tránsito (HTTPS/TLS) entre navegador y plataforma | Servicio en Vercel con HTTPS; Política de privacidad §8 |
| Conexión TLS a la base de datos con certificado de confianza | `.env.example` (`DATABASE_CA_CERT_PATH`, `certs/supabase-root-ca.crt`) |
| Cifrado en reposo de la base de datos y del almacenamiento | Lo ofrece el proveedor (Supabase/AWS) según su documentación — NO VERIFICADO en este repositorio |

### C. Trazabilidad y minimización

| Medida | Evidencia |
| --- | --- |
| Registro de auditoría append-only e historial inmutable en el esquema canónico | `zaltyko.audit_log`; `docs/security/zaltyko-threat-model.md` |
| Regla de diseño: no registrar en logs datos personales, tokens ni webhooks completos | `docs/security/zaltyko-threat-model.md` |
| Métricas e «insights» agregados, sin nombres ni datos de contacto de menores | `docs/privacy/zaltyko-rgpd-assessment.md` |
| Motivos de sustitución de entrenadoras con códigos cerrados para no registrar datos de salud | `src/modules/coach-assignment/domain/coach-assignment.ts` |
| Monitorización de errores (Sentry) sin grabación de sesiones | `instrumentation-client.ts` (`replaysSessionSampleRate: 0`) |
| Analítica de producto (PostHog, Vercel Analytics) solo con consentimiento y solo en páginas públicas | `src/lib/analytics.ts`, `src/components/OptionalTelemetryBoundary.tsx` |

### D. Disponibilidad y recuperación

| Medida | Evidencia |
| --- | --- |
| Copias de seguridad de la base de datos | Las ofrece Supabase según el plan — plazo NO VERIFICADO |
| Procedimiento de copia y restauración aislada cifrada | `docs/runbooks/zaltyko-backup-restore.md` — **ningún restore ejecutado todavía**; RPO 24 h / RTO 8 h propuestos, NO VERIFICADOS |

### E. Organizativas

| Medida | Estado |
| --- | --- |
| Acceso a producción limitado al titular | Declarado; NO VERIFICADO en este repositorio |
| Compromiso de confidencialidad para colaboradores | Pendiente (cláusula 6.2) |
| Procedimiento de respuesta a brechas | **Pendiente** |
| Procedimiento de derechos y verificación de identidad | **Pendiente** |
| Cuadro de conservación y borrado, incluidas copias | **Pendiente** |

### F. Lo que hoy NO existe y no debe afirmarse

- Certificaciones propias (ISO 27001, ENS, SOC 2).
- Autenticación multifactor en la plataforma (no se ha encontrado en el código).
- Pruebas de penetración, pruebas E2E autenticadas contra el entorno remoto y
  rotación de secretos verificada (`docs/security/zaltyko-threat-model.md`,
  «Riesgo residual que bloquea prepiloto»).
- Supresión automática de una academia al terminar el contrato.

## Anexo III. Subencargados y proveedores

Leyenda de «Verificado»: **Sí** = comprobado en el repositorio; **Parcial** = el
proveedor está en el código pero la región o el contrato no se han comprobado;
**No** = depende de la configuración de producción, que no se ha revisado.

### A. Subencargados (tratan datos de las academias)

| Proveedor | Servicio | Datos | Ubicación declarada | Mecanismo de transferencia | Verificado |
| --- | --- | --- | --- | --- | --- |
| Supabase Inc. | Base de datos, autenticación y almacenamiento de archivos | Todos los de la cláusula 4 | UE, `eu-north-1` (Estocolmo), según el contexto facilitado por Elvis | Matriz en EE. UU.: posible acceso de soporte desde fuera del EEE; DPA del proveedor con cláusulas tipo o Marco de Privacidad — a confirmar | Parcial (la región no consta en el repositorio) |
| Vercel Inc. | Alojamiento de la aplicación y ejecución de funciones | Todos los que pasan por la aplicación (en tránsito) y logs técnicos | Funciones en `arn1` (Estocolmo), red de distribución global | Matriz en EE. UU.; DPA del proveedor — a confirmar | Parcial (`vercel.json` fija `arn1`) |
| Upstash Inc. (vía Vercel KV) | Limitación de peticiones | Identificadores técnicos (usuario, IP o clave de límite) | Región elegida al crear la base — NO VERIFICADA | A confirmar | No |
| Brevo (Sendinblue SAS, Francia) | Envío de correos por cuenta de la academia: invitaciones, avisos de asistencia, notificaciones de eventos, informes | Nombre y correo del destinatario y contenido del mensaje | UE según el proveedor — a confirmar | No aplica si todo queda en la UE | Parcial (`src/lib/email/email-service.ts`) |
| Functional Software Inc. (Sentry) | Monitorización de errores | Datos técnicos de errores; pueden incluir identificadores | Depende del DSN (región UE o EE. UU.) — NO VERIFICADO | A confirmar | No |
| Hostinger | Buzón hola@zaltyko.com (soporte) | Lo que la academia envíe por correo al soporte | A confirmar | A confirmar | No |

### B. Proveedores condicionales (en el código, se activan por configuración)

Hay que confirmar en Vercel cuáles están activos en producción. Si alguno lo
está y trata datos de academias, pasa a la tabla A.

| Proveedor | Función en el código | Activación | Observación |
| --- | --- | --- | --- |
| PostHog | Analítica de producto en páginas públicas, con consentimiento | `NEXT_PUBLIC_ENABLE_POSTHOG`, `NEXT_PUBLIC_POSTHOG_HOST` | Si no se configura host, el código usa `https://app.posthog.com` (**EE. UU.**). Recomendable usar la instancia UE. |
| Vercel Analytics y Speed Insights | Métricas de uso y rendimiento | `NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS`, `NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS` | Con consentimiento |
| Twilio Inc. | Envío de WhatsApp desde la academia | `TWILIO_*` (`src/lib/whatsapp.ts`) | EE. UU.; trataría teléfonos y mensajes de familias |
| Stripe (Connect) | Cobros en línea a familias | `STRIPE_CONNECT_WEBHOOK_SECRET`, `src/app/api/stripe/connect` | Los Términos dicen que los pagos de familias se registran a mano. Si se activa, hay que definir si Stripe actúa como subencargado o como responsable independiente. |
| Web Push (servicios de notificación del navegador) | Notificaciones push | `VAPID_*` | Los envía el navegador a través de Google, Apple o Mozilla |

### C. Proveedores de riesgo alto si se activan

| Proveedor | Función | Riesgo |
| --- | --- | --- |
| MiniMax (`api.minimax.io`) | Asistente de IA del panel y traducciones (`src/lib/ai/client.ts`, `src/app/api/ai/communication/chat/route.ts`, `src/lib/i18n/translate.ts`) | Solo se usa si existe `MINIMAX_API_KEY`. Las preguntas al asistente pueden contener datos de gimnastas. Es un proveedor con sede fuera del EEE y sin decisión de adecuación conocida: **no activar con datos reales sin análisis de transferencia, contrato y aviso a las academias**. |

### D. Proveedores de Zaltyko como responsable (no son subencargados de las academias)

| Proveedor | Uso | Datos |
| --- | --- | --- |
| Stripe Payments Europe Ltd. | Cobro de la suscripción SaaS | Razón social, NIF, dirección, correo y medio de pago del cliente |
| n8n | Automatización de facturación (de `invoice.paid` a la factura) | Datos de facturación del cliente — dónde está alojado: NO VERIFICADO |
| FacturaDirecta | Emisión de facturas completas (serie ZA) | Datos de facturación del cliente |
