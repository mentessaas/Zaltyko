# Auditoría de cambios locales — 2026-07-22

El inventario inicial de trabajo tenía 239 entradas sin commit. Se retiraron 16 copias muertas con nombres derivados (`page 2`, `route 2` y tests duplicados), quedando 227 entradas locales sin publicar.

Estado: **no atribuir automáticamente corrección ni autoría**. Los cambios están parcialmente alineados con el endurecimiento de authz/RLS, pagos, uploads, cron, UX y tests realizados durante los Días 1–4, pero migraciones, Lemon Squeezy, landing y grandes reescrituras de tests requieren revisión por lote.

También se corrigió la desalineación del CI que todavía configuraba variables NextAuth aunque el sistema actual usa Supabase Auth.

No se tocó producción ni se aplicaron migraciones remotas.
