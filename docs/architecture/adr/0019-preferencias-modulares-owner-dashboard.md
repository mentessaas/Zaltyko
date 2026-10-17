# ADR-0019 — Preferencias modulares del Owner Dashboard

- Estado: aceptada para implementación local
- Fecha: 2026-10-13
- Alcance: presentación y personalización individual del Owner Dashboard

## Contexto

El dashboard debe poder adaptarse a lo que cada propietario consulta primero,
sin convertirse en un constructor libre que oculte decisiones prioritarias,
modifique el alcance de datos o añada una pantalla de configuración compleja.
El arrastre por sí solo tampoco es accesible.

## Decisión

1. Mantener fijo arriba el bloque de prioridades y Academy Health Score. Permitir
   ordenar los cuatro módulos secundarios: indicadores, tendencias/cobros,
   explicación y capacidad/cohortes.
2. Aceptar arrastre con teclado y proporcionar botones visibles de subir/bajar,
   más restablecer el orden por defecto. Guardar automáticamente por usuario y
   academia; no añadir un paso «Guardar».
3. Persistir solo claves de módulo validadas en
   `zaltyko.owner_dashboard_layouts`, con versión optimista y bloqueo por
   usuario/academia. El orden no concede permisos ni cambia filtros, consultas,
   scoring o datos.
4. Autorizar solo la superficie owner (owner, manager, admin) y limitar cada
   fila a su `auth.uid()` y organización; RLS permanece forzado. No exponer
   escritura anónima ni borrado desde Data API.

La primera versión permite reordenar esos cuatro módulos dentro de una única
columna vertical; no añade/quita módulos, no permite mover tarjetas internas ni
ofrece un lienzo libre. La prioridad/Score queda fija. Nuevos módulos se
incorporan solo con contrato/slot aprobado; el layout es una preferencia, no un
constructor visual general.

## Consecuencias

- Preferencia durable entre sesiones y dispositivos. Si dos sesiones cambian el
  orden, la segunda recibe un conflicto explícito y debe recargar, no sobrescribir
  silenciosamente.
- Los módulos nuevos se añaden al final cuando una preferencia antigua no los
  contiene; claves desconocidas no se renderizan.
- Esta entrega no implementa selección de módulos ni múltiples slots; añadirlos
  requiere revisar jerarquía, móvil, foco y límites de cada widget.
- Si las pruebas de accesibilidad o uso muestran que la personalización distrae,
  se puede retirar el arrastre sin afectar la arquitectura ni la vista por
  defecto.

## Validación

- migración fresh local, RLS forzado, grants y aislamiento por usuario;
- persistencia, orden por defecto, validación de claves y conflicto de versión;
- controles de teclado y alternativa de botones comprobados por contrato;
- revisión manual con lector de pantalla antes de declarar WCAG verificado.

Sin migración remota ni despliegue en esta fase.
