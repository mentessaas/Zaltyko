---
status: active
owner: customer-support
issue: ZAL-860
last_reviewed: 2026-08-20
source:
  - ../vault/04-Marketing/Customer success.md
  - ../vault/04-Marketing/Onboarding y activacion.md
  - ../vault/04-Marketing/Mensajes aprobados.md
runbook_piloto:
  rev: 2
  sha: a8219014
  section: §6 (plantillas de cierre)
macros:
  rev: 3
  sha: e7314ba7
---
# Plantilla de cierre de sesión de onboarding — piloto

> Material complementario al runbook concierge rev 2 `a8219014`, §6.
> Plantilla **copy-paste** para los 5 estados de cierre. Usá siempre el
> bloque que corresponda; no improvises redacción.

## Cuándo se usa cada plantilla

| Estado | Cuándo aplica | Cuándo NO aplica |
| --- | --- | --- |
| **activado** | Academia firmó consentimiento, completó §1 del runbook y registró al menos un atleta o una clase real. | Si solo registró metadata pero no hubo atletas/clases. |
| **riesgo** | Academia firmó consentimiento pero hay señales de fricción (≥2 tickets S2 en 7 días, owner no responde en plazo §3.2,Mobile sin contestar). | Si la academia abandona directamente → usar `abandono`. |
| **incidente** | Hubo S0/S1, magic-link filtrado, datos cruzados entre academias o evento de seguridad. | Si solo fue fricción menor sin impacto → usar `riesgo`. |
| **abandono** | Academia dejó de responder por ≥14 días tras consentimiento_ok, o pidió baja explícita. | Si todavía está en plazo §3.2 → usar `riesgo`. |
| **sin_conversion_observada** | Pasaron 30 días desde consentimiento_ok y no hay primer_registro_atleta ni primer_cobro_intentado. | Si hubo registro pero sin cobro → evaluar `riesgo` o `activado` según contexto. |

## Tabla d0/d3/d7/d14 ↔ línea de §4 del runbook

Esta tabla cruza las intervenciones de `Customer success.md` (marcado
desactualizado) con la línea de §4 del runbook. Usala para decidir cuándo
aplicar cada plantilla de cierre.

| Día | Intervención `Customer success.md` | Línea §4 runbook | Plantilla de cierre sugerida si la intervención falla |
| --- | --- | --- | --- |
| **d0** | Setup guiado. | Plantilla de sesión inicial: academia → grupos → gimnastas → invitaciones. | `abandono` si owner no responde en plazo §3.2. |
| **d3** | Primer cobro/clase. | Línea "primer valor": al menos un atleta registrado + una clase agendada o un cobro intentado. | `sin_conversion_observada` si no hubo registro ni cobro a d3. |
| **d7** | Revisar valor logrado. | Línea "valor": la academia ve el dashboard con atletas/clases/cobro reales. | `riesgo` si d7 llegó sin valor observable (≥2 tickets S2). |
| **d14** | Decisión de plan o expansión. | Línea "expansión": la academia conversa sobre upgrade o segunda sede. | `activado` si d14 llegó con valor y el owner confirma continuidad. |

## Plantillas copy-paste

> Las cinco plantillas siguientes son **bloques textuales** que el operador
> puede copiar y pegar (con los tokens de anonimización ya aplicados).
> NO contienen PII, NO contienen precios cerrados, NO contienen claims de
> RGPD "compliant".

### 1. activado

```
Asunto: [Zaltyko piloto] academia-<hash8> — sesión d<N> cerrada en estado activado

Hola <owner>,

Cerramos la sesión de hoy de la academia `<academia_hash>` en estado
**activado**. Resumen:

- Consentimiento escrito: firmado <fecha> (§0 runbook).
- Academia, grupos y gimnastas: registrados según §1.
- Primer valor visible en panel: <token-clase> con al menos un atleta.
- Sin tickets S0/S1 abiertos.

Próximos pasos (customer success d7/d14):
- d7: revisamos valor logrado y panel.
- d14: conversación sobre plan o expansión.

Si necesitás algo antes, respondé por este mismo canal.

— Soporte Zaltyko piloto (runbook rev 2 a8219014)
```

### 2. riesgo

