# Embudo de captación canónico: ficha pública → solicitud de prueba → lista de espera → inscripción

Fecha: 10 de noviembre de 2026. Plan de mejora, P2 #15. Base: `origin/main` en `5a807f49`.

**Estado: activo en producción desde 12-11-2026.** El candidato `docs/deployment/candidates/20261110120000_admission_requests_candidate.sql` se aplicó ese día con autorización de Elvis; también está instalado en staging (`docs/deployment/staging.md`).

Esta nota describe qué hay hoy en el repositorio, qué falta para enlazar las cuatro etapas sin duplicar datos y el corte mínimo que se puede publicar. No incluye datos de mercado: ningún dato de esta nota procede de fuera del repositorio.

## Hallazgos

### H1. La ficha pública de academia no está abierta en el lanzamiento y no apunta al modelo canónico

- **Hallazgo:** hay dos fichas públicas y ninguna llega hoy a `zaltyko.*`.
  - `/academias/[id]` lee la tabla antigua `public.academies` (`getPublicAcademy`) y su formulario `ContactAcademyForm` escribe en `public.contact_messages` con aviso al propietario antiguo (`contactAcademy`). El corte de lanzamiento cierra `/academias` con un 404 real antes de que el App Router la pinte.
  - El directorio (`/directorio/organizaciones/[id]` y la rama `catalog` de `/academias/[id]`) lee `public.directory_entries`, solo se publica con la bandera `catalog` y enlaza a `/contact?type=demo` (captación de Zaltyko, no de la academia). `EntryDataSchema` admite un `organizationId` opcional, pero lo puede escribir quien propone la ficha y no está verificado contra la membresía canónica. Además, `directory_entries.academy_id` apunta a `public.academies`, no a `zaltyko.organizations`.
  - Las páginas de actor (`/a/[slug]`, `public.actor_pages`) siguen ligadas a `tenant_id`/`academy_id` antiguos y dependen de una bandera experimental.
  - `zaltyko.organizations` no tiene slug, ficha ni bandera de visibilidad pública.
- **Fuente:** `src/app/academias/[id]/page.tsx`, `src/app/actions/public/get-public-academy.ts`, `src/app/actions/public/contact-academy.ts`, `src/db/schema/contact-messages.ts`, `src/lib/launch/essential-routes.ts` (`isOutsideEssentialLaunch` incluye `/academias`), `src/app/directorio/organizaciones/[id]/page.tsx`, `src/lib/directory/contracts.ts:69`, `src/db/schema/directory.ts` (`directoryEntries.academyId`), `src/db/schema/actor-pages.ts`, `src/db/schema/zaltyko-core.ts:238` (`organizations`).
- **Importancia:** alta. Ninguna ficha pública puede dejar hoy una solicitud que la academia vea en `/owner`. Ligar el directorio a una academia canónica por un campo libre permitiría desviar datos de familias a otra academia.

### H2. Hay cuatro formas de «lead» y ninguna es la de una familia en `/owner`

- **Hallazgo:**
  - `public.leads` y `public.lead_interactions` guardan la captación **de Zaltyko** (academias que piden demo, plan o acceso asistido por país). Las alimentan `/api/contact` y `ContactForm`, con `submissionId` idempotente, honeypot y límite por IP. `leads.email` es único global: no sirve para familias de varias academias.
  - `public.lead_trials` y `public.lead_trial_outcomes` registran la clase de prueba de un posible alumno en el `/app/[academyId]/trials` antiguo (`withTenant`, `tenant_id`).
  - `public.academy_trials` y `src/lib/billing/trial-service.ts` son la prueba **del plan SaaS**, no una clase de prueba.
  - El acceso asistido por país (`market_access`) es otra variante de `/api/contact`.
