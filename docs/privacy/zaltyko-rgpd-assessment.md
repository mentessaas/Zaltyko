# Evaluación RGPD inicial — Owner Dashboard, Health Score e Insights

> Documento técnico de diseño, no dictamen jurídico. La base jurídica, reparto
> responsable/encargado, plazos y EIPD deben ser aprobados por asesoría/DPD.

## Decisiones de minimización

- Dashboard y score consumen agregados; no incluyen nombres, email, teléfono,
  dirección, salud ni notas de menores.
- Eventos, outbox y evidencia de insights usan ids técnicos y cantidades.
- La bandeja owner no enumera familias o atletas.
- `athlete_retention_risk` permanece `draft`: no se activa perfilado individual
  de menores sin EIPD, necesidad/proporcionalidad, información y salvaguardas.
- Fixtures y previews son sintéticos y neutrales.

Estas decisiones siguen protección desde el diseño y minimización del artículo
25 RGPD. El artículo 32 exige confidencialidad, integridad, disponibilidad,
resiliencia, restauración y verificación regular; por eso RLS no se considera
control suficiente por sí solo. Fuente oficial:
https://eur-lex.europa.eu/eli/reg/2016/679/oj/spa

## Inventario mínimo

| Finalidad           | Datos                                                | Superficie  | Retención propuesta                    |
| ------------------- | ---------------------------------------------------- | ----------- | -------------------------------------- |
| prestar clases      | identidad, relación familiar, enrollment, asistencia | operaciones | decisión legal pendiente               |
| cobrar y conciliar  | pagador, obligación, pago, refund                    | ledger      | obligación fiscal/legal pendiente      |
| dirigir academia    | métricas agregadas, score, calidad                   | analytics   | snapshots versionados; plazo pendiente |
| recomendar acciones | evidencia agregada, regla, actor, outcome            | insights    | durante relación + plazo pendiente     |
| seguridad           | denegaciones, auditoría, ids técnicos                | audit       | plazo pendiente según riesgo           |

No se fija un plazo “plausible” sin base real. El prepiloto requiere un cuadro de
conservación aprobado, borrado/anonimización verificable y procedimiento de
acceso, rectificación, supresión, limitación, portabilidad y oposición.

## EIPD

El tratamiento afecta de forma sistemática a menores, personas especialmente
vulnerables, y puede incorporar perfilado si se activan riesgos individuales.
La decisión prudente es realizar una EIPD antes de esa activación y registrar el
análisis aunque finalmente el DPD determine otro umbral. El artículo 35 RGPD
exige EIPD cuando sea probable un alto riesgo; la guía AEPD recomienda gestionar
el riesgo durante todo el ciclo de vida:

- https://www.aepd.es/guias/gestion-riesgo-y-evaluacion-impacto-en-tratamientos-datos-personales.pdf
- https://www.aepd.es/derechos-y-deberes/cumple-tus-deberes/medidas-de-cumplimiento/evaluacion-del-riesgo-que-un

## Gate previo a datos reales

- [ ] determinar responsable/encargado y firmar DPA;
- [ ] base jurídica y deber de información por finalidad;
- [ ] EIPD/registro de decisión con participación del DPD;
- [ ] conservación y borrado, incluidos backups;
- [ ] flujo de derechos y verificación de identidad;
- [ ] subencargados, transferencias y regiones documentadas;
- [ ] respuesta a brechas y canal de escalado;
- [ ] confirmar que logs, métricas, soporte y analítica no capturan PII.
