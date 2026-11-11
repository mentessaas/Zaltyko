# Avisos de choque de entrenadora y pista (O2)

Fecha: 11 de noviembre de 2026. Origen: oportunidad O2 de `docs/research/competencia/matriz-competitiva.md`, la pieza diferencial: ningún competidor muestra con evidencia pública que detecte choques al montar o cambiar el cuadrante. Su confianza es baja-media y está pendiente de validar en entrevistas, así que esta versión es **mínima, no bloqueante y fácil de retirar**.

## Qué avisa

- **Doble asignación.** Una entrenadora (titular o sustituta) está en dos sesiones que se solapan, en la misma sede o en sedes distintas.
- **Sin tiempo entre sedes.** Una entrenadora tiene dos sesiones seguidas en sedes distintas con menos de 30 minutos entre el final de una y el inicio de la otra (`TRAVEL_BUFFER_MINUTES`).
- **Pista ocupada.** Dos sesiones de la misma sede usan el mismo espacio (`spaces`) a la vez. El espacio de una sesión es `sessions.space_id` o, si falta, `class_templates.default_space_id`. **Apagado por defecto** (`SPACE_CONFLICT_WARNINGS_ENABLED = false`): en gimnasia lo normal es compartir el practicable y avisaría de más. El detector existe y está probado; activarlo es «Decide Elvis» n.º 2.

Reglas comunes:
- Se comparan instantes absolutos, así que la zona horaria de cada sede no influye.
- Dos sesiones que se tocan en el minuto exacto (una acaba a las 19:00 y la otra empieza a las 19:00) no chocan.
- Las sesiones canceladas no cuentan.
- Cada aviso dice quién (la entrenadora o la pista), qué sesiones y cuándo, en la hora de cada sede: «Ana Ruiz está en dos sesiones a la vez: «Base 3 GAF» (lun, 16 nov, 17:30–19:00, Sede Norte) y …».

## Dónde aparece

- **Al asignar titulares a una clase** (O1): después de guardar, la respuesta trae los choques de las titulares en las sesiones futuras de la clase dentro del horizonte, y la ficha de clase los muestra como «Guardado con aviso de choque».
- **Al hacer una sustitución en una sesión** (O1): igual, con los choques de quien entra en esa sesión.
- **«Choques próximos»** en Clases, para dirección y coordinación: los choques de entrenadora y de desplazamiento entre sedes, en las sedes de su alcance y en los **próximos 14 días** (`PAGE_CONFLICT_HORIZON_DAYS`).
- **«Tus choques próximos»** en el Hoy de la entrenadora: solo sus propios choques, solo en sus sedes y en los próximos 14 días.
- **Al crear o cambiar el horario de una clase:** no aplica todavía. Solo existe crear una clase, y una clase nueva no tiene titulares ni pista hasta que se le asignan, así que no puede chocar. Cambiar el horario no existe aún.

## Solo avisa

- Nunca bloquea ni cambia datos: la detección solo lee. En O1 los avisos se calculan **después** de guardar, en un savepoint de la misma transacción. Si la detección falla, también por un error de SQL, se deshace solo el savepoint, el guardado sigue, el resultado trae `warnings: null` y queda un log.
- Los avisos al guardar miran el horizonte completo de sesiones generadas, pero solo en las sedes que ve quien guarda: una coordinación con sedes seleccionadas no recibe nombres de otras sedes.
- En un reintento de la misma petición (mismo `clientRequestId`) no se recalculan: se dieron en la respuesta original y se pueden consultar en «Choques próximos».
- La auditoría de O1 (`class_template.coaches_set` y `session.coaches_set`) registra que se guardó con aviso, en `metadata.savedWithWarnings` y `metadata.scheduleWarnings`. Guarda el tipo, la ficha y las sesiones, solo como identificadores y sin nombres. Si no se pudieron calcular, registra `scheduleWarningsUnavailable`.

## Disponibilidad y rendimiento

- **Sin migraciones.** Solo lee tablas ya aplicadas: `sessions`, `session_staff`, `spaces`, `class_templates`, `locations`, `staff_profiles` y `people`. No hace falta ningún índice nuevo: usa `sessions_location_start_idx` (academia, sede, inicio) y `session_staff_uq` (academia, sesión, ficha).
- **Acotado:**
  - por academia, en cada tabla y en cada unión;
  - a las sesiones no canceladas que no han terminado, empezadas como mucho hace un día (no recorre el histórico), y hasta 14 días en las páginas o el horizonte completo (`SESSION_HORIZON_TARGET_DAYS` + 1) al guardar;
  - la consulta aplica las mismas reglas exactas que el dominio (solape en cualquier sede o sedes distintas sin margen), así que el límite no se llena de parejas que luego no son choque;
  - a las sedes de quien mira; las dos sesiones de un choque tienen que estar en ellas;
  - a 50 avisos (`MAX_CONFLICTS`), y se indica si hay más.