- **Fuente:** `src/db/schema/leads.ts`, `src/db/schema/lead-interactions.ts`, `src/app/api/contact/route.ts`, `src/lib/growth/contracts.ts`, `src/db/schema/lead-trials.ts`, `src/app/api/lead-trials/route.ts`, `src/app/app/[academyId]/trials/page.tsx`, `src/db/schema/academy-trials.ts`.
- **Importancia:** media. Reutilizar `leads` mezclaría dos embudos con responsables distintos (Zaltyko frente a la academia) y una restricción de unicidad incompatible.

### H3. La prueba, la lista de espera y la inscripción canónicas existen en datos y servicios, pero solo la inscripción es alcanzable desde `/owner`

- **Hallazgo:**
  - Tablas canónicas: `zaltyko.trials`, `trial_status_history` y `trial_followups` (prueba ligada a gimnasta, sesión e inscripción `trial`); `zaltyko.waitlist_entries` y `waitlist_offers` (espera por clase o programa, con consentimiento de contacto del tutor); `zaltyko.enrollments` con `source` en `trial`, `waitlist`, `owner`…
  - Servicios: `bookTrial`, `transitionTrial`, `recordTrialFollowup` y `convertTrial` (`src/modules/trials/application/trial-service.ts`); `joinWaitlist`, `sendWaitlistOffer`, `acceptWaitlistOffer` y `expireWaitlistOffer` (`src/modules/waitlists/application/waitlist-service.ts`). `git grep` no encuentra ninguna llamada desde `src/app` ni `src/components`: solo los usan las pruebas.
  - Lo que sí se usa en `/owner`: el alta de gimnasta y la bandeja de altas (`/owner/athletes`, `api/v1/owner/athlete-intake`, `createOwnerAthleteIntake` y `assignOwnerAthleteToFirstGroup`), y las inscripciones (`/owner/enrollments`, `api/v1/owner/enrollments`, `createEnrollment`).
  - Todas exigen una gimnasta existente (`athlete_id not null`); `trials` exige además sesión e inscripción de prueba.
- **Fuente:** `src/db/schema/zaltyko-core.ts:1714` (`enrollments`), `:1940` (`trials`), `:2138` (`waitlistEntries`), `:2277` (`waitlistOffers`); `src/modules/athletes/application/owner-athlete-intake.ts`; `src/app/api/v1/owner/athlete-intake/route.ts`; `src/app/api/v1/owner/enrollments/route.ts`; `git grep -ln "joinWaitlist\|bookTrial\|convertTrial" -- src/app src/components` (sin resultados).
- **Importancia:** alta. Las etapas 3 y 4 ya están modeladas con versión, idempotencia, auditoría y outbox; no hay que crearlas otra vez. Lo que falta es la etapa anterior a la ficha de la gimnasta: una petición pública que todavía no es una gimnasta.

### H4. La lista de espera antigua y la de eventos son de otro dominio

- **Hallazgo:** `public.class_waiting_list` (con `promote-waiting-list.ts` y `/api/class-waiting-list`) y la espera de eventos (`/api/events/[id]/waitlist`) cuelgan de `tenant_id`/`academy_id` antiguos. Se migran con P2 #18, no con este embudo.
- **Fuente:** `src/db/schema/class-waiting-list.ts`, `src/lib/classes/promote-waiting-list.ts`, `src/app/api/class-waiting-list/route.ts`, `src/app/api/events/[id]/waitlist/route.ts`.
- **Importancia:** baja para este corte; evita reutilizar la tabla equivocada.

### H5. Los dos proyectos estáticos captan academias para Zaltyko, no familias para una academia

