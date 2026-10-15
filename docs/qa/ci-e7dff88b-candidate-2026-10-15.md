# Candidato e7dff88b — CI en curso, no listo para publicar

15 octubre 2026, 08:45 UTC. [PR226](https://github.com/mentessaas/Zaltyko/pull/226), draft y REVIEW_REQUIRED. SHA exacto `e7dff88b39ba4fdf19c2f35f1f918a8ff3fa02a1` confirmado remoto tras push normal, sin merge.

## Cambios revisados

- Correcciones unitarias cwd móvil y mock de paginación, sin cambiar servicio/fixtures/deadline.
- Manifiesto18 y catálogo DB estáticos; inspección remota previa de metadata, sin DDL ni filas de negocio.
- Diagnóstico de build con cinco fases numéricas permitidas, conservando error/cleanup y build240s. No es una corrección demostrada del timeout.
- Alternativa ECR→Hub por13digests/configs linuxamd64 idénticos observados. Solo rate-limit exclusivo y exit entero positivo; 600s compartidos, identidad antes/después de retag y entorno filtrado. Frontend75GO estático, QA119 sin bloqueantes. Main80/80mockPASS, tsc0, formatoPASS; no Docker local adicional.

## Ejecuciones automáticas únicas

- [CI38707901100](https://github.com/mentessaas/Zaltyko/actions/runs/38707901100): queued al observar. Tres navegadores siguen siendo bloqueantes; no hay dispatch ni rerun.
- [Static38707901067](https://github.com/mentessaas/Zaltyko/actions/runs/38707901067): in_progress.
- [Directory38707901250](https://github.com/mentessaas/Zaltyko/actions/runs/38707901250): in_progress.

Son estados de esta observación, no resultados finales. QA monitoriza el SHA exacto con backoff. No repetir navegadores/harnesses locales ya aprobados. Cuota Hub, normalización RepoDigests, comportamiento Supabase tras retag y tracing240s siguen sujetos a evidencia remota.

Observación posterior QA123: Static yDirectoryPASS; Build, unitarios,lint/móvil/security/RLS/migracionesPASS según jobs. Solo matriz/gate funcional siguen abiertos, Chromium dentrodelE2E, Firefox/WebKitencola; sin resultado funcional ni cleanup todavía. No equivale a publicación lista.

## Protecciones y gates separados

Antes del push: Vercel previewDeploymentsDisabled=true, ProductionBranch=main; Deploy disabled_manually y fail-closed en YAML; main strict/enforce_admins, una aprobación y gate sintético requerido. Entorno Production restringido a main, prevent_self_review=true; can_admins_bypass=true, no protección absoluta. GitHub deployment records del SHA nuevo: cero en esta observación; no se ha ordenado publicar.

Esquema/backup/privilegios efectivos de la app, aprobación independiente del PR y autorización de publicación siguen pendientes aunque CI pase. GitHub anuncia7alertas en main (2critical/5high); no son aplicabilidad demostrada al candidato. Móvil conserva2advisories residuales braces/node-forge mitigados localmente, no cerrados upstream. Sin secretos, fixtures reales ni recurso Supabase de pago.
