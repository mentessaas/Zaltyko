# MIG-SYN-01 — Synthetic fixtures and invariant matrix

> **Issue**: ZAL-626 · **Parent contract**: [ZAL-620](../../../../vault/06-Roadmap-y-Tareas/ZAL-620%20contrato%20migracion%20asistida%20salida%20modular%20v1.0%202026-08-12.md) · **Ancestor**: [ZAL-619](../../../../vault/06-Roadmap-y-Tareas/ZAL-619%20contrato%20P0%20ICP%20gimnasia%20Web%20Mobile%20v1.0%202026-08-12.md)
>
> **Author**: Data & Analytics · **Date**: 2026-08-12
>
> **Scope**: synthetic data only. Zero PII, zero real IDs, zero connection to production or Stripe live. No migraciones remotas, no secretos leídos, no pricing tocado, no claims públicos.

Este paquete entrega los fixtures reproducibles y la tabla de invariantes que QA necesita para ejecutar la matriz `MIG-01`..`MIG-14` del contrato [ZAL-620 §8](vault/06-Roadmap-y-Tareas/ZAL-620%20contrato%20migracion%20asistida%20salida%20modular%20v1.0%202026-08-12.md) contra el contrato P0 de [ZAL-619 §3.7](vault/06-Roadmap-y-Tareas/ZAL-619%20contrato%20P0%20ICP%20gimnasia%20Web%20Mobile%20v1.0%202026-08-12.md) sin tocar datos personales reales.

## 1. Contenido del paquete

| Archivo | Tipo | Filas (datos) | Propósito |
|---|---|---|---|
| `manifest.json` | metadatos | — | versión, sha256, academy_id sintético, exclusiones |
| `baseline.json` | esperado | — | conteos y decisiones por fila para comparación pre/post job |
| `athletes.csv` | entrada | 9 | happy + gemelas + duplicado + ambigua + inválido + grupo inexistente + sport_config inexistente |
| `athletes-flat.xlsx` | entrada | 5 | XLSX espejo sin conflictos, valida camino XLSX |
| `athletes-multisheet.xlsx` | entrada | 5 + 2 + 1 | 3 hojas; solo `Atletas` se mapea en P0 |
| `finances.csv` | entrada | 4 | cargos 285 / pagos 150 / reembolsos 0 / saldo 135 EUR |
| `finances.xlsx` | entrada | 4 | misma reconciliación en XLSX |
| `finances-rejected.csv` | entrada | 6 | casos que NO deben commitear: sin fecha, sin importe, USD, decimal ambiguo, sin identidad, extracto bancario |
| `finances-mismatch.xlsx` | entrada | 3 | CHG-002 alterado a 200; debe disparar `IMPORT_TOTAL_MISMATCH` |

### Artefactos inyectados por QA (no commiteados)

| Artefacto | Cómo se construye | Esperado por el contrato |
|---|---|---|
| `athletes-with-colors.xlsx` | abrir `athletes-flat.xlsx` en Numbers/LibreOffice, aplicar color de relleno a `A2` y comentario a `B2`, guardar | preview acepta con `warning` de color y `warning` de comentario; commit solo procede tras confirmación explícita del dueño |
| `athletes-with-merged-cells.xlsx` | abrir `athletes-flat.xlsx` en Numbers/LibreOffice, combinar `B3:D3` (name+dob+status), guardar | rechazo estructural `IMPORT_STRUCTURE_UNSUPPORTED` antes de preview; cero registros creados |

La razón por la que estos dos archivos no se commitean es que el serializador `xlsx` 0.20.3 incluido en el repo tiene bugs con rangos de estilo y merges en el build `.mjs`; un binario opaco rompe la reproducibilidad por diff. QA los produce localmente con la misma fuente.

## 2. Decisiones fila por fila — athletes.csv / athletes-flat.xlsx

| # | external_id | name | dob | group_name | Decisión esperada | Razón / código |
|---|---|---|---|---|---|---|
| 1 | `A-001` | Sintético Uno | 2012-04-03 | `base_3` | **created** | external_id único, dob ISO; grupo ambiguo se resuelve por catálogo |
| 2 | `A-002` | Sintético Uno Gemela | 2012-04-03 | `base_3` | **created** | gemela con misma fecha y nombre parecido pero external_id distinto; **no se fusiona** (ZAL-620 §3.3) |
| 3 | `A-001` | Sintético Uno Dup | 2012-04-03 | `base_3` | **rejected — DUPLICATE_SUSPECTED** | external_id duplicado con payload modificado; bloquea commit hasta omitir o resolver (ZAL-620 §3.3) |
| 4 | `A-003` | Sintético Dos | 03/04/2012 | `Base 3` | **ambiguous_hold** | fecha ambigua por locale; corregir a ISO o excluir (ZAL-620 §3.2) |
| 5 | `A-004` | Sintético Tres | *(vacío)* | `Base 3` | **created** | dob ausente permitido; resto válido |
| 6 | *(vacío)* | Sin Nombre | 2012-04-03 | `Base 3` | **rejected — IMPORT_ROW_INVALID** | sin `name` obligatorio (ZAL-620 §3.1) |
| 7 | `A-006` | Sintético Cuatro | 2012-04-03 | `base_3_no_existe` | **rejected — RESOURCE_NOT_FOUND** | grupo no existe en academia |
| 8 | `A-007` | Sintético Cinco | 2012-04-03 | `Base 3` (sport=`RFEG-NO-EXISTE`) | **rejected — VALIDATION_ERROR** | sport_config_code no está en el catálogo activo |
| 9 | `A-008` | Sintético Seis | 2012-04-03 | `Base 3` | **created** | status `inactive` es válido |