- **Hallazgo:**
  - `zaltyko-waitlist-funnel-20261015` es una landing comercial («Crear academia gratis», «¿Varias sedes o ayuda para migrar desde Excel?») que manda al registro en autoservicio o al contacto de Zaltyko.
  - `zaltyko-academy-direct-capture-20261016` pide nombre, email y academia opcional, y reenvía a `https://zaltyko.com/api/contact` mediante `api/contact.js`. Ese proxy limita el cuerpo a 8 KB, responde 503 fuera de producción («No se ha enviado ningún dato») y conserva la atribución UTM. Su `gracias/` dice «no te hemos inscrito en una lista de emails».
  - Ambos alimentan H2 (`leads`/`lead_interactions`), es decir, la parte alta del embudo B2B.
  - Lo que se reutiliza aquí son patrones, no datos: honeypot, identificador de envío idempotente, consentimiento en una línea con enlace a la política, desactivación en previsualizaciones, mensajes que no prometen correos y una página de agradecimiento sin lista de correo.
- **Fuente:** `/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/zaltyko-waitlist-funnel-20261015/index.html`; `/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/zaltyko-academy-direct-capture-20261016/{index.html,app.js,api/contact.js,gracias/index.html}` (solo lectura, sin cambios).
- **Importancia:** media. «Integrar los proyectos de captación» no significa volcar sus datos en `zaltyko.*`: son embudos distintos con responsables distintos. El de la familia es de la academia, que es la responsable del tratamiento; Zaltyko lo trata por encargo.

### H6. Infraestructura reutilizable para el formulario público y la bandeja

- **Hallazgo:**
  - Límite de peticiones: `rateLimit`, `getClientIdentifier` y `getAddressHashRateLimitIdentifier`, más el límite global del middleware para mutaciones en `/api/*`.
  - Origen: `hasSameOrigin`.
  - Autorización: `resolveOwnerScope`, con roles de gestión y sedes de la persona (`member_location_scopes`).
  - Pista en el Resumen: «Necesita tu atención» (`getOwnerAttentionItems` y `OwnerAttentionPanel`).
  - DDL que requiere autorización: el patrón del repositorio son los candidatos de `docs/deployment/candidates/`, comprobados en PostgreSQL desechable por `scripts/ci/verify-sandbox-schema-replay.sh` y detectados en ejecución con `to_regclass` (por ejemplo `product-discovery.ts`, que responde «no disponible» si falta la tabla).
  - Interés previo: el catálogo de descubrimiento ya mide la función `club-acquisition` («De la web a la inscripción»).
- **Fuente:** `src/lib/rate-limit.ts`, `middleware.ts`, `src/modules/saas-billing/application/owner-access.ts`, `src/modules/owner-dashboard/application/owner-scope.ts`, `src/modules/owner-dashboard/application/attention-items.ts`, `docs/deployment/candidates/README.md`, `src/modules/product-discovery/application/product-discovery.ts`, `src/modules/product-discovery/domain/feature-catalog.ts:28`.
- **Importancia:** alta. El corte se puede construir sin infraestructura nueva y con el mismo método de control del DDL.

## Qué falta para enlazar las cuatro etapas sin duplicar datos

1. **Un registro previo a la gimnasta.** Ni `trials` ni `waitlist_entries` admiten una persona que todavía no es gimnasta. Crear `people`/`athletes` desde un formulario anónimo llenaría la plantilla real de fichas no verificadas y de datos de menores. Hace falta una tabla canónica pequeña, `zaltyko.admission_requests`, que guarde solo la petición y los enlaces a lo canónico cuando se convierta. Es la única pieza nueva de datos: la gimnasta, la lista de espera y la inscripción siguen viviendo en sus tablas.
2. **Una entrada pública que la academia controla.** Como `organizations` no tiene ficha (H1), la entrada mínima es un enlace de solicitud que la academia activa, desactiva o regenera desde `/owner`. El enlace lleva un token aleatorio, no el id de la academia: sin activarlo nadie puede enviarle solicitudes. Ligar el directorio o `/academias` exige un vínculo verificado (reclamación aprobada de la ficha a la academia canónica), no el `organizationId` libre de la ficha.
3. **Conversión que reutiliza lo canónico, en una sola transacción.**
   - Etapa 2 → 4: `createOwnerAthleteIntakeInTx` crea la ficha y la familia, y la gimnasta entra en la bandeja de altas, donde `assignOwnerAthleteToFirstGroup` o `/owner/enrollments` la inscriben.
   - Etapa 2 → 3: además, `joinWaitlistInTx` la apunta en la espera de una clase. El servicio lo admite y está probado, pero ni la interfaz ni la ruta HTTP (`ownerTrialRequestConvertRouteSchema`) aceptan este destino hasta que exista una vista de la lista de espera en `/owner`: hoy ninguna pantalla lee `waitlist_entries`.
   - Bloqueo de la academia, `FOR UPDATE` de la solicitud, alta, espera, actualización y auditoría van en la misma transacción. Si un paso falla no queda ninguna ficha huérfana.
   - La solicitud solo guarda los identificadores resultantes (`converted_athlete_id`, `waitlist_entry_id`).
