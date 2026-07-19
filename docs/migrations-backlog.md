# Backlog de migraciones · GymnaSaaS

## Estado Sprint 3 · 2026-06-21

- Changelog Supabase revisado antes de ejecutar migraciones.
- Cambio relevante: desde 2026-04-28, las tablas nuevas en `public` pueden no exponerse automáticamente a Data API. Para nuevas tablas públicas, revisar `GRANT`, RLS y políticas por rol.
- Cambio relevante: deprecación de Postgres 14 el 2026-07-01. Confirmar versión del proyecto antes de producción si el proyecto es antiguo.
- Migraciones locales detectadas:
  - Drizzle: `drizzle/0000_silent_tomas.sql`, `drizzle/0001_cloudy_sleeper.sql`, `drizzle/0002_sturdy_toad.sql`.
  - Supabase SQL: `supabase/migrations/0006_*` a `0011_*` y migraciones fechadas `20260618*`.
- Comandos Sprint 3:

```bash
pnpm db:generate
pnpm db:migrate
pnpm exec tsx scripts/check-migrations.ts
pnpm exec tsx scripts/verify-migrations-status.ts
```

Resultado Sprint 3:

- `pnpm db:generate` no generó archivo nuevo porque Drizzle abrió una decisión interactiva sobre `academy_diagnostics.score` vs columnas antiguas del snapshot (`yes_count`, `recommendations`, `completed_by`, `completed_at`). No se eligió rename de forma automática.
- `pnpm db:migrate` intentó conectar con la DB real, pero quedó bloqueado por `SELF_SIGNED_CERT_IN_CHAIN`.
- `pnpm exec tsx scripts/check-migrations.ts` y `pnpm exec tsx scripts/verify-migrations-status.ts` fallaron por el mismo certificado.

No eliminar fallbacks resilientes hasta que `DATABASE_URL` tenga una configuración TLS válida y `pnpm db:migrate` más los smoke tests confirmen que las columnas/tablas existen en el entorno objetivo.

## Convenciones
- Todas las tablas **multi-tenant** deben incluir `tenant_id uuid not null` con índice `btree`.
- Fechas con zona horaria (`timestamptz`) y `default now()`.
- Claves externas con `on delete cascade` salvo que se especifique lo contrario.
- Mantener enumeraciones centralizadas en `src/db/schema/enums.ts`.

## Bloque inmediato (Fase 0 · Fundamentos)
| Objetivo | Acciones |
| --- | --- |
| Consolidar roles | Añadir enum `parent` y `super_admin` en `profile_role`. Ajustar seeds y RLS. |
| Padres / tutores | Nueva tabla `guardians` con relación `guardian_athletes` (many-to-many) y banderas de notificación. |
| Stripe | Tabla `payment_intents` para auditoría básica (monto, moneda, estado, referencia Stripe). |
| Audit trail | Ampliar `audit_logs` con columnas `action`, `entity`, `entity_id`, `metadata jsonb`. |

## Bloque Fase 1 · Núcleo operativo
| Objetivo | Acciones |
| --- | --- |
| Historial de progreso | Tabla `athlete_progress` (fecha, entrenador, descripción, nivel, archivos opcionales). |
| Asignación coaches | Tabla pivote `coach_classes` y `coach_academies` (role-specific), constraints de unicidad. |
| Import/export | Tabla `import_jobs` (estado, tipo, errores). |
| Becas y descuentos | Tabla `scholarships` vinculada a atletas y academias. |
| Catálogo de planes | Extender `plans` con precio, moneda, beneficios (`jsonb`). |

## Bloque Fase 2 · Capas de valor
| Objetivo | Acciones |
| --- | --- |
| Logros FIG | Tablas `skills` (código FIG), `athlete_badges` (estado, validador, evidencia). |
| Ranking | Tabla `academy_rankings` (periodo, métricas agregadas). |
| Metas y tareas | `goals` (por atleta/grupo) + `goal_updates` (progreso). |
| Eventos geolocalizados | Añadir `geometry(Point,4326)` o `lat/long` + tabla `event_invites`. |

## Bloque Fase 3 · Monetización
| Objetivo | Acciones |
| --- | --- |
| Marketplace | Tablas `products`, `product_variants`, `orders`, `order_items`, `payouts`. Integrar `stripe_account_id`. |
| Afiliados | Tabla `referral_links` y `referral_events`. |
| Landing SEO | Tabla `academy_profiles` (slug único, contenido hero, galería). |

## Bloque Fase 4 · IA y comunidad
| Objetivo | Acciones |
| --- | --- |
| IA retención | Tabla `engagement_metrics` (asistencia, pagos, comunicación) y `risk_alerts`. |
| IA productividad | `training_templates` y `training_sessions` generados por IA. |
| Feed social | `posts`, `post_reactions`, `post_comments`, `visibility` enum. |
| Comunidad global | `global_challenges`, `challenge_participants`, `challenge_results`. |

## Bloque Fase 5 · Ecosistema
| Objetivo | Acciones |
| --- | --- |
| Integraciones externas | `integration_tokens` (provider, scopes, metadata). |
| API pública | `api_keys`, `api_usage_logs`, `webhook_endpoints`. |
| Gamificación | `academy_levels`, `academy_rewards`, `reward_redemptions`. |

> **Recomendación**: generar una migración por objetivo atómico, usando `drizzle-kit`. Mantener seeds en `scripts/seed.ts` alineados con los nuevos datos de demo para testing local/preview.
