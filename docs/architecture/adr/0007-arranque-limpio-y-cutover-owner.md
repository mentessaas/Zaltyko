# ADR-0007 — Arranque limpio y cutover de la superficie Owner

- Estado: aceptada para prepiloto; ejecución remota pendiente
- Fecha: 2026-10-06

## Contexto

No existen clientes activos que obliguen a conservar tablas, ids, endpoints o
flujos internos heredados. Convertir `public.academies`, `tenant_id` y los
dashboards anteriores en una capa de compatibilidad aumentaría la ambigüedad de
autorización y permitiría que dos fuentes compitiesen por la verdad.

## Decisión

El prepiloto se instalará en un proyecto de base de datos aislado y vacío. Se
aplicarán solo las migraciones canónicas del esquema `zaltyko`, en su orden
declarado. No se copiarán cuentas, perfiles, academias, atletas, cargos ni
fixtures del sistema actual.

`/owner` y `/owner/insights` son la entrada owner canónica. Las antiguas rutas
`/app/:academyId/dashboard`, `/dashboard/at-a-glance` y `/dashboard/analytics`
redirigen sin reutilizar el `academyId`: el servidor vuelve a resolver
organización y sede desde la identidad autenticada.

Los módulos heredados que aún sirven a coach, familia, mobile u operaciones no
se eliminan dentro de este corte. Quedan en cuarentena: no pueden alimentar el
Health Score ni recibir nuevas reglas de dominio. Se retirarán al sustituir su
consumidor, no antes.

## Consecuencias

- Se elimina la necesidad de una migración de clientes inexistentes.
- El bootstrap crea atómicamente organización, sede, owner activo y scopes en
  `zaltyko`; el E2E autenticado remoto sigue pendiente.
- Los enlaces owner convergen en `/owner`; coach conserva su jornada y familia
  su espacio separado.
- Rollback de este corte significa volver el tráfico a la release anterior, no
  intentar traducir ids entre modelos.

## Alternativas rechazadas

- Dual-write entre `public.*` y `zaltyko.*`: multiplica fallos parciales y
  reconciliación sin aportar valor para clientes inexistentes.
- Reutilizar `academyId` como `organizationId`: aparenta compatibilidad y puede
  convertir un identificador controlado por URL en autoridad.
- Borrado masivo inmediato: rompería reglas aún usadas por coach/mobile antes de
  tener reemplazo verificable.
