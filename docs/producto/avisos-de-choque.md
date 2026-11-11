# Avisos de choque de entrenadora y pista (O2)

Fecha: 11 de noviembre de 2026. Origen: oportunidad O2 de `docs/research/competencia/matriz-competitiva.md`, la pieza diferencial: ningún competidor muestra con evidencia pública que detecte choques al montar o cambiar el cuadrante. Su confianza es baja-media y está pendiente de validar en entrevistas, así que esta versión es **mínima, no bloqueante y fácil de retirar**.

## Qué avisa

- **Doble asignación.** Una entrenadora (titular o sustituta) está en dos sesiones que se solapan, en la misma sede o en sedes distintas.
- **Sin tiempo entre sedes.** Una entrenadora tiene dos sesiones seguidas en sedes distintas con menos de 30 minutos entre el final de una y el inicio de la otra (`TRAVEL_BUFFER_MINUTES`).
- **Pista ocupada.** Dos sesiones de la misma sede usan el mismo espacio (`spaces`) a la vez. El espacio de una sesión es `sessions.space_id` o, si falta, `class_templates.default_space_id`.

Reglas comunes:
- Se comparan instantes absolutos, así que la zona horaria de cada sede no influye.
- Dos sesiones que se tocan en el minuto exacto (una acaba a las 19:00 y la otra empieza a las 19:00) no chocan.
- Las sesiones canceladas no cuentan.
- Cada aviso dice quién (la entrenadora o la pista), qué sesiones y cuándo, en la hora de cada sede: «Ana Ruiz está en dos sesiones a la vez: «Base 3 GAF» (lun, 16 nov, 17:30–19:00, Sede Norte) y …».

## Dónde aparece

- **Al asignar titulares a una clase** (O1): después de guardar, la respuesta trae los choques de las titulares en las sesiones futuras de la clase dentro del horizonte, y la ficha de clase los muestra como «Guardado con aviso de choque».
- **Al hacer una sustitución en una sesión** (O1): igual, con los choques de quien entra en esa sesión.
- **«Choques próximos»** en Clases, para dirección y coordinación: los choques de las sedes de su alcance.
- **«Tus choques próximos»** en el Hoy de la entrenadora: solo sus propios choques y solo en sus sedes.
- **Al crear o cambiar el horario de una clase:** no aplica todavía. Solo existe crear una clase, y una clase nueva no tiene titulares ni pista hasta que se le asignan, así que no puede chocar. Cambiar el horario no existe aún.

## Solo avisa

- Nunca bloquea ni cambia datos: la detección solo lee. En O1 los avisos se calculan **después** de guardar, en la misma transacción, y se devuelven con el resultado.
- La auditoría de O1 (`class_template.coaches_set` y `session.coaches_set`) registra que se guardó con aviso, en `metadata.savedWithWarnings` y `metadata.scheduleWarnings`. Guarda el tipo, la ficha y las sesiones, solo como identificadores y sin nombres.

## Disponibilidad y rendimiento

- **Sin migraciones.** Solo lee tablas ya aplicadas: `sessions`, `session_staff`, `spaces`, `class_templates`, `locations`, `staff_profiles` y `people`. No hace falta ningún índice nuevo: usa `sessions_location_start_idx` (academia, sede, inicio) y `session_staff_uq` (academia, sesión, ficha).
- **Acotado:**
  - por academia, en cada tabla y en cada unión;
  - a las sesiones no canceladas que no han terminado y empiezan antes de ahora + `SESSION_HORIZON_TARGET_DAYS` + 1 días;
  - a las sedes de quien mira; las dos sesiones de un choque tienen que estar en ellas;
  - a 50 avisos (`MAX_CONFLICTS`), y se indica si hay más.
- **En las páginas** cada consulta tiene un tiempo máximo de 1,5 s (`set local statement_timeout`). Ante cualquier fallo, la página se pinta igual que antes, sin el bloque.
- **Qué está activo:**
  - Los avisos al asignar y sustituir dependen de O1, que sigue dormido hasta aplicar su candidato.
  - «Choques próximos» funciona ya con tablas aplicadas. Hoy no mostrará nada porque ningún flujo escribe asignaciones (O1 dormido) ni espacios: ninguna pantalla crea pistas.
- **Retirada:** basta con quitar `OwnerUpcomingConflicts` y `OwnerScheduleConflictList` de las páginas y de O1. No hay datos propios que borrar.

## Quién ve qué

| Rol | «Choques próximos» | Avisos al guardar |
|---|---|---|
| Dirección (`owner`), administración (`admin`) y coordinación (`manager`) | De entrenadoras y pistas en las sedes de su alcance (en Clases) | Sí, al asignar o sustituir (O1) |
| Entrenador/a | Solo los suyos y en sus sedes (en su Hoy); nunca los de otras sedes | No asigna ni sustituye |

## Decide Elvis

1. **¿Deberían llegar a bloquear?** Hoy solo avisan y se guarda igualmente. Opciones: confirmación explícita antes de guardar, o bloqueo para algunos tipos (por ejemplo, la pista). Opción conservadora aplicada: no bloquear, porque la confianza en O2 es baja-media.
2. **Avisar antes de guardar.** Hoy el aviso llega con el resultado. Una vista previa mientras se eligen entrenadoras necesitaría una ruta más.
3. **Margen entre sedes.** 30 minutos fijos para todas. ¿Por academia o por pareja de sedes?
4. **Choques con sesiones pasadas.** Solo se miran sesiones que aún no han terminado.
5. **Pistas.** Ninguna pantalla crea espacios ni los asigna a clases. Sin eso, el aviso de pista no tendrá datos.
6. **Avisos en el Resumen (Hoy en el club).** Se muestran en Clases. ¿Llevar también un resumen al Resumen?
7. **Entrenadora: choques con sesiones de otras sedes donde también entrena.** Solo ve los choques con las dos sesiones en sus sedes, que deberían ser todas aquellas en las que puede estar asignada.

## Pruebas

- `tests/schedule-conflicts-domain.test.ts`: solape en el minuto exacto, zonas horarias (Madrid y Canarias), canceladas, margen entre sedes, pista en otra sede y texto del aviso.
- `tests/schedule-conflicts-pg.test.ts` (job «Postgres integration»):
  - choque de entrenadora en la misma sede y en otra (solape y desplazamiento) y choque de pista;
  - una sesión cancelada no cuenta, y tocarse no es choque;
  - aislamiento entre academias;
  - alcance de la entrenadora y de la dirección;
  - el aviso no bloquea: una sustitución real con O1 se guarda, devuelve el aviso y queda auditada.
- `tests/owner-schedule-conflicts-ui.test.tsx`: lista de avisos, bloque vacío, vista de entrenadora y avisos al guardar titulares o una sustitución.
