# Plan de la app móvil nativa (iOS y Android)

Fecha: 14 de noviembre de 2026. Es un **documento de decisión, sin código**. Parte de lo que ya existe y de lo que entrega esta misma PR: pasar lista sin conexión y «Añadir Zaltyko a tu pantalla de inicio» en la web (PWA).

## Recomendación

1. **Ahora: quedarse con la web instalable (PWA mejorada) y medir.** Ya cubre lo que más duele en el gimnasio: pasar lista sin cobertura. Cuesta cero en tiendas y se actualiza sola.
2. **Cuando haya señal clara, hacer la app nativa con Expo / React Native reutilizando `mobile/`.** No con Capacitor.
3. **Primera versión nativa deliberadamente pequeña**: pasar lista, «Hoy», avisos con notificación push y vista de familia. Nada de cobros ni gestión de la academia.

Por qué Expo y no Capacitor: `mobile/` ya existe (Expo SDK 57, Expo Router, login con Supabase, pantalla de asistencia de entrenadora, familia, mensajes) y habla con el mismo servidor mediante `withBearerTenant`. Capacitor envolvería la web en una caja nativa, pero esa web se dibuja en el servidor y depende de cookies, así que sin red no arrancaría sin rehacerla; acabaríamos manteniendo dos cosas y sin la ventaja de una app de verdad.

## Qué cambia cuando pasamos a nativa (y qué no)

La PWA de esta PR resuelve el 80 % de «funciona en el tapiz». La nativa añade lo que la web no hace bien en un móvil:

| Necesidad de la entrenadora | PWA mejorada | Expo / React Native | Capacitor |
|---|---|---|---|
| Pasar lista sin cobertura | Sí, con cola local y envío al volver la red (esta PR) | Sí, misma lógica | Solo si se rehace la web para abrir sin servidor |
| Que llegue el aviso «pasa lista» | Android: sí. iPhone: solo si está añadida a la pantalla de inicio y con iOS 16.4 o posterior | Sí, en los dos, de forma fiable | Sí, con plugin |
| Entrar rápido (huella / Face ID) | No | Sí (`expo-local-authentication`, ya en `mobile/`) | Sí, con plugin |
| Estar en las tiendas (búsqueda, confianza) | No | Sí | Sí |
| Coste de mantenimiento | El más bajo: una sola web | Medio: una app aparte, API compartida | Medio-alto: web + envoltorio + parches |
| Reutiliza lo que ya hay | Todo | `mobile/` (112 archivos) y la API | La web, pero con rediseño de arranque |
| Actualizar sin pasar revisión | Siempre | Cambios de JavaScript por `eas update`; lo nativo, por tienda | Igual que Expo, con menos herramientas |

Lo que **no** cambia: el servidor. La nativa usa el mismo contrato que la cola de esta PR: cada marca lleva `markedAt` (la hora real) y `opId` (identificador de operación), el servidor es idempotente y «la última marca de la entrenadora gana», con registro del conflicto. Así la app nativa no necesita inventar sincronización: la reutiliza.

## Qué incluye la primera versión (MVP)

Prioridad por uso habitual, que es la bandera del producto:

1. **Pasar lista.** Lista de las sesiones de hoy guardada en el móvil, marcar presente / ausente / tarde / justificada, estado «pendiente de enviar» o «guardado». Es la pantalla `coach/attendance/[sessionId]` de `mobile/` con la cola local (SQLite o almacenamiento seguro del dispositivo; nunca más datos del menor que su nombre y grupo).
2. **Hoy.** Qué clases tengo hoy, a qué hora, con qué grupo, y cuáles aún no tienen la lista pasada.
3. **Avisos con notificación push.** «Tu clase de las 17:00 aún no tiene lista» y avisos de dirección. Reutiliza los avisos «pasa lista» que prepara otra línea de trabajo; la app solo cambia el canal de entrega.
4. **Familia.** Ver las clases y los avisos de su hija o hijo, solo lectura, igual que el portal de familias web.

Queda fuera de la primera versión: cobros, altas y edición de gimnastas, informes, ajustes de academia y cualquier compra dentro de la app. Eso sigue en la web (y evita problemas con las reglas de pago de las tiendas).

## Notificaciones push

- **Web (hoy).** `public/sw.js` ya sabe recibir notificaciones. En Android funcionan con la web instalada o no; en iPhone solo si la han añadido a la pantalla de inicio. Por eso la invitación de esta PR explica los pasos de Safari.
- **Nativa.** `expo-notifications` (ya en `mobile/`): iOS por el servicio de Apple (APNs) y Android por el de Google (Firebase Cloud Messaging). Hace falta guardar un código de dispositivo por persona y dispositivo en el servidor y borrarlo al cerrar sesión.
- **Regla de producto.** Pocas y útiles: un aviso por clase sin lista y un resumen de dirección. Más avisos alejan, no hacen volver. Se medirá cuántos se abren.

## Publicar en App Store y Google Play

Costes y plazos de las tiendas cambian: **confirmar los importes y requisitos vigentes el día del alta**.

