# Familias: acceso al portal y avisos de sesión

Fecha: 14 de noviembre de 2026. Prioridad 1 del análisis de competencia
(`documentacion/Zaltyko/auditoria-2026-11-14/brechas-competencia.md`, puntos A1
y A2): sustituir el grupo de WhatsApp sin perder el control. Continúa el portal
de solo lectura de P2 #16 (`docs/producto/portal-familias.md`), que no tenía
forma de dar acceso a las familias.

Estado: **dormido**. Detrás de `ZALTYKO_FAMILY_ACCESS_ENABLED` (apagada, solo
vale `true`) y de la candidata
`docs/deployment/candidates/20261114120000_family_access_notices_candidate.sql`,
que requiere autorización de Elvis. Sin las dos cosas, `/owner/familias`,
`/familia/avisos` y `/familia/aceptar` responden 404, las rutas 503, el menú del
portal no muestra «Avisos» y guardar una sustitución no avisa a nadie.

## Qué hace

### Alta por invitación (`/owner/familias`, «Acceso al portal»)

- La lista muestra cada tutor con una familia activa: nombre, gimnastas,
  correo principal y estado (sin invitar, invitación pendiente, caducada,
  revocada, con acceso, acceso retirado).
- **Invitar al portal**: la academia confirma el correo y decide, en el mismo
  paso, si el tutor verá el horario, la asistencia y los avisos de sus
  gimnastas (casilla marcada por defecto). Se envía un correo con un enlace de
  un solo uso que caduca a los 7 días, y la pantalla muestra una vez el enlace
  para copiarlo (por si el correo no llega o la academia prefiere compartirlo).
- **Reenviar** (rota el enlace y renueva la caducidad; espera de 10 minutos
  entre envíos), **Revocar** (el enlace deja de valer) y **Retirar acceso**
  (la cuenta deja de ver datos de la academia en la siguiente petición).
- **Invitar a todas**: crea y envía invitaciones a los tutores con correo y
  sin acceso ni invitación pendiente (hasta 200 por vez).
- Solo la dirección, la administración o la coordinación con acceso a todas
  las sedes gestionan el acceso: una familia no pertenece a una sola sede.

### Aceptación (`/familia/aceptar`)