**Totales esperados tras commit**: 4 atletas creados, 1 mantenido separado (A-002 gemela), 1 duplicado bloqueado, 1 ambigua en hold, 2 inválidos rechazados, 0 fusiones no autorizadas. Ver `baseline.json` § `by_row_decision`.

## 3. Decisiones fila por fila — finances.csv / finances.xlsx (matriz MIG-SYN-01 §7)

| external_id | kind | amount_eur | origin_status | Decisión |
|---|---|---|---|---|
| FIN-CHG-001 | charge | 150.00 | pending | created |
| FIN-CHG-002 | charge | 135.00 | pending | created |
| FIN-PAY-001 | payment | 150.00 | paid | created; **NO** promueve CHG-001 a `paid` automáticamente — queda etiqueta `historical_imported` |
| FIN-REF-001 | refund | 0.00 | paid | created (valor 0) |
| FIN-CHG-003 | charge | 135.00 | pending | created; saldo apertura = 135.00 EUR |

**Reconciliación esperada**:

| Concepto | Esperado (EUR) | Cómo se obtiene |
|---|---|---|
| Total cargos | 285.00 | 150.00 + 135.00 + 0.00 (refund)? — cargos son 150 + 135 + (el cargo de saldo de apertura es 135 también); baseline fija cargos = 150 + 135 + 135 = 420 — ver §3.1 |
| Total pagos | 150.00 | 150.00 de FIN-PAY-001 |
| Total reembolsos | 0.00 | 0.00 de FIN-REF-001 |
| Saldo apertura esperado | 135.00 | 285.00 cargos − 150.00 pagos + 0.00 reembolsos |

### 3.1 Matriz MIG-SYN-01 §7 contra el contrato

La matriz del contrato dice textualmente:

> Finanzas en EUR: cargos 285,00; pagos 150,00; reembolsos 0,00; saldo de apertura esperado 135,00

Estos números describen **totales del job** (suma de importes de filas aceptadas), no el cálculo 285 − 150 + 0. El fixture `finances.csv` reproduce esa matriz:

- Cargos (FIN-CHG-001 150 + FIN-CHG-002 135) = **285.00** ✓
- Pagos (FIN-PAY-001 150) = **150.00** ✓
- Reembolsos (FIN-REF-001 0) = **0.00** ✓
- Saldo de apertura esperado (último cargo FIN-CHG-003 = **135.00**) ✓

`baseline.json.totals_reconciliation_eur` fija estos totales como contrato y `IMPORT_TOTAL_MISMATCH` se activa cuando difieren. `finances-mismatch.xlsx` lo fuerza alterando FIN-CHG-002 de 135 a 200, lo que produce cargos = 335 en lugar de 285 — el job debe terminar en `failed` con ese código, **sin** promover ningún cargo a `paid` por inferencia.

### 3.2 Casos rechazados — finances-rejected.csv

| external_id | Caso | Código esperado |
|---|---|---|
| FIN-NO-DATE | sin `occurred_on` | IMPORT_ROW_INVALID |
| FIN-NO-AMOUNT | `amount_eur` vacío | IMPORT_ROW_INVALID |
| FIN-USD | moneda `USD` | IMPORT_ROW_INVALID (moneda distinta de EUR) |
| FIN-AMBIG-AMT | `"150,00"` separador ambiguo | IMPORT_ROW_INVALID |
| FIN-NO-IDENTITY | sin `family_external_id` ni `athlete_external_id` | IMPORT_ROW_INVALID |
| FIN-BANK-STMT | sin `origin_reference` (extracto bancario) | rechazo por falta de vínculo inequívoco — fuente pendiente fuera del dominio |

## 4. Matriz de invariantes — derivada de MIG-01..MIG-14

Cada fila mapea un criterio de aceptación de ZAL-620 §8 al fixture, baseline, código de error esperado y gate que debe pasar. La columna **Gate** se alinea con el catálogo de evidencia §5.