| | Apple (App Store) | Google (Play) |
|---|---|---|
| Cuenta | Apple Developer Program, cuota anual. Como organización pide un número D-U-N-S, lo que alarga el alta | Cuenta de desarrollador, pago único. Las cuentas personales nuevas pueden exigir una prueba cerrada con testers antes de publicar |
| A nombre de quién | Hoy Zaltyko factura como autónomo, así que la cuenta sería **individual, a nombre personal del titular (autónomo)**: su nombre y datos personales aparecen como vendedor en la ficha. Si se prefiere que no figuren, habría que plantear una sociedad antes (con su D-U-N-S, su trámite y sus costes); es una decisión de negocio, no técnica | Igual: cuenta personal del titular, con la exigencia de prueba cerrada para cuentas personales nuevas; o cuenta de organización si hay sociedad |
| Revisión | Revisión manual en cada versión; desde un día a varios | Revisión automática y manual; suele ser más rápida |
| Material | Capturas por tamaño de pantalla, descripción en español, URL de privacidad y de soporte, cuenta de prueba para el revisor | Ficha de la tienda, capturas, URL de privacidad, cuenta de prueba |
| Binario | Subida con EAS (`submit:ios`) a TestFlight y luego a revisión | Subida con EAS (`submit:android`) a pruebas internas y luego a producción |

### Privacidad de menores: lo que decide si nos aprueban

La app maneja datos de niñas y niños (nombre, grupo, asistencia), aunque **la usan adultos** (entrenadoras, dirección, familias). Eso condiciona:

- **No es una app «para niños».** Se declara público adulto. No se marca la categoría infantil ni de familias de Google, que traería requisitos mucho más estrictos. Los menores no tienen cuenta propia.
- **Etiquetas de privacidad.** Apple (etiquetas de privacidad) y Google (formulario de seguridad de datos) piden declarar qué se recoge. Declarar con exactitud: nombre y correo de la persona usuaria, nombre y asistencia de menores, identificador de dispositivo para notificaciones. **Sin datos de salud** (la cola local y las listas ya están limitadas a identificador, nombre y grupo).
- **Borrar la cuenta desde la propia app.** Ambas tiendas lo exigen. El flujo de borrado de cuentas ya existe en la web (PR de borrado de cuentas); la app debe enlazarlo o replicarlo dentro de la aplicación.
- **Política de privacidad y contrato de encargado.** La URL de privacidad debe describir el tratamiento de datos de menores y de las academias como responsables; está en revisión legal en otra línea de trabajo. No publicar en tiendas antes de cerrarla.
- **Sin seguimiento publicitario.** No se añade ningún SDK de publicidad ni de seguimiento entre apps; evita la ventana de permiso de seguimiento de Apple.
- **Datos en el dispositivo.** Cifrado del almacenamiento del sistema, borrado al cerrar sesión y caducidad de la lista guardada (36 horas), igual que en la web.
- **Reglas de pago.** Como no se vende nada dentro de la app y las academias pagan en la web, no hay compras dentro de la aplicación. Mantenerlo así.

## Esfuerzo y fases

Estimaciones **mías, no medidas**, para una persona con experiencia en Expo dedicada a esto; sirven para ordenar, no para comprometer fechas.

| Fase | Qué se hace | Esfuerzo estimado | Se sale si… |
|---|---|---|---|
| 0. Web instalable (esta PR) | Pasar lista sin conexión, invitación de instalación, manifiesto e iconos | Hecho | — |
| 1. Medir | 4–6 semanas de uso: cuántas entrenadoras instalan, cuántas pasan lista sin red, cuántas marcas llegan «pendientes» | 0 de desarrollo, solo análisis | Si casi nadie pasa lista sin red y las academias están contentas con la PWA, **no hay prisa por la nativa** |
| 2. Actualizar `mobile/` | Poner al día dependencias y la API, vincular el proyecto de EAS, primer build de desarrollo en un móvil real (hoy no hay evidencia de uno) | 1–2 semanas | — |
| 3. MVP nativo | Pasar lista con cola local y contrato `markedAt`/`opId`, Hoy, entrada con huella | 3–4 semanas | — |
| 4. Push y familia | Registro de dispositivo, avisos «pasa lista», vista de familia en solo lectura | 2–3 semanas | — |
| 5. Tiendas | Cuentas, fichas, privacidad, borrado de cuenta, pruebas cerradas, revisión | 2–4 semanas, mucha espera de terceros | — |

Total orientativo del camino nativo: **2 a 3 meses** desde que se decida, de los que una parte es espera de las tiendas.

## Qué decide el paso a la nativa (propuesta, a validar con Elvis)

Pasar de la fase 1 a la 2 solo si se cumple alguna de estas señales:

- Entrenadoras que **no reciben** los avisos en iPhone con la web instalada y lo piden.
- Academias que preguntan por «la app en la tienda» al contratar o en las pruebas.
- Un uso de pasar lista lo bastante alto como para que merezca el coste de mantener una segunda aplicación.

Los umbrales concretos se fijan tras la fase 1; no se inventan aquí.

## Riesgos

- **Mantener dos clientes.** Mitigación: la lógica de negocio sigue en el servidor y la app nativa solo la consume.
- **`mobile/` está parado.** Última actividad real: parches de dependencias; el propio README dice que aún no hay un binario probado en un dispositivo. Hay que contar la fase 2.
- **Rechazo en revisión por privacidad de menores.** Mitigación: declarar público adulto, borrar cuenta dentro de la app y política de privacidad cerrada antes de enviar.
- **Cuentas de tienda a nombre de una persona.** Como autónomo, las cuentas de Apple y Google serían individuales y con el nombre del titular visible en las fichas. Mitigación: decidir antes del alta si se acepta o se monta una sociedad; no crear las cuentas antes de decidirlo.

## Fuentes dentro del repo

- App actual: `mobile/` (`app.json`, `eas.json`, `docs/PRIMER_DEVELOPMENT_BUILD.md`).
- Contrato de sincronización: `src/app/api/attendance/route.ts` y `src/lib/attendance/offline-sync.ts`.
- Cola y lista local de la web: `src/lib/offline-attendance/`.
- Service worker y manifiesto: `public/sw.js`, `public/manifest.json`.
