---
status: active
owner: customer-support
issue: ZAL-860
last_reviewed: 2026-08-20
source:
  - ../vault/04-Marketing/Mensajes aprobados.md
  - ../vault/04-Marketing/Customer success.md
  - ../vault/04-Marketing/Onboarding y activacion.md
  - ../vault/05-Ventas-y-CS/Objeciones y respuestas.md
runbook_piloto:
  rev: 2
  sha: a8219014
  macros_rev: 3
  macros_sha: e7314ba7
---
# FAQ de objeciones — piloto Zaltyko (operador de soporte)

> Material de soporte para el operador durante sesiones del piloto. NO
> reemplaza al runbook concierge rev 2 `a8219014`. Si la academia responde
> con algo fuera de estas 8 objeciones, escalá según §3 del runbook y NO
> improvises (regla §7).

## Cómo usar esta guía

1. Si la academia del piloto lanza una de estas 8 frases, leés la
   respuesta (≤80 palabras) en voz alta o la enviás por el canal vigente.
2. Si la academia insiste o la respuesta abre un flanco nuevo, seguí la
   **ruta de escalación** indicada; no improvises.
3. Si la academia menciona algo marcado como `mobile`, transferí a soporte
   mobile explícitamente (no es lo mismo que soporte web).
4. **Nunca** publiques precios cerrados, claims de "RGPD compliant" ni
   duraciones de SLA: ver macro `L-NO-PRECIO` (rev 3 `e7314ba7`) y
   `vault/04-Marketing/Mensajes aprobados.md`.

---

## 1. «Los datos de los menores van a la nube y eso me preocupa»

**Respuesta (≤80 palabras):** Zaltyko usa aislamiento por academia y
controles de acceso por rol (owner, coach, tutor, staff). La promesa es
"privacidad por diseño", no "cumplimiento RGPD garantizado". El
consentimiento escrito se pide antes de activar cualquier academia con
gimnastas (§0 del runbook). Datos de menores no se comparten entre
academias.

**Ruta:** Engineering Lead + Platform & Security si pide detalle técnico
de aislamiento o retention. Si menciona un menor concreto identificado,
escalá inmediatamente a Platform & Security y CEO (regla §3 del runbook).

---

## 2. «Ya tengo todo en Excel, ¿para qué cambiar?»

**Respuesta (≤80 palabras):** No es un reemplazo de un día para otro. El
objetivo del piloto es validar que el primer valor (registrar una clase y
cobrar la cuota sin fricción) se logra dentro de Zaltyko. Excel sigue
siendo válido para históricos; Zaltyko ordena atletas, clases, cuotas,
asistencia y comunicación diaria. La migración completa es un proyecto
acompañado (Growth/Network), no una migración automática.

**Ruta:** si pide migración de histórico, escalá a Engineering Lead
(alcance y costo) — NO prometas migración automática sin revisar
`Mensajes aprobados.md`.

---

## 3. «Mis coaches no tienen smartphone, ¿cómo registran asistencia?»

**Respuesta (≤80 palabras):** La asistencia se registra desde el panel
web del coach (`/app/[academyId]/attendance`), no desde una app nativa.
Si el coach no tiene smartphone, igual puede registrar desde un
computador del gimnasio o tablet compartida. La promesa de Zaltyko es
"software de gestión para academias deportivas", no "app móvil para
coaches" en MVP.

**Ruta:** si la academia pide app nativa para coaches, escalá a Product
Lead como feature request (no prometido). **Marca `mobile`** si la
pregunta es específica sobre app nativa para familias/tutores — eso es
otro flanco.

---

## 4. «Si cancelo en el día 14, ¿me cobran igual?»

**Respuesta (≤80 palabras):** El trial de Fase 1 son 7 días de Starter
sin tarjeta, una activación por academia cada 12 meses; al terminar vuelve
a Free y no hay cargo automático. "Cancelación día 14" no encaja con la
promesa actual — Free puede dirigir al registro de owner, no a un cargo.
No publiques precios ni política de reembolso cerrada: ver
`Mensajes aprobados.md` y macro `L-NO-PRECIO`.