La familia abre el enlace, entra o crea su cuenta con ese mismo correo, revisa
la academia y lo que podrá ver, y pulsa «Aceptar invitación». Se vincula la
cuenta al tutor (`guardians.auth_user_id`) y, si la academia lo confirmó, se
marca `can_view_athletes` en sus vínculos activos. Desde ese momento ve en
`/familia` solo a sus gimnastas (las reglas del portal de P2 #16 no cambian).

### Avisos (`/owner/familias`, «Avisos a familias»)

- **Cancelar o cambiar el horario** de una sesión de los próximos 14 días: se
  guarda el cambio y, en la misma transacción, se crea un aviso para las
  familias de las gimnastas inscritas (prueba o activa) ese día. Cambiar la
  hora de inicio cancela la sesión original («Cambio de horario») y crea una
  nueva a la hora nueva, con las mismas entrenadoras: así la franja original
  sigue ocupada y regenerar el horario no la vuelve a crear. Si solo cambia la
  hora de fin, se ajusta la misma sesión. El aviso llega a las familias del día
  original y del día nuevo.
- **Sustitución**: al guardar en «Quién entrena» una sesión futura con otra
  entrenadora (O1), se avisa a las familias de la clase. Sin nombres ni motivo.
- **Aviso manual** a una clase o a un grupo, con título y mensaje.
- **Enviados**: cada aviso con «Leído por X de Y» y, desplegado, quién lo ha
  leído y qué pasó con su correo.
- Idempotente: repetir la misma acción (doble clic, red) no crea otro aviso ni
  manda otro correo. El mismo cambio sobre la misma sesión tampoco; una
  sustitución nueva (aunque sea con la misma entrenadora) sí avisa.
- Correos por lotes pequeños al guardar. Lo que no da tiempo o falla queda
  pendiente y lo reintenta el cron `POST /api/cron/family-notices` (hasta 3
  intentos, cada 5 minutos como mínimo). Programar ese cron es decisión de
  Elvis (pregunta h).
- Invitar a todas va en lotes de 20; la pantalla repite hasta terminar. Entre
  dos envíos a la misma familia hay 10 minutos de espera, también tras
  revocar.
- Con la bandera apagada y las tablas instaladas, la página queda en modo
  «solo retirar acceso» para las familias con cuenta vinculada.

### Portal (`/familia/avisos`)

Los avisos de la cuenta por academia, con «Nuevo» en los no leídos; al abrir
la página se marcan como leídos. Dos casillas de correo por academia: cambios y
cancelaciones de sesiones, y mensajes de la academia. El aviso queda siempre en
el portal.

## Hallazgos

### 1. No había forma de dar acceso ni de avisar

- **Hallazgo:** `guardians.auth_user_id` existía pero nada lo rellenaba, y
  `can_view_athletes` nacía siempre en `false` sin pantalla para cambiarlo. Las
  sesiones solo se cancelaban por el ajuste de plan (`regularization-service`),
  sin aviso a nadie.
- **Fuente:** `docs/producto/portal-familias.md` (hallazgos 2 y 3);
  `git grep "status = 'cancelled'" -- src/modules`.
- **Importancia:** alta: es la razón por la que las academias siguen con el
  grupo de WhatsApp.
- **Siguiente paso:** activar en staging (abajo).

### 2. Quién recibe un aviso

- **Hallazgo:** tutores activos con un vínculo activo **y** permiso de ver a
  la gimnasta, en una familia activa, con la gimnasta activa y vigente ese día.
  Es el mismo permiso que el portal exige para mostrar horario y asistencia.
  Con cuenta vinculada reciben el aviso en el portal y por correo (según su
  preferencia); sin cuenta, el aviso queda registrado como «sin acceso al
  portal» para que la academia sepa a quién invitar.
- **Fuente:** `recipientGuardians` en
  `src/modules/family-access/application/family-notices.ts`.
- **Importancia:** alta. Hoy, antes de invitar, ningún tutor tiene
  `can_view_athletes`: los primeros avisos llegarán solo a quien haya aceptado
  una invitación con ese permiso.
- **Siguiente paso:** Decide Elvis (pregunta a).

### 3. Seguridad del enlace y aislamiento

- **Hallazgo:** token aleatorio de 32 bytes guardado solo como SHA-256, en el
  fragmento de la URL, de un solo uso, con caducidad, aceptado solo por una
  cuenta cuyo correo verificado coincide con el de la invitación y con el
  correo principal actual del tutor. Respuesta única para cualquier enlace
  inservible. Límites por cuenta y por red. Auditoría de cada paso. Cada
  lectura y escritura de avisos de la familia lleva una guarda SQL ligada a la
  cuenta de la sesión (`familyOwnsGuardian`).
- **Fuente:** `src/modules/family-access/`, `tests/family-access-pg.test.ts`
  (una familia nunca ve, marca ni configura avisos de otra, ni de otra
  academia), `tests/family-access-routes.test.ts`.
- **Importancia:** alta (datos de menores).
- **Siguiente paso:** ninguno técnico. Privacidad:
  `docs/privacy/familias-acceso-y-avisos.md`.

### 4. Dónde vive en `/owner`

- **Hallazgo:** la página nueva `/owner/familias` no está en el menú lateral:
  ese archivo lo están cambiando a la vez el calendario y el panel. Se entra
  por URL.
- **Fuente:** `src/components/owner-dashboard/OwnerWorkspaceNavigation.tsx`.
- **Importancia:** media.
- **Siguiente paso:** añadir la entrada «Familias» al menú cuando se fusionen
  esas ramas, y enlazar «Invitar al portal» desde la ficha de la gimnasta.

## Cómo probarlo en staging

1. Con autorización de Elvis, aplicar la candidata en staging y comprobarla con
   la consulta de «Verificación» de `docs/deployment/candidates/README.md`.
2. Poner `ZALTYKO_FAMILY_ACCESS_ENABLED=true` solo en el entorno Preview de
   staging y redesplegar.
3. Con una cuenta Owner de prueba: asociar una familia con correo a una
   gimnasta inscrita en una clase; abrir `/owner/familias`, «Invitar al portal».
4. Abrir el enlace (correo o el copiado) en otra sesión, crear la cuenta con
   ese correo, confirmarla, volver a abrir el enlace y aceptar. Comprobar que
   `/familia` muestra solo esa gimnasta.
5. Probar con otra cuenta el mismo enlace: debe dar el mensaje genérico.
6. En «Avisos a familias», cancelar una sesión próxima de esa clase; en
   `/familia/avisos` aparece el aviso y llega el correo; en `/owner/familias`
   pasa a «Leído por 1 de 1».
7. Desactivar en el portal «Mensajes de la academia», enviar un aviso manual y
   comprobar que queda en el portal sin correo.
8. «Retirar acceso» y recargar `/familia`: ya no muestra datos.

## Decide Elvis

- **a) Permiso de ver gimnastas:** la invitación lo concede si la academia
  deja marcada la casilla. ¿Debe haber también una casilla en la ficha del
  tutor para concederlo o quitarlo sin invitación?
- **b) Avisos sin cuenta:** ¿enviar el correo de un aviso también a tutores
  sin cuenta, a su correo principal? Hoy no: el correo escrito a mano puede
  estar mal y el aviso lleva la clase y la hora de un menor.
- **c) Urgentes:** ¿una cancelación del mismo día ignora la preferencia de
  correo?
- **d) Aviso a la academia** cuando una familia acepta, además de verlo en la
  lista.
- **e) Coaches:** ¿pueden enviar avisos manuales a sus clases? Hoy solo
  dirección, administración y coordinación con la sede.
- **f) Conservación** de avisos y lecturas, y si la exportación incluye sus
  valores (hoy solo recuentos).
- **g) Menú:** entrada «Familias» en `/owner` y botón en la ficha de la
  gimnasta (pendiente de las ramas en curso).
- **h) Cron de reintento:** programar `POST /api/cron/family-notices` (por
  ejemplo, cada 10 minutos) con el mismo mecanismo que el resto de crons.
