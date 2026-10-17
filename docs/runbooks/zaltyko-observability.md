# Runbook de observabilidad — prepiloto

## Señales obligatorias

| Señal                             | Dimensiones permitidas                      | Alerta propuesta                          |
| --------------------------------- | ------------------------------------------- | ----------------------------------------- |
| latencia/error `/owner` y APIs v1 | ruta, status, entorno; nunca tenant/persona | p95 > 800 ms o error > 2 % durante 10 min |
| frescura de métricas/score        | entorno, versión, bucket de edad            | watermark > 24 h                          |
| lag y fallos de outbox            | evento, estado, entorno                     | pendiente más antiguo > 15 min            |
| reconciliación ledger             | moneda, entorno                             | diferencia distinta de 0                  |
| ejecuciones de reglas             | regla, versión, resultado                   | fallos consecutivos o cero runs esperados |
| auth/denegaciones                 | razón agregada, ruta                        | incremento anómalo; sin ids en métrica    |
| backup                            | entorno, tipo                               | último backup/restorable fuera de RPO     |

Los umbrales son propuesta de prepiloto, no SLO verificado. Deben calibrarse con
tráfico real. Logs estructurados pueden contener ids técnicos solo cuando sean
necesarios para investigación y estén sujetos a acceso/retención; nunca PII,
cookies, tokens, headers de autorización o payloads completos.

## Triage

1. Determinar si falla operación, analítica o solo presentación.
2. Si operación funciona y analytics falla, marcar dashboard stale/unavailable;
   no inventar ceros ni bloquear altas/cobros.
3. Confirmar entorno, versión, migraciones y watermark.
4. Revisar outbox, último run y error por regla sin abrir payloads personales.
5. Para diferencia financiera, congelar automatismos de conciliación afectados;
   no alterar obligaciones o pagos históricos.
6. Registrar incidente, alcance, decisión y recuperación.

## Condiciones de salida

- señal vuelve a rango;
- backlog procesado o aislado;
- reconciliación exacta;
- causa y acción preventiva documentadas;
- si hubo datos personales, activar el proceso de brechas y evaluación legal.
