# Glosario de la interfaz

Fecha: 9 de noviembre de 2026. Plan de mejora, P2 #21.

Este glosario fija un término por concepto en la interfaz canónica `/owner`, la web pública y los correos. Antes de escribir una cadena visible, búscala aquí. Si un concepto falta, añádelo a este archivo en la misma PR que lo estrena.

## Cómo se eligió

Para cada concepto se contaron las apariciones de cada variante en `src/app/owner` y `src/components/owner-dashboard` sobre `origin/main` (`0dfcab6e`), con `git grep -P` y sin distinguir mayúsculas. El recuento excluye las líneas de comentario e `import` y las coincidencias pegadas a `-`, `_`, `/` o `.`, que suelen ser rutas, clases o identificadores. Las cifras son aproximadas: miden el uso en el código, no en pantalla. Cuando hubo empate, decidieron los títulos, la navegación y el riesgo legal o de promesa; cada caso lo indica.

Recuento antes y después de esta PR:

| Elegido | Antes | Después | Variante retirada | Antes | Después |
|---|---|---|---|---|---|
| Inscripción | 58 | 60 | matrícula | 1 | 0 |
| Clase | 72 | 73 | entrenamiento (como unidad de horario) | 3 | 0 |
| Gimnasta | 55 | 56 | atleta | 1 | 0 |
| Cuota | 24 | 52 | factura | 25 | 2 (\*) |
| Resumen | 13 | 18 | dashboard (visible) | 2 | 0 |
| Academia | 81 | 83 | organización (visible) | 2 | 0 |
| Pasar lista / pase de lista | 7 | 7 | registrar asistencia (como acción) | 1 | 0 |

(\*) Las dos que quedan hablan de las facturas del plan SaaS en Stripe, que sí son facturas. Aparte, `OwnerMonthlyInvoiceResolutionPanel.tsx` conserva dos «operación de facturación» que esta PR no puede tocar (ver Pendientes).

Para repetir el recuento, cambia `T` por la variante (expresión regular de Perl) y `REV` por la revisión:

```bash
T='cuotas?' REV=origin/main; git grep -h -i -P "$T" "$REV" -- src/app/owner src/components/owner-dashboard \
  | T="$T" perl -CSD -ne 'BEGIN{my $s=$ENV{T}; utf8::decode($s); $p=qr/(?<![\p{L}\-_\/.])(?:$s)(?![\p{L}\-_\/.])/i}
      next if m{^\s*(//|\*|/\*|import )}; $n++ while /$p/g; END{print $n+0, "\n"}'
```

## Términos

### Academia
- **Elegido:** academia, la cuenta cliente de Zaltyko. Es la palabra de los datos, el plan, el registro y los textos legales.
- **Admitido:** «club», en tono cercano y en segunda persona, como en «Tu club», «Hoy en el club» o «Nombre en el club». No sirve para nombrar la cuenta en contratos, planes ni errores.
- **Prohibido:** organización (salvo en código), escuela, gimnasio, centro deportivo.
- **Dónde aparece:** metadatos de `/owner`, `OwnerSetupForm`, `/owner/setup`, `TeamInvitationAcceptance` («Academia» sustituye a «Organización») y la web pública.

### Sede
- **Elegido:** sede, cada instalación física de la academia. Una academia tiene una o varias.
- **Prohibido:** ubicación, local, centro, sucursal o instalación como sinónimo de sede. «Ubicación» sí vale para la dirección de un evento o el mapa del directorio, porque no es una sede.
- **Dónde aparece:** selector de sede, `OwnerEnrollmentCreateForm`, `OwnerStaffManager`, invitaciones de equipo y P1 #8 («Pasar lista por sede»).

### Grupo
- **Elegido:** grupo, el conjunto de gimnastas por nivel o modalidad («Base 3 GAF»).
- **Prohibido:** equipo (está reservado al personal), categoría como sinónimo de grupo, y «grupo de entrenamiento».
- **Dónde aparece:** navegación (Grupos), `OwnerGroupsManager`, planes («3 grupos»).