```
Asunto: [Zaltyko piloto] academia-<hash8> — sesión d<N> cerrada en estado riesgo

Hola <owner>,

Cerramos la sesión de hoy en estado **riesgo** por las señales siguientes:

- <motivo 1: p.ej. ≥2 tickets S2 en 7 días>
- <motivo 2: p.ej. respuesta fuera de plazo §3.2>

No escalamos todavía, pero necesitamos tu confirmación sobre los puntos
arriba para mantener la sesión abierta. Si en <plazo §3.2> no hay
respuesta, §7 del runbook aplica la regla de no-acuse (CEO recibe el
caso; el operador no baja la severidad).

Próximo contacto: <fecha d+3>.

— Soporte Zaltyko piloto (runbook rev 2 a8219014)
```

### 3. incidente

```
Asunto: [Zaltyko piloto] academia-<hash8> — sesión d<N> cerrada en estado incidente (escalado)

Hola <owner>,

Registramos un incidente de severidad S<n> en la academia `<academia_hash>`
durante la sesión de hoy:

- <descripción técnica sin PII>
- Severidad: S<n> (runbook §2).
- Escalado a: <lista de roles §3, sin nombres propios>.

Acción inmediata: <contención / siguiente paso>. Plataforma & Seguridad
está copiada. Más detalles por el canal seguro en <plazo>.

— Soporte Zaltyko piloto (runbook rev 2 a8219014)
```

### 4. abandono

```
Asunto: [Zaltyko piloto] academia-<hash8> — cierre por abandono

Hola <owner>,

Cerramos la sesión de la academia `<academia_hash>` en estado
**abandono** tras <N> días sin respuesta desde <último contacto>.

Si querés retomar, respondé por este canal y reagendamos. La academia
queda en estado Free hasta que pidas reactivación.

No publicamos ni cobramos nada; ver macro `L-NO-PRECIO` (rev 3 e7314ba7).

— Soporte Zaltyko piloto (runbook rev 2 a8219014)
```

### 5. sin_conversion_observada

```
Asunto: [Zaltyko piloto] academia-<hash8> — cierre sin conversión observada (30d)

Hola <owner>,

Pasaron 30 días desde tu consentimiento_ok y no registramos
`primer_registro_atleta` ni `primer_cobro_intentado` para
`<academia_hash>`. Cerramos en estado **sin_conversion_observada**.

Esto NO es un cobro ni una baja: la academia sigue en Free hasta que
 actives algo. Si querés retomar, respondé por este canal y
 reagendamos.

Si lo que pasó fue un bloqueo técnico nuestro, escalá con tu número de
ticket y lo revisamos.

— Soporte Zaltyko piloto (runbook rev 2 a8219014)
```

## Reglas operativas

1. **Una sola plantilla por sesión.** Si coexisten dos estados (ej.
   activado + incidente menor), va el de mayor severidad.
2. **Tokens, nunca nombres.** Reemplazá cualquier nombre propio por el
   token (`atleta-1`, `tutor-A`, `clase-X`, etc.) antes de enviar.
3. **Sin precios, sin SLA cerrado, sin RGPD "compliant".** Ver macro
   `L-NO-PRECIO` (rev 3 `e7314ba7`) y `Mensajes aprobados.md`.
4. **Marca `mobile`** en `nota_operador` si el flanco era app nativa —
   el cierre no lo absorbe.
5. **§7 del runbook**: si el owner no responde en plazo §3.2, CEO recibe
   el caso; el operador **no** baja la severidad ni reasigna.

## Referencias cruzadas

- Runbook concierge piloto rev 2: `a8219014` (§3 escalación, §4 plantilla
  de sesión, §6 plantillas de cierre, §7 regla de no-acuse).
- Macros de respuesta rev 3: `e7314ba7` (incluye `L-NO-PRECIO`).
- Mensajes aprobados: `vault/04-Marketing/Mensajes aprobados.md`.
- Customer success (desactualizado): `vault/04-Marketing/Customer success.md`.
- Onboarding y activación (desactualizado): `vault/04-Marketing/Onboarding y activacion.md`.
- FAQ de objeciones: `docs/onboarding-piloto-faq-objecciones.md`.
- Registro mínimo: `docs/onboarding-piloto-registro-minimo.md`.