**Ruta:** Billing → CEO si pide reembolso, disputa o cargo no reconocido
(regla §3 del runbook, escalación con dinero real). NO improvisar política
de cancelación.

---

## 5. «Las familias pagan directo, ¿cómo acredito el cobro?»

**Respuesta (≤80 palabras):** Zaltyko registra la cuota, el estado del
cobro y el historial por familia/gimnasta. La pasarela de pago y la
facturación electrónica completa **no están validadas como listas**
(`Mensajes aprobados.md`, sección "No prometer como listo sin
validación"). Para el piloto: registrar cuota y estado; la familia
puede ver su historial dentro de Zaltyko; la factura fiscal va por
acuerdo separado según plan.

**Ruta:** si pide factura electrónica o exportación contable, escalá a
Engineering Lead + CEO (es un claim no validado). Marca `mobile` si la
pregunta es sobre el portal de familia en app nativa — no existe en MVP.

---

## 6. «¿Mis datos se mezclan con los de otra academia?»

**Respuesta (≤80 palabras):** No. Zaltyko usa aislamiento por academia:
cada academia ve solo sus atletas, clases, cuotas y coaches. Esta es la
promesa permitida ("aislamiento por academia y controles de acceso"). No
publicar "100% seguro" ni "cumplimiento RGPD garantizado" — usar
"privacidad por diseño".

**Ruta:** si detecta evidencia de fuga multi-tenant (datos cruzados),
escalá **inmediatamente** a Engineering Lead + QA + Platform & Security +
CEO (regla §3 del runbook). NO respondas con la promesa; primero
contener.

---

## 7. «¿Puedo pedir factura fiscal?»

**Respuesta (≤80 palabras):** La facturación electrónica completa no está
validada como lista en MVP. Lo que sí está activo: registro de cuotas y
estados de cobro por academia/gimnasta, historial consultable y
exportación por módulo. La factura fiscal requiere alcance y acuerdo
separado según plan (ver `Customer success.md`, contrato operativo).
No prometerla sin evidencia operativa.

**Ruta:** Billing → CEO para definir alcance y, si corresponde, escalación
a Product Lead. NO improvisar fechas ni formato fiscal.

---

## 8. «¿Tienen app para que las familias vean la info?»

**Respuesta (≤80 palabras):** Hoy la promesa es "comunicación prioritaria
dentro de Zaltyko" vía mensajes, avisos, notificaciones e historial por
gimnasta/familia/grupo. App nativa/branded para padres **no es parte del
MVP** (`Mensajes aprobados.md`, sección "No prometer como listo sin
validación"). Marca esta objeción como **`mobile`** y transferí a soporte
mobile; no es un flanco web.

**Ruta:** **mobile** — escalación a Engineering Lead (mobile) +
Product Lead (feature request). NO prometer app nativa ni fechas.

---

## Regla de oro

- **8 objeciones cubiertas** = 8 respuestas aprobadas. Cualquier variante
  nueva → escalación §3 del runbook.
- **No improvisar.** Si la academia insiste o menciona un menor
  identificado, un cobro no reconocido o datos cruzados entre academias,
  escalación inmediata.
- **No publicar precios, SLAs, RGPD "compliant", ni duraciones cerradas**
  sin evidencia operativa (macro `L-NO-PRECIO`, rev 3 `e7314ba7`).
- **Marca `mobile`** siempre que la academia pregunte por app nativa
  para familias/tutores. Es otro flanco.

## Referencias cruzadas

- Runbook concierge piloto rev 2: `a8219014` (§3 escalación, §7 no-acuse).
- Macros de respuesta rev 3: `e7314ba7` (incluye `L-NO-PRECIO`).
- Mensajes aprobados: `vault/04-Marketing/Mensajes aprobados.md`.
- Customer success (desactualizado): `vault/04-Marketing/Customer success.md`.
- Onboarding y activación (desactualizado): `vault/04-Marketing/Onboarding y activacion.md`.
- Objeciones y respuestas (legacy): `vault/05-Ventas-y-CS/Objeciones y respuestas.md`.
- Cierre de sesión: `docs/onboarding-piloto-cierre-sesion.md`.
- Registro mínimo: `docs/onboarding-piloto-registro-minimo.md`.