- **En las páginas** la carga va en paralelo con el resto (`Promise.all`), en una transacción `read only`, y tiene un **presupuesto total de 1,5 s por página** (`Promise.race` con un temporizador). Para no competir por el pool (5 conexiones en producción):
  - al agotarse el presupuesto, la carga se marca como abandonada (`AbortSignal`) y no pide conexión ni lanza más consultas; se comprueba antes de pedir conexión y antes de cada consulta;
  - antes de cada consulta, `statement_timeout` se fija al presupuesto que queda, no a un valor fijo;
  - si el pool ya tiene peticiones esperando conexión, no se carga.
  - Si se agota o falla, devuelve `null` y la página se pinta igual que antes. El alcance (sedes activas y fichas de la entrenadora) se resuelve en una sola consulta.
- **En O1**, los avisos corren dentro de su savepoint con `statement_timeout` de 1,5 s, para no alargar los cerrojos de O1 con el tiempo general (30 s). Al salir se restaura el valor anterior, también en su propio savepoint.
- **Qué está activo:**
  - Los avisos al asignar y sustituir dependen de O1, que sigue dormido hasta aplicar su candidato.
  - «Choques próximos» funciona ya con tablas aplicadas. Hoy no mostrará nada porque ningún flujo escribe asignaciones (O1 dormido) ni espacios: ninguna pantalla crea pistas.
- **Retirada:** basta con quitar `OwnerUpcomingConflicts` y `OwnerScheduleConflictList` de las páginas y de O1. No hay datos propios que borrar.

## Quién ve qué

| Rol | «Choques próximos» | Avisos al guardar |
|---|---|---|
| Dirección (`owner`), administración (`admin`) y coordinación (`manager`) | Entrenadora y desplazamiento entre sedes, en las sedes de su alcance y en 14 días (en Clases) | Sí, al asignar o sustituir (O1), solo de sus sedes |
| Entrenador/a | Solo los suyos y en sus sedes (en su Hoy); nunca los de otras sedes | No asigna ni sustituye |

## Decide Elvis

1. **¿Deberían llegar a bloquear?** Hoy solo avisan y se guarda igualmente. Opciones: confirmación explícita antes de guardar, o bloqueo para algunos tipos (por ejemplo, la pista). Opción conservadora aplicada: no bloquear, porque la confianza en O2 es baja-media.
2. **Avisos de pista.** Apagados por defecto: el practicable compartido es lo normal en gimnasia. ¿Activarlos, por pista (las que no se comparten) o por sede?
3. **Avisar antes de guardar.** Hoy el aviso llega con el resultado. Una vista previa mientras se eligen entrenadoras necesitaría una ruta más.
4. **Margen entre sedes.** 30 minutos fijos para todas. ¿Por academia o por pareja de sedes?
5. **Choques con sesiones pasadas.** Solo se miran sesiones que aún no han terminado.
6. **Pistas sin datos.** Ninguna pantalla crea espacios ni los asigna a clases. Sin eso, el aviso de pista no tendrá datos.
7. **Avisos en el Resumen (Hoy en el club).** Se muestran en Clases. ¿Llevar también un resumen al Resumen?
8. **Entrenadora: choques con sesiones de otras sedes donde también entrena.** Solo ve los choques con las dos sesiones en sus sedes, que deberían ser todas aquellas en las que puede estar asignada.

## Pruebas

- `tests/schedule-conflicts-domain.test.ts`: solape en el minuto exacto, zonas horarias (Madrid y Canarias), canceladas, margen entre sedes, pista en otra sede, texto del aviso, zona horaria inválida (respaldo UTC) y valores conservadores (14 días, pista apagada).
- `tests/schedule-conflicts-pg.test.ts` (job «Postgres integration»):
  - choque de entrenadora en la misma sede y en otra (solape y desplazamiento) y choque de pista;
  - una sesión cancelada no cuenta, y tocarse no es choque;
  - aislamiento entre academias;
  - alcance de la entrenadora y de la dirección;
  - más de 50 clases seguidas en la misma sede no tapan un choque real al final;
  - presupuesto agotado → `null`, y `statement_timeout` no queda activo en el pool;
  - una carga abandonada entre consultas no lanza la siguiente, y con el presupuesto agotado no pide conexión;
  - las páginas no muestran un choque a 20 días (horizonte de 14) y no se leen sesiones empezadas hace más de un día; cada caso tiene su control, que falla si se quita el filtro;
  - en O1, los avisos ven `statement_timeout = 1500ms` y la auditoría posterior vuelve a ver el valor de siempre;
  - el aviso no bloquea: una sustitución real con O1 se guarda, devuelve el aviso y queda auditada;
  - si la detección falla con un error de SQL, la sustitución se guarda igual (`warnings: null`);
  - los avisos al guardar solo nombran sedes visibles para quien guarda.
  - Instala y retira el candidato de O1 en la base compartida, igual que `coach-assignment-pg`. Cada suite corre sola y deja la base como la encontró, así que no chocan entre sí.
- `tests/owner-schedule-conflicts-ui.test.tsx`: lista de avisos, bloque vacío, vista de entrenadora y avisos al guardar titulares o una sustitución.