4. **Una bandeja en `/owner`** filtrada por academia y sede, más un contador en «Necesita tu atención».
5. **Fuera del corte, para más adelante:**
   - una vista de la lista de espera en `/owner` y, con ella, el destino «Lista de espera» en la bandeja;
   - reservar una sesión de prueba (`bookTrial`) desde la solicitud;
   - ofrecer plaza (`sendWaitlistOffer`) y la aceptación por la familia;
   - copiar al tutor y sus contactos a `guardians`/`guardian_contacts` con consentimiento;
   - avisos por correo;
   - retención automática (hoy la supresión es manual);
   - el vínculo verificado con el directorio.

## Corte mínimo publicable (implementado en esta PR)

| Pieza | Qué hace | Archivo |
|---|---|---|
| Tablas candidatas | `zaltyko.admission_links`: enlace por academia (general o de una sede), con un token de 128 bits, activado o desactivado, quién lo creó y la fecha de revocación. `zaltyko.admission_requests`: academia, sede, enlace, persona adulta, email, teléfono opcional, solo el nombre de pila de la gimnasta, año de nacimiento opcional, comentario corto, versión y fecha del consentimiento, estado, enlaces a gimnasta y lista de espera, fecha de supresión y revisión. Las dos con RLS forzada y sin permisos para `anon`/`authenticated`. Hasta el 12-11-2026 **requerían autorización de Elvis** y no estaban aplicadas; ese día se aplicaron en producción. | `docs/deployment/candidates/20261110120000_admission_requests_candidate.sql` |
| Detección en ejecución | Si alguna tabla no existe o no tiene RLS forzada, la página pública responde 404, la API responde 503 y la bandeja muestra «Pendiente de activar». | `src/modules/admissions/application/admission-storage.ts` |
| Página pública | `/solicitar-prueba/[token]`, sin indexar. Solo muestra el nombre de la academia y las sedes activas del enlace. Un token desconocido, desactivado o revocado da el mismo 404. | `src/app/solicitar-prueba/[token]/page.tsx` |
| API pública | `POST /api/public/trial-requests` con `linkToken`: mismo origen, Zod estricto, honeypot, consentimiento obligatorio, envío idempotente por `submissionId`. Límites por IP, por email (hash) y por enlace (`trial-requests:link:<id>`, 30 por hora; si alguien agota el cupo, regenerar el enlace da uno limpio). Un token que no resuelve o unos datos inválidos no gastan cupo del enlace. Responde igual a un token desconocido, desactivado o revocado. | `src/app/api/public/trial-requests/route.ts` |
| Bandeja `/owner` | `/owner/requests` («Solicitudes»): lista por sede y estado; activar, desactivar o regenerar el enlace (regenerar conserva el estado: un enlace desactivado sigue desactivado); marcar como contactada o descartada; pasar a inscripción; eliminar los datos personales de una descartada. | `src/app/owner/requests/page.tsx`, `src/components/owner-dashboard/OwnerTrialRequestsWorkspace.tsx` |
| API `/owner` | `GET /api/v1/owner/trial-requests`; `POST …/links`; `POST …/[requestId]/status`; `POST …/[requestId]/convert`; `POST …/[requestId]/anonymize`. | `src/app/api/v1/owner/trial-requests/**` |
| Atención | «Necesita tu atención» cuenta las solicitudes nuevas de las sedes visibles. Si las tablas no existen, no aparece. | `src/modules/owner-dashboard/application/attention-items.ts` |

