# ADR-0001 — Frontera canónica del nuevo Zaltyko

- Estado: aceptada
- Fecha: 2026-10-06
- Alcance: dominio, base de datos y autorización

## Contexto

El producto heredado mezcla `tenant_id`, `academy_id`, tablas operativas en
`public` y rutas construidas en momentos distintos. No hay clientes activos ni
obligación de compatibilidad interna. El PRD define `organization_id` como
frontera única y exige aislamiento por organización y sede.

## Decisión

1. El nuevo dominio vive en el esquema PostgreSQL `zaltyko` y en módulos bajo
   `src/modules/*`.
2. `organization_id` es la única frontera tenant. `location_id` restringe una
   entidad dependiente de sede.
3. El esquema `public` heredado no es autoridad del nuevo producto. Se mantiene
   temporalmente para que cada cambio sea pequeño y reversible, no para
   conservar compatibilidad funcional.
4. Las claves foráneas compuestas `(organization_id, entity_id)` impiden
   referencias entre organizaciones incluso si una consulta de aplicación es
   defectuosa.
5. RLS y grants son capas separadas. `anon` no recibe acceso; `authenticated`
   solo recibe lectura explícita de estructuras no sensibles; las mutaciones y
   la PII pasan por servicios de servidor con autorización previa.
6. Los helpers `SECURITY DEFINER` se limitan a `zaltyko_private`, fijan
   `search_path = ''`, usan nombres cualificados y no exponen tablas.

## Consecuencias

- Se puede sustituir el producto por capacidades sin duplicar conceptos
  heredados.
- No habrá sincronización bidireccional con `public.*`.
- Antes de un piloto se decidirá entre datos sintéticos nuevos o una importación
  puntual, explícita, reconciliada y anonimizada.
- Toda API nueva deberá resolver organización, miembro, rol y scope de sede
  antes de consultar.

## Evidencia y referencias

- PRD, secciones 10.1, 18 y 20.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Supabase: grants explícitos del Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