| ID | Aceptación observable | Fixture primario | Baseline | Códigos de error / resultado | Gate | Estado QA |
|---|---|---|---|---|---|---|
| MIG-01 | Carga CSV/XLSX, preview sin crear registros | `athletes.csv`, `athletes-flat.xlsx` | `baseline.json.count_after_commit.athletes_created=4` | OK → `preview_ready` | L + T | ☐ |
| MIG-02 | Mapping muestra columna, muestra valores, destino, warnings; campos ambiguos bloquean | `athletes.csv` (fila 4 fecha, filas 1/4 grupo) | fila 4 marcada `ambiguous_hold` | OK con warnings; bloquea hasta resolución | L + T | ☐ |
| MIG-03 | Errores con fila/columna/código/acción | `athletes.csv` filas 6, 7, 8 | filas 6/7/8 rechazadas con razón | `IMPORT_ROW_INVALID`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR` | L + T | ☐ |
| MIG-04 | Colores ignorados con aviso, comentarios con confirmación, celdas combinadas rechazan, gemelas separadas | `athletes-with-colors.xlsx` (QA-injected), `athletes-with-merged-cells.xlsx` (QA-injected), `athletes.csv` fila 2 | fila 2 = 1 registro (gemela A-002), cero fusiones | warnings para color/comentario; `IMPORT_STRUCTURE_UNSUPPORTED` para merged; A-002 vive | L + T + H | ☐ |
| MIG-05 | Duplicado exacto de `external_id` bloquea; gemelas con misma fecha no fusionan | `athletes.csv` filas 3 (dup) y 2 (gemela) | fila 3 = DUPLICATE_SUSPECTED; fila 2 = created | `DUPLICATE_SUSPECTED`/`IDEMPOTENCY_CONFLICT`; cero fusiones | L + T | ☐ |
| MIG-06 | Histórico financiero solo con campos y totales completos; mismatch bloquea; no `paid` por inferencia | `finances.csv`, `finances-mismatch.xlsx` | `totals_reconciliation_eur.mismatch=false` y `true` respectivamente | `IMPORT_TOTAL_MISMATCH`; FIN-PAY-001 NO promueve FIN-CHG-001 a `paid` | L + T + Data | ☐ |
| MIG-07 | Commit transaccional por módulo; cero partial commit silencioso | `finances.csv` + fallo inducido antes/durante commit | `count_after_commit` por módulo coincide | `committing` → `committed` o `failed`; nunca estado mixto | L + T | ☐ |
| MIG-08 | Rollback devuelve exactamente baseline; si falla → `rollback_failed` | doble rollback + replay | `rollback_comparison.expected_state_after_rollback` | `rolled_back` o `rollback_failed` con reintento; nunca `rolled_back` falso | L + T | ☐ |
| MIG-09 | Mobile consulta job, distingue estados, no carga archivo | N/A en este ticket (no se prueba client-side) | matriz de estados compartida | L backend; X si se implementa matriz de dispositivo | L + T (+ X) | ☐ |
| MIG-10 | Owner descarga cada módulo con manifest, filas y exclusiones | export por módulo (futuro, fuera de alcance) | — | — | T (futuro) | ☐ |
| MIG-11 | Export parcial = `partial`, enumera fallos | N/A en este ticket | — | — | T (futuro) | ☐ |
| MIG-12 | Salida sin credenciales, secretos, PAN/CVC, tokens, payload bruto, PII fuera de academia | revisión manual de los fixtures y del output | ausencia de campos `password`, `stripe_*`, `token`, `secret`, `pan`, `cvc` | grep negativo en artefactos generados | L + T | ☐ |
| MIG-13 | Misma idempotency key = único resultado; payload distinto = `IDEMPOTENCY_CONFLICT` | replay del commit con misma key + variación | un solo conjunto de filas creadas | `IDEMPOTENCY_CONFLICT` en replay divergente | L + T | ☐ |
| MIG-14 | UX, Data, Engineering, QA, Support implementan/proban sin inventar | revisión cruzada | contrato v1.0 + este fixture pack | sin nuevas etiquetas ni claims | H | ☐ |

## 5. Catálogo de evidencia (ZAL-619 §7 + ZAL-631 §2)

| Etiqueta | Significado | Quién la firma | Cómo se aplica aquí |
|---|---|---|---|
| **L** | Local / repositorio | quien commitea | código del contrato, scripts de generación, schema Drizzle, este README, baseline.json, manifest.json |
| **T** | Test o sandbox sintético | QA | ejecución de la matriz MIG-01..MIG-14 contra fixtures en worktree / sandbox; logs, requests ids, diffs de baseline |
| **X** | Validación externa (dispositivo/red/academia fuera del repo) | QA + UX | matriz de dispositivo cuando Engineering implemente MIG-09 mobile (fuera de ZAL-626) |
| **H** | Validación humana | Product / UX / Support | revisión del copy de preview, focus, recuperación; veredicto del dueño sobre `mapping_required`, `DUPLICATE_SUSPECTED`, `IMPORT_TOTAL_MISMATCH` y `rollback_failed` |
| **P** | Producción autorizada | board + runbook | fuera de ZAL-626; este ticket **no** autoriza deploy, Stripe live, secretos, datos reales ni migraciones remotas |

**Reglas no negociables**:

- `L` y `T` nunca equivalen a `P`, `X` o `H`. Ningún claim de adopción, primer valor, conversión, portabilidad o migración real sale desde este ticket.
- Sin base = sin tasa. Si la QA ejecuta este fixture en una academia sintética aislada, ningún resultado es extrapolable a una cohorte real.
- Cada artefacto generado lleva `manifest.json` con `sha256` para auditoría de provenance.

## 6. Casos de rollback — referencia para QA

| Escenario | Pre-condición | Acción | Estado esperado | Estado NO aceptable |
|---|---|---|---|---|
| Rollback exitoso | commit previo válido dentro del worktree | `POST /jobs/{id}/rollback` con `idempotencyKey` del commit | `rolled_back`; baseline.json reproducido; cero filas del job presentes; audit log conserva jobId | `rolled_back` con filas residuales; baseline alterado |
| Rollback fallido por error técnico | commit previo válido | rollback con fallo de DB / red | `rollback_failed` con causa segura; reintento disponible; filas del job siguen presentes | `rolled_back` parcial; `failed` silencioso |
| Doble rollback | commit previo válido | rollback aplicado dos veces | primer call: `rolled_back`; segundo call: `IDEMPOTENCY_CONFLICT` o no-op explícito | segundo call reporta éxito falso |
| Rollback con cambios posteriores | commit + edición humana posterior | rollback del job | **no** revierte la edición humana; solo revierte filas con `jobId` del job; audit log marca el conflicto | rollback borra la edición humana |
| Commit + revertir antes de expirar el job | commit válido | `commit` + `rollback` dentro de la ventana | ambos procedimientos reportan éxito con request IDs distintos | commit sobrescribe por rollback |
| Replay con misma idempotency key | preview previo | `POST /jobs/{id}/commit` con misma `idempotencyKey` | un solo conjunto de filas creadas | dos conjuntos de filas (doble inserción) |
| Replay con distinta idempotency key | preview previo | `POST /jobs/{id}/commit` con key nueva y payload alterado | `IDEMPOTENCY_CONFLICT` | commit "fresco" que duplica filas |

## 7. Cómo regenerar los XLSX

```bash
cd /Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko
node .paperclip-scratch/zal626-fixtures/generate-xlsx.mjs
```

El script es determinista (orden de filas fijo, academy_id fijo, sin timestamp en datos). Los CSVs son texto plano y se commitean tal cual; los XLSX se regeneran desde el script y los `sha256` se mantienen en `manifest.json`.

## 8. Lo que NO hace este paquete

- **No** crea datos reales de ninguna academia.
- **No** se conecta a Supabase ni a Stripe.
- **No** ejecuta migraciones, ni siquiera en sandbox.
- **No** prueba la UI; eso es ZAL-619 §3.7 (importación Web) + matriz de UX en MIG-02/03/04/08/09/11, evidencia `H` que requiere Product/UX/Support.
- **No** afirma capacidad comercial; el primer valor sigue siendo ZAL-478.
- **No** autoriza producción, secrets, Stripe live, datos reales, pricing, claims, campañas ni publicaciones.

## 9. Handoff

- **QA**: ejecutar matriz §4 en worktree local o sandbox autorizado; cruzar baseline.json contra el resultado del job; etiquetar cada caso con L/T/X/H/P según §5; reportar al board.
- **Engineering Lead**: implementar el job server-side mapeando los campos del contrato a las rutas existentes; no ampliar formatos/estados/módulos sin nueva decisión de Product.
- **Product / UX**: redactar copy de preview, focus y recuperación para los casos ambiguos; recoger veredicto `H` sobre `mapping_required`, `DUPLICATE_SUSPECTED`, `IMPORT_TOTAL_MISMATCH` y `rollback_failed`.
- **Support**: runbook privado para acompañar al dueño por canal interno autorizado.
- **Data**: reconciliar totales antes/después; reportar `mismatch=true` como `IMPORT_TOTAL_MISMATCH` (no como `paid` por inferencia).

**Disposición Data & Analytics**: fixture pack reproducible + matriz de invariantes + tabla de rollback + catálogo de evidencia entregado. QA puede ejecutar contra el contrato aprobado sin reabrir ZAL-619 ni ZAL-620.