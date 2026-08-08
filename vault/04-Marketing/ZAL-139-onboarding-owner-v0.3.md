# ZAL-139 — Plantillas d0/d2/d7 para onboarding owner

- **Issue:** [ZAL-139](/ZAL/issues/ZAL-139)
- **Padre:** [ZAL-130](/ZAL/issues/ZAL-130)
- **Revisión Growth:** [ZAL-141](/ZAL/issues/ZAL-141)
- **Versión:** v0.3 — incorpora veredicto P&S en ZAL-313 (B1 + B3)
- **Estado:** NO ACTIVAR. Copy listo para re-revisión de P&S.

## 1. Corrección de alcance

Esta secuencia se dirige al **owner de la academia**, no a la atleta. Su objetivo es llevar al owner a la siguiente tarea pendiente de la configuración.

La etiqueta histórica de la issue dice “Resend”, pero el producto actual envía email transaccional con **Brevo** (`src/lib/brevo.ts` y `sendEmailWithLogging`). No existe integración Resend en el código. Por tanto:

- El copy y las variables de este documento son independientes del proveedor.
- La integración técnica debe usar el transporte vigente de Brevo salvo decisión técnica posterior, implementada y validada por Engineering.
- No se conecta ningún trigger ni se activa la secuencia desde este entregable.

El flujo as-built tampoco usa `claim`, `invite` ni `first_class` como claves de onboarding. Las claves reales están en `src/lib/onboarding-utils.ts`; la secuencia debe resolver la siguiente tarea pendiente desde `onboarding_checklist_items`.

## 2. Restricciones de copy

- Tono cercano, directo y sin presión.
- Español neutro para dueños de academias de gimnasia artística y rítmica.
- No mencionar acrobática ni trampolín como producto soportado.
- No incluir precios, descuentos ni promesas de plan.
- No prometer tiempos cerrados de configuración.
- No prometer reunión, llamada ni atención inmediata.
- Cada email tiene un único CTA principal hacia la siguiente tarea pendiente.
- El email se envía al owner; el flujo de la atleta vive en [ZAL-138](/ZAL/issues/ZAL-138).

## 3. Tareas de onboarding admitidas

El integrador resuelve `next_step_key` desde estas claves reales:

| `next_step_key` | Etiqueta sugerida |
|---|---|
| `add_5_athletes` | Añadir mis primeras atletas |
| `create_first_group` | Crear mi primer grupo |
| `setup_weekly_schedule` | Revisar mi horario semanal |
| `invite_first_coach` | Invitar a mi primer entrenador |
| `enable_payments` | Configurar métodos de pago |
| `send_first_communication` | Enviar mi primera comunicación |
| `login_again` | Volver a mi academia |
| `done` | Sin CTA; NO ENVIAR |

El alta actual puede crear grupos y horarios base automáticamente. Por eso el primer paso pendiente habitual será `add_5_athletes`, pero el template nunca lo presume: usa el estado vivo de la academia antes de cada envío.

## 4. Variables y fallbacks

| Variable | Tipo | Uso | Fallback |
|---|---|---|---|
| `owner_first_name` | string | Saludo | omitir el nombre y usar “Hola” |
| `owner_email` | email | Destinatario | sin fallback; si falta, NO ENVIAR |
| `academy_id` | UUID | Idempotencia y scope | sin fallback; si falta, NO ENVIAR |
| `academy_name` | string | Cuerpo | “tu academia” |
| `academy_created_at` | ISO datetime | Cálculo d0/d2/d7 | sin fallback; si falta, NO ENVIAR |
| `next_step_key` | enum de §3 | Lógica | sin fallback; si falta, NO ENVIAR |
| `next_step_label` | string | CTA | etiqueta canónica de §3 |
| `next_step_url` | URL HTTPS absoluta | Destino del CTA | sin fallback; si falta, NO ENVIAR |
| `remaining_steps_count` | int ≥ 0 | Telemetría/QA | recalcular; no mostrar en copy |
| `owner_locale` | enum | Localización | solo `es` en v0.3; otro locale NO ENVIAR |
| `unsubscribe_url` | URL HTTPS absoluta | Baja y footer de cumplimiento | obligatorio |
| `preferences_url` | URL HTTPS absoluta | Preferencias y footer de cumplimiento | obligatorio |

No usar datos de billing, tarjeta, plan, dirección, documentos ni información de atletas en el payload de copy.

## 5. Plantillas finales

Los subjects son fijos para evitar que nombres largos excedan 60 caracteres. No hay A/B test ni branching por apertura en v0.3.

### 5.1 d0 — academia creada

- **Evento candidato:** `academy_created`, emitido después de completar la transacción de alta.
- **Idempotency key:** `onboarding-owner:{academy_id}:d0`.
- **Regla:** una sola vez por academia y solo si existe una tarea pendiente válida.

**Subject:** Tu academia en Zaltyko ya está lista

**Preheader:** Entra al panel y continúa desde la siguiente tarea pendiente.

**Body:**

```text
Hola {{owner_first_name}},

{{academy_name}} ya está creada en Zaltyko. Puedes continuar la configuración desde el punto que sigue pendiente:

{{next_step_label}}

{{next_step_url}}

Si ya completaste esa tarea, al entrar verás el siguiente paso disponible.

Puedes ajustar tus preferencias en {{preferences_url}} o darte de baja en {{unsubscribe_url}}. Esta secuencia no afecta al servicio.

— El equipo de Zaltyko
```

**CTA:** `{{next_step_label}}` → `{{next_step_url}}`

**Línea de cumplimiento:** `{{preferences_url}}` + `{{unsubscribe_url}}`. No es CTA; es control de cumplimiento (GDPR Art. 7(3) y CAN-SPAM). El header `List-Unsubscribe` cubre el RFC pero no la fricción operativa ni los clientes que ignoran headers.

### 5.2 d2 — retomar configuración

- **Momento:** 48 horas después de `academy_created`.
- **Idempotency key:** `onboarding-owner:{academy_id}:d2`.
- **Regla:** recalcular el estado antes de enviar. Si la tarea de d0 ya se completó, el CTA apunta a la siguiente pendiente. Si no queda ninguna, NO ENVIAR.

**Subject:** Siguiente paso para configurar tu academia

**Preheader:** Tu progreso está guardado; retoma la configuración donde la dejaste.

**Body:**

```text
Hola {{owner_first_name}},

Tu progreso en {{academy_name}} está guardado. Cuando quieras continuar, esta es la siguiente tarea pendiente:

{{next_step_label}}

{{next_step_url}}

Si ya la completaste, puedes ignorar este correo. No enviaremos otro recordatorio hasta el día 7.

Puedes ajustar tus preferencias en {{preferences_url}} o darte de baja en {{unsubscribe_url}}. Esta secuencia no afecta al servicio.

— El equipo de Zaltyko
```

**CTA:** `{{next_step_label}}` → `{{next_step_url}}`

**Línea de cumplimiento:** `{{preferences_url}}` + `{{unsubscribe_url}}`. No es CTA; es control de cumplimiento (GDPR Art. 7(3) y CAN-SPAM). El header `List-Unsubscribe` cubre el RFC pero no la fricción operativa ni los clientes que ignoran headers.

### 5.3 d7 — cierre de la secuencia

- **Momento:** 7 días después de `academy_created`.
- **Idempotency key:** `onboarding-owner:{academy_id}:d7`.
- **Regla:** enviar solo si queda al menos una tarea pendiente válida. Recalcular `next_step_key` justo antes del envío.

**Subject:** Último recordatorio de tu configuración

**Preheader:** Cerramos esta secuencia; tu progreso seguirá guardado en Zaltyko.

**Body:**

```text
Hola {{owner_first_name}},

Cerramos esta secuencia de configuración de {{academy_name}}. Tu progreso seguirá guardado y puedes retomarlo cuando quieras desde esta tarea:

{{next_step_label}}

{{next_step_url}}

Este es el último recordatorio automático de la secuencia. Puedes ajustar tus preferencias en {{preferences_url}} o darte de baja en {{unsubscribe_url}}.

— El equipo de Zaltyko
```

**CTA principal:** `{{next_step_label}}` → `{{next_step_url}}`

Los enlaces de preferencias y baja son controles de cumplimiento, no CTAs de conversión.

## 6. Gate de elegibilidad y NO envío

Antes de cada email, el integrador evalúa todas estas reglas:

| Condición | Acción |
|---|---|
| Falta `academy_created` o `academy_created_at` | NO ENVIAR |
| Falta `academy_id` u `owner_email` | NO ENVIAR |
| `academy.status` es `churned`, `suspended` o `fraud_hold` | NO ENVIAR |
| Owner dado de baja, suprimido o con bounce permanente | NO ENVIAR |
| `owner_locale != es` | NO ENVIAR en v0.3 |
| No existe una tarea pendiente elegible | NO ENVIAR |
| `next_step_key == done` | NO ENVIAR |
| `next_step_url` no es HTTPS absoluta o no pertenece a una ruta permitida de Zaltyko | NO ENVIAR y registrar `missing_or_invalid_next_step` |
| La idempotency key ya está en estado `sent` | NO ENVIAR duplicado |
| La tarea cambió desde el email anterior | Recalcular label y URL; no reutilizar payload antiguo |

El evento `academy_created` habilita d0; no lo bloquea. La condición de deduplicación es la idempotency key del email, no la existencia del evento de alta.

## 7. Criterios de aceptación para Web Developer

- [ ] Confirmar que el transporte activo será Brevo o documentar una decisión técnica distinta; no asumir Resend por el título histórico.
- [ ] Confirmar `academy_created` como origen temporal o proponer el evento real equivalente ya persistido.
- [ ] Resolver `next_step_key` desde las claves reales de §3 y `onboarding_checklist_items`.
- [ ] Mantener scope por `academy_id` y owner autorizado.
- [ ] Construir `next_step_url` en servidor desde un allowlist; nunca aceptar una URL arbitraria del cliente.
- [ ] Escapar todas las variables en HTML.
- [ ] Implementar idempotencia durable para d0/d2/d7.
- [ ] Recalcular la siguiente tarea justo antes de cada envío.
- [ ] Persistir `sent`, `skipped`, `bounced` y el motivo de no envío con timestamp UTC.
- [ ] No implementar tracking de apertura ni A/B test en v0.3.
- [ ] Mantener la secuencia desactivada hasta que QA y Platform & Security firmen.

## 8. Checklist QA en local/sandbox

1. [ ] Alta válida: d0 se genera una vez para `owner_email`.
2. [ ] Retry con la misma idempotency key: no duplica d0.
3. [ ] Si el paso de d0 se completa antes de d2, d2 muestra la siguiente tarea pendiente.
4. [ ] Si todas las tareas están completas antes de d7, d7 NO se envía.
5. [ ] `unsubscribed=true` antes de d2: d2 y d7 NO se envían.
6. [ ] Bounce permanente o `fraud_hold`: ningún email se envía.
7. [ ] `next_step_url=null`, HTTP o fuera del allowlist: NO se envía y queda `missing_or_invalid_next_step`.
8. [ ] `owner_locale=en`: ningún email de v0.3 se envía.
9. [ ] El destinatario siempre es `owner_email`; nunca se usa el email de una atleta.
10. [ ] Nombre de academia con `<`, `>`, `&`, comillas y 120 caracteres: HTML escapado y subject ≤60 porque no interpola nombres.
11. [ ] El transporte de sandbox usa el adapter vigente y no hace llamadas a Resend inexistentes.
12. [ ] d2 no sale antes de 48 h y d7 no sale antes de 7 días, con la tolerancia acordada por Engineering.
13. [ ] En d0, d2 y d7 aparecen enlaces HTTPS válidos de preferencias y baja.
14. [ ] Sin tracking de apertura: la selección de subject no cambia y no se emite `email.opened` desde esta secuencia.

## 9. Privacidad y deliverability

- Tracking de apertura y píxel quedan fuera de v0.3.
- `List-Unsubscribe` y el enlace de baja deben estar presentes en cada uno de los tres mensajes (footer visible en d0, d2 y d7; ver §5.1, §5.2 y §5.3).
- El HTML no incluye datos sensibles ni información de atletas.
- SPF, DKIM, DMARC y remitente deben corresponder al proveedor/transporte vigente de sandbox antes del QA de entrega.
- Platform & Security debe firmar el tratamiento de consentimiento, supresión y baja antes de activar la secuencia.

**Base legal RGPD.** Art. 6(1)(b) — ejecución del contrato de servicio Zaltyko — para d0/d2/d7. Esta secuencia es onboarding transaccional del owner con academia activa, no mercadotecnia ni prospección, y por tanto no requiere consentimiento Art. 6(1)(a). La baja de la secuencia (Art. 7(3)) no afecta al servicio principal. Si en una iteración futura alguno de los tres pasos se reutiliza para re-engagement de usuarios inactivos, deberá reabrirse esta nota con base legal Art. 6(1)(a) + consentimiento explícito.

**Aplicación extraterritorial.** RGPD aplica según **dónde está el usuario**, no dónde está la empresa (instrucción del board 2026-08-04). Esta base legal cubre al owner localizado en EEE/UK/Suiza con independencia del país donde Zaltyko preste el servicio o aloje los datos. Para owners fuera de ese perímetro, la base legal sigue siendo contractual (prestación del servicio contratado) y el footer de baja sigue siendo exigible como control operativo y por CAN-SPAM donde aplique.

## 10. Medición

[ZAL-140](/ZAL/issues/ZAL-140) conserva el contrato TTFAA. No se fijan objetivos porcentuales de apertura, CTR o conversión con N=0.

Para la primera cohorte se registran valores crudos:

- emails elegibles, enviados, omitidos y rebotados por d0/d2/d7;
- clicks en CTA solo si existe instrumentación consentida;
- academias que completan la tarea después de cada envío;
- bajas por día de la secuencia.

Con menos de 3 academias elegibles, el estado es **sin base**. La primera cohorte reportable será baseline, no promesa.

## 11. Gates y ownership

| Gate | Owner | Acción |
|---|---|---|
| Copy v0.3 | Content + Growth | Revisar esta versión contra el veredicto P&S en [ZAL-313](/ZAL/issues/ZAL-313) (B1 + B3 aplicados; B2 delegado a Web Developer) |
| Variables, claves, evento e idempotencia | Web Developer | Confirmar §7 contra el código as-built |
| Escenarios de envío | QA | Ejecutar §8 en localhost/sandbox |
| Consentimiento, supresión y baja | Platform & Security | Firmar §9; no hay tracking de apertura en v0.3 |
| Sales freeze | Board | Autorizar explícitamente la activación si el freeze vigente cubre onboarding transaccional |

Ninguno de estos gates autoriza publicación, producción, campañas ni datos reales. La activación es una subtarea de Engineering posterior al cierre de las revisiones.

B2 (`List-Unsubscribe-Post: One-Click` RFC 8058 + separación sandbox|prod para DMARC) queda fuera del scope de Content y debe absorberse vía Web Developer (ZAL-311 o subtarea específica). Decisión de quien asuma Content sobre cómo abrir esa delegación — no la abro desde aquí para no usurpar ownership.

## 12. Changelog

- **v0.1** — borrador inicial d0/d2/d7.
- **v0.1.1** — incorporó la review Growth, pero mantuvo contradicciones con el producto as-built.
- **v0.2 (2026-08-04)** — corrige transporte Brevo vs Resend, reemplaza claves inexistentes por el checklist real, elimina A/B y tracking de apertura, corrige la deduplicación d0, recalcula la tarea pendiente en d2/d7, elimina promesas de tiempo y sustituye objetivos sin muestra por baseline `sin base`.
- **v0.3 (2026-08-06)** — aplica veredicto P&S en ZAL-313:
  - **B1** — añade footer visible de baja y preferencias en §5.1 (d0) y §5.2 (d2) con la misma forma que §5.3 (d7). Refuerza §9 y §8.13 para que la presencia del footer sea verificable en QA.
  - **B3** — añade bloque explícito de base legal RGPD Art. 6(1)(b) en §9 con nota sobre aplicación extraterritorial (instrucción del board 2026-08-04) y aviso de re-apertura si se reorienta a re-engagement.
  - **B2** queda fuera de scope (delegación a Web Developer / ZAL-311) y se documenta en §11 sin tocar §7.
  - Sin cambios en §3 (claves), §6 (gates de NO envío), §10 (medición) ni en la separación sandbox|prod.