Reglas del corte:

- **Autorización.**
  - Ver y cambiar el estado: dirección, administración y coordinación (`resolveOwnerScope`, superficie de gestión), solo en sus sedes. El entrenador no entra.
  - Gestionar el enlace y convertir: dirección o administración con todas las sedes. Convertir reutiliza el alta de gimnasta, que exige ese alcance.
  - Eliminar datos personales: dirección o administración con todas las sedes, como el enlace y la conversión.
  - Toda lectura y escritura filtra por `organization_id` y `location_id` en SQL, no solo en la interfaz. Cada cambio queda en `audit_log`.
- **Datos de menores.** Solo el nombre de pila y, si se quiere, el año de nacimiento. No se piden apellidos, fecha completa, salud ni foto. Los apellidos los pone la academia al convertir. El comentario avisa de que no se incluyan datos de salud.
- **Supresión.** «Eliminar datos personales» sustituye nombres y email, borra teléfono, año y comentario, y conserva el registro (fecha, sede, estado y auditoría). Solo en solicitudes descartadas; no se puede reabrir después.
- **Correo.** No se envía nada. El punto de enganche queda documentado en `admission-requests.ts` (después de la inserción, evento `admission_request.received`) y desactivado.
- **Sin cobros.** Ni Stripe ni Connect. Al convertir no se crea inscripción ni cuota: solo la ficha y la familia.
- **Pruebas PostgreSQL.** `tests/admission-requests-pg.test.ts` no se ejecuta en ningún CI todavía. No se ha añadido a `scripts/ci/verify-sandbox-schema-replay.sh`, porque ese script y `supabase/schema-snapshot-manifest.json` son un contrato protegido. Queda pendiente de ejecutar en schema-replay cuando Elvis lo autorice.

## Importancia

Es la pieza que convierte Zaltyko en algo que trae familias a la academia, no solo en un registro interno, y encaja con el plan Fundadores sin coste. El corte respeta tres límites:

- no crea fichas de menores desde formularios anónimos;
- no duplica gimnastas, esperas ni inscripciones;
- no cambia la base de datos sin autorización.

Mientras Elvis no aprobó el candidato, el código quedó inactivo y lo decía en pantalla. Desde el 12-11-2026 está activo en producción.

## Siguiente paso

1. Elvis revisa y, si procede, autoriza el candidato `20261110120000_admission_requests_candidate.sql` (hash en la PR) y el destino. También autoriza ejecutar las pruebas PostgreSQL en el replay de esquema. La CI verde no equivale a autorización. *12-11-2026: candidato autorizado y aplicado en producción. Las pruebas PostgreSQL siguen fuera del replay de esquema.*
2. Tras aplicarlo, prueba manual en un entorno de ensayo. *12-11-2026: en staging se probaron las solicitudes; este documento no detalla qué pasos de la lista se recorrieron.*
   - compartir el enlace;
   - enviar una solicitud;
   - verla en «Necesita tu atención»;
   - activar, desactivar y regenerar el enlace;
   - convertirla a inscripción;
   - eliminar los datos de una descartada.
3. Pendientes, por orden:
   - el vínculo verificado entre el directorio y la academia canónica, para poner el botón «Solicitar prueba» en la ficha;
   - la reserva de sesión de prueba con `bookTrial`;
   - el aviso por correo a la academia, con autorización de envíos;
   - la copia del tutor a `guardians` con su consentimiento;
   - la vista de lista de espera en `/owner`, para volver a ofrecer ese destino;
   - la retención automática (propuesta: suprimir los datos de las descartadas a los 90 días, pendiente de decisión legal).