### Clase
- **Elegido:** clase, la actividad recurrente con horario, sede y plazas («Clases recurrentes»).
- **Prohibido:** entrenamiento como unidad del calendario, turno, horario como sinónimo de clase. «Entrenamiento» sí vale para la actividad deportiva en general («planificación del entrenamiento»).
- **Dónde aparece:** navegación (Clases), `OwnerClassesManager`, `/owner/classes`.

### Sesión
- **Elegido:** sesión, cada ocurrencia fechada de una clase («17:30 – 19:00, hoy»). Se pasa lista sobre una sesión.
- **Prohibido:** entrenamiento, clase o turno para una fecha concreta.
- **Dónde aparece:** `OwnerTodaySessionsPanel`, `OwnerAttendanceManager`, `OwnerClassesManager` («calendario de sesiones»).

### Gimnasta
- **Elegido:** gimnasta, de género común («la gimnasta», «los gimnastas activos»).
- **Prohibido:** atleta, alumno o alumna, deportista.
- **Dónde aparece:** navegación (Gimnastas), «Alta de gimnasta», métricas del Resumen («Gimnastas activos»), web pública, ayuda y correos.

### Ficha
- **Elegido:** ficha, el registro de una gimnasta.
- **Prohibido:** perfil de atleta, expediente.
- **Dónde aparece:** `OwnerAthleteProfileEditor`, `OwnerAthleteArchiveEditor`.

### Familia y tutor
- **Elegido:** familia, la unidad que agrupa gimnastas y personas adultas. Tutor es la persona adulta vinculada; «persona responsable» o «persona pagadora» cuando importa el papel.
- **Prohibido:** padres como genérico, acudiente, apoderado.
- **Dónde aparece:** `OwnerAthleteFamilyAssociationEditor`, `OwnerGuardianProfileEditor`, cuotas mensuales.

### Portal de familias
- **Elegido:** portal de familias, el espacio de solo lectura en `/familia` donde un tutor consulta el horario, la asistencia y las cuotas de sus gimnastas. La portada se titula «Tu familia».
- **Prohibido:** app de padres, zona de padres, área de clientes. Tampoco «pagar» ni «pago online»: el portal solo informa y repite que «El pago se gestiona directamente con tu academia».
- **Dónde aparece:** `/familia`, `/familia/gimnastas/[id]`, `/familia/cuotas` y `docs/producto/portal-familias.md` (P2 #16).

### Inscripción
- **Elegido:** inscripción, el vínculo de una gimnasta con una clase o un grupo, con su tarifa y su estado.
- **Prohibido:** matrícula. Tampoco «alta» para la inscripción: «alta» es crear la ficha de una gimnasta.
- **Dónde aparece:** navegación (Inscripciones), `OwnerEnrollmentsManager` («La inscripción queda pendiente»), `OwnerClassesManager` («No se crean inscripciones ni cobros»).

### Asistencia, pasar lista y pase de lista
- **Elegido:** «Asistencia» es la sección y el registro guardado. «Pasar lista» es la acción. «Pase de lista» es el sustantivo de la acción.
- **Prohibido:** tomar lista, tomar asistencia, marcar asistencia o registrar asistencia como nombre de la acción, y check-in.
- **Dónde aparece:** navegación (Asistencia), botón «Pasar lista» de `OwnerTodaySessionsPanel`, rótulo «Pase de lista» de `OwnerAttendanceManager`, `TeamInvitationAcceptance`, ayuda pública («¿Cómo se pasa lista?») y catálogo público («Pase de lista»).

### Tarifa
- **Elegido:** tarifa, el precio mensual configurado para una inscripción.
- **Prohibido:** precio de clase o mensualidad para referirse a la tarifa.
- **Dónde aparece:** `OwnerEnrollmentCreateForm` («Tarifa mensual»).

### Cuota
- **Elegido:** cuota (mensual), el importe que una familia debe en un periodo por sus inscripciones. Se emite, queda pendiente y se salda con pagos registrados a mano.
- **Prohibido:** factura, mensualidad o recibo para referirse a la cuota de una familia. Zaltyko no emite facturas fiscales a familias.
- **Decisión:** el recuento estaba empatado (24 frente a 25). Ganó «cuota» porque ya la usaban el título de la pantalla («Emitir cuota mensual»), la navegación («Cuotas mensuales»), las alertas («cuotas vencidas») y la web, y porque «factura» promete un documento fiscal que no existe.
- **Dónde aparece:** `/owner/monthly-invoices`, `OwnerMonthlyInvoiceWorkspace`, `OwnerMonthlyInvoicesManager`, `OwnerAttentionPanel` y la home pública.

### Pago y Cobros
- **Elegido:** pago, el dinero recibido que se registra a mano. «Cobros» es la sección donde se registran.
- **Prohibido:** cobro automático, cargo o domiciliación como funciones existentes. No hay cobro a familias a través de Zaltyko.
- **Dónde aparece:** navegación (Cobros), `/owner/payments` («Registrar un pago recibido»).

### Plan, suscripción y facturación
- **Elegido:** plan, la modalidad contratada de Zaltyko (Free, Starter, Growth, Network). «Suscripción» y «facturación» solo describen el cobro recurrente del plan en Stripe («Plan y facturación», «Gestionar suscripción»).
- **Prohibido:** licencia, paquete. «Suscripción» tampoco se usa como nombre del plan en la web.
- **Dónde aparece:** navegación (Plan), `OwnerSaasBillingManager`, `/pricing`, FAQ pública.

### Resumen
- **Elegido:** Resumen, la página de inicio de `/owner`. Los enlaces de vuelta dicen «Volver al resumen».
- **Admitido:** «panel» para el área de trabajo en conjunto («El resto del panel sigue disponible»).
- **Prohibido:** dashboard, inicio, escritorio, «Volver al panel».
- **Dónde aparece:** navegación (Resumen), `OwnerDashboardView`, `DashboardModuleLayout` y los enlaces de vuelta de Asistencia, Cobros, Cuotas mensuales, Clases, Inscripciones y Grupos.

### Hoy en el club
- **Elegido:** «Hoy en el club», el bloque del Resumen con las sesiones del día y el botón «Pasar lista».
- **Prohibido:** «Sesiones de hoy» y «Hoy en pista» para ese bloque. Siguen vivos en el `/app` antiguo hasta P2 #18.
- **Dónde aparece:** `OwnerTodaySessionsPanel` y la pizarra de ejemplo de la home pública (`HomeSections`).

### Equipo y roles
- **Elegido:** equipo, las personas que trabajan en la academia (sección Equipo). Roles: «Entrenador/a» (`coach`) y «Coordinador/a» (`manager`). La persona titular es «la dirección de la academia».
- **Prohibido:** staff, personal, plantilla, y «Coach», «Manager» u «Owner» en textos visibles.
- **Decisión:** `/owner` no tenía ningún texto en español para el rol `manager`. «Coordinador/a» es una propuesta de esta PR que Elvis debe confirmar.
- **Dónde aparece:** navegación (Equipo), `OwnerStaffManager`, `TeamInvitationAcceptance`.

### Invitación al equipo
- **Elegido:** «invitación al equipo», el enlace de un solo uso con el que la dirección da acceso a una persona del equipo con un rol (Entrenador/a o Coordinador/a) y unas sedes. Se «crea», se «reemite» (enlace nuevo, el anterior deja de valer), se «revoca» y la persona la «acepta». Estados visibles: «Pendiente», «Caducada», «Aceptada», «Revocada». La «ficha del equipo» es el registro de Equipo (`staff_profiles`) que queda vinculado a su cuenta.
- **Prohibido:** «invitación de staff», «acceso de coach», «alta de usuario», y decir que se ha enviado un correo: hoy el enlace se copia y se comparte a mano.
- **Dónde aparece:** `OwnerTeamAccessPanel` (`/owner/staff`), `/staff/accept` y `docs/producto/invitaciones-equipo.md` (O3).

### Datos de ejemplo
- **Regla:** todo dato ilustrativo de la web se rotula como ejemplo antes del dato, no solo en un pie: «Ejemplo», «Datos de ejemplo» o «Sesión ilustrativa con datos ficticios».
- **Dónde aparece:** ficha del primer viewport (`MatHero`) y pizarra «Hoy en el club» (`HomeSections`).

### Solicitud de prueba y lista de espera
- **Elegido:** «solicitud de prueba» (en la navegación, «Solicitudes») es la petición de una familia desde el enlace público de la academia, antes de que exista la ficha de la gimnasta. «Lista de espera» es la espera canónica de una clase. Una solicitud se «pasa a inscripción» (y, cuando exista la vista de espera en `/owner`, «a lista de espera»); se «marca como contactada», se «descarta» y, si está descartada, se le pueden «eliminar los datos personales». El «enlace para familias» se «activa», se «desactiva» o se «genera de nuevo».
- **Prohibido:** lead, prospecto o contacto para la solicitud; «reserva» (no se reserva sesión); «prueba gratuita», que en Zaltyko es la del plan; «alta» para la solicitud, porque el alta es crear la ficha.
- **Dónde aparece:** `/solicitar-prueba/[token]`, `OwnerTrialRequestsWorkspace`, navegación (Solicitudes) y «Necesita tu atención». Origen: P2 #15 (`docs/producto/embudo-captacion.md`).

### Objetivo y observación
- **Elegido:** «objetivo», lo que una gimnasta está trabajando, con estado «En curso», «Conseguido» o «Descartado». «Observación», la nota breve del equipo sobre una gimnasta, «Solo equipo» o «Compartible con la familia». La sección de la ficha se llama «Objetivos y observaciones».
- **Prohibido:** meta, reto o «skill» por objetivo; comentario, nota de progreso o «feedback» por observación; «pública» o «visible para familias» por «compartible con la familia», porque el portal todavía no la muestra.
- **Dónde aparece:** `OwnerAthleteProgressPanel` (ficha en Grupos), `OwnerSessionObservationForm` (Pasar lista) y `docs/producto/objetivos-y-observaciones.md` (P2 #17).

### Titular y sustitución
- **Elegido:** «titular», la persona del equipo con rol Entrenador/a que da una clase de forma habitual («Titulares: Ana Ruiz y Bea Gil»). «Sustitución», el cambio de quién entrena en una sesión concreta sin tocar la clase; se «quita la sustitución» para volver a los titulares. La sesión muestra «Quién entrena»; Hoy, «Entrena: …». Para la entrenadora, Hoy separa «Tus sesiones» y «Resto de la sede».
- **Prohibido:** profesor/a, monitor/a o coach por titular; «suplente» o «cubrir» como nombre del cambio; «turno» por sesión.
- **Dónde aparece:** `OwnerClassCoaches` (Clases), `OwnerSessionCoaches` (Pasar lista), `OwnerTodaySessionsPanel` y `docs/producto/entrenadoras-por-clase.md` (O1).

## Pendientes

- **Archivos en refactor:** `monthly-invoice-service.ts` devuelve mensajes con «factura» («Factura no encontrada», «Ya existe una factura para esta familia y periodo…») y `OwnerMonthlyInvoiceResolutionPanel.tsx` dice «operación de facturación». Pasarán a «cuota» cuando termine el refactor. `ManualPaymentForm.tsx` (líneas 786 y 1087) dice «otra sesión de Owner»; pasará a «otra sesión de la dirección».
- **«Recibo» técnico:** `OwnerGroupsManager`, `OwnerStaffManager`, `OwnerSetupForm` y otros llaman «recibo» al comprobante de una operación idempotente. No es dinero, pero choca con el sentido habitual. Falta decidir si pasa a «comprobante de la operación».
- **Rutas retiradas del lanzamiento:** `/modules`, `/comparativas`, `/blog`, `/sobre-nosotros` y los clústeres por modalidad redirigen a `/features`, y `/coaches` responde 404 (`middleware.ts` con `src/lib/launch/essential-routes.ts`). Conservan «atleta», «padres», «staff» y «dashboard»; se unificarán si vuelven a servirse.
- **`/app` antiguo:** mantiene su vocabulario hasta la migración P2 #18. Por ejemplo, `src/lib/classes/promote-waiting-list.ts` avisa con «El atleta ha sido inscrito en…» (lista de espera, fuera del lanzamiento). En cambio, los recordatorios por correo de `src/lib/email/triggers.ts` y `src/app/api/notifications/send/route.ts` ya usan «tu gimnasta», porque comparten plantillas con los avisos que llegan a las familias.
