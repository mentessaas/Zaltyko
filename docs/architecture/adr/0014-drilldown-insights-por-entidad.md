# ADR-0014: Drill-down de Insights por entidad canónica

- Estado: aceptado para V1 local
- Fecha: 2026-10-06
- Contexto: el heatmap de capacidad expone clases autorizadas, pero no llevaba a las oportunidades `excess_demand` relacionadas con cada clase.

## Decisión

- Cada clase del desglose de capacidad ofrece un enlace a `/owner/insights` filtrado por `entityId`, organización y sede seleccionada.
- La bandeja aplica el filtro junto a su autorización server-side habitual; un `entityId` de otra sede no produce resultados al manager con scope limitado.
- El filtro se conserva en la URL, el formulario de ámbito y la paginación, y puede quitarse desde la bandeja.
- El enlace no implica que exista una oportunidad; la bandeja puede quedar vacía mientras reglas relevantes no produzcan un insight abierto.

## Consecuencias

- Conecta una señal operacional con la decisión correspondiente sin crear una segunda capa de permisos ni exponer personas.
- No añade CRUD de clases ni modifica datos operacionales.
- El parámetro filtra el read model; no sustituye autorización ni concede acceso a una entidad.

## Verificación

El harness PostgreSQL efímero verifica entidad visible al owner y entidad de otra sede vacía para manager acotado. No valida E2E autenticado remoto.
