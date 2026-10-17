# Threat model — núcleo canónico Zaltyko

- Estado: revisión técnica local; pentest y entorno remoto no verificados
- Activos: PII de familias/menores, autorizaciones, asistencia, ledger,
  snapshots, insights, secretos y backups
- Fronteras: navegador → Next.js → service role → PostgreSQL; proveedor de pago
  → inbox; outbox → workers; operadores → tareas administrativas

## Amenazas y controles

| Amenaza                                | Impacto                    | Controles implementados                                                        | Evidencia pendiente                  |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| cambiar `organizationId` en URL        | fuga cross-tenant          | membership resuelto por `user_id`, FK compuestas, RLS forzada, tests negativos | E2E remoto                           |
| escalar de sede a agregado             | fuga entre sedes           | scopes explícitos, manager forzado a sede, denegación auditada                 | matriz completa de rutas             |
| usar el Data API para saltar servicios | mutación sin invariantes   | tablas sensibles sin grants; escrituras solo service role                      | inspección de grants remota          |
| replay/concurrencia                    | doble alta, pago o insight | idempotency key, locks, unique indexes, optimistic version                     | caos en workers desplegados          |
| manipular historial financiero         | pérdida de trazabilidad    | ledger append-only/reconciliación; auditoría e historial inmutables            | permisos del rol operativo remoto    |
| score viejo presentado como actual     | mala decisión              | watermark, calidad, cobertura y estado stale visibles                          | alertas de frescura desplegadas      |
| inferir un menor desde un insight      | daño a persona vulnerable  | insights agregados sin PII; regla individual desactivada                       | EIPD y revisión legal                |
| inyección/XSS en nombres o motivos     | toma de sesión             | React escapa salida; Zod limita payloads; sin HTML arbitrario                  | DAST/CSP completa                    |
| secreto service role expuesto          | control total de datos     | solo servidor; nunca Data API/cliente; logs sin secretos                       | rotación y escáner CI                |
| backup robado o restaurado mal         | fuga/pérdida masiva        | cifrado/aislamiento requeridos por runbook                                     | simulacro de restore                 |
| borrado accidental                     | indisponibilidad           | sin `ON DELETE CASCADE` fuera de agregados previstos; backup/PITR requerido    | RPO/RTO contratado                   |
| dependencia comprometida               | ejecución de código        | lockfile y build reproducible local                                            | SCA/SBOM y política de actualización |

## Reglas de diseño obligatorias

- Autenticar antes de validar recursos controlados por el usuario.
- Autorizar de nuevo dentro de cada transacción de escritura.
- No registrar payloads con PII, tokens, headers o webhooks completos.
- No usar `organizationId`, `locationId` o `academyId` de URL como autoridad.
- Ninguna métrica, score o insight reescribe la fuente operacional.
- Una degradación analítica nunca bloquea altas, asistencia o cobros.

## Riesgo residual que bloquea prepiloto

No se ha ejecutado pentest, E2E autenticado remoto, restore, rotación de secretos
ni prueba de workers. La superficie owner es técnicamente coherente en local,
pero no puede recibir datos personales reales hasta cerrar esos controles.
