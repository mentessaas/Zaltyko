---
status: draft
owner: marketing
last_reviewed: 2026-08-02
source:
  - ../00-Inicio/Guia de trabajo para agentes.md
  - ./Mensajes aprobados.md
  - ./Buyer personas.md
---

# Brief — Copy de consentimiento (consent gate) (DRAFT)

> **DRAFT — no publicar.** Este brief se prepara mientras ZAL-158 (Consent gate tracking) está bloqueado esperando gate privacy de Hermin. Cuando el gate privacy abra, se entrega a Web Dev para implementación; la versión final debe pasar aprobación board antes de tocar `Mensajes aprobados.md`.
> Owner: Marketing (04643dd6). Lead proyecto GTM-DEP.

## 1. Principio de cadena única

Una sola decisión del usuario controla tres efectos encadenados:

1. **Consent** — el visitante dice sí/no a que Zaltyko mida uso con fines de producto.
2. **Tracking** — si dijo sí, se registran eventos first-party (page_view, signups) en `growth_events` para entender el funnel.
3. **Email marketing** — si dijo sí, puede recibir la secuencia Resend d0/d2/d7 (ver ZAL-139, plantillas Resend) y comunicaciones de producto posteriores.

**No se exponen flags separados** ("tracking sí pero email no", "email sí pero tracking no"). La razón: pedir granularidad sin valor real para el usuario genera fricción y abandono del funnel sin protegerlo mejor; además la atribución pierde coherencia (un signup atribuido a `paid` sin email de seguimiento tiene peor conversión observada que uno con secuencia completa).

## 2. Buyer persona a la que habla el copy

Primario: **Emprendedor deportivo** (dueño de academia) según [[Buyer personas]]. Llega desde una landing hispanohablante, normalmente en LATAM. Valora claridad y rapidez; desconfía de banners largos o jargon legal.

## 3. Texto propuesto — versión ES

### Banner — estado inicial (compact, debajo del hero)

> **Título:** Mejora Zaltyko con tu ayuda
>
> **Cuerpo:** Usamos datos de uso (qué páginas visitas y cuándo te registras) para entender qué funciona y qué no. Si aceptas, también te enviaremos correos de onboarding y avisos de producto. Si no aceptas, Zaltyko funciona igual: solo no mediremos tu recorrido ni te llegaran correos automáticos.
>
> Puedes cambiar tu decisión cuando quieras desde tu cuenta.
>
> [Aceptar] [Rechazar] [Ver política de privacidad]

### Banner — estado recordatorio (si el usuario ya eligió antes en este navegador)

> Ya elegiste [aceptar/rechazar] el [fecha]. Puedes cambiarlo cuando quieras desde tu cuenta.

### Micro-copy auxiliar

- **Botón aceptar:** "Aceptar y registrarme"
- **Botón rechazar:** "Continuar sin seguimiento"
- **Tooltip del enlace a política:** "Qué datos recogemos y cómo los usamos"
- **Confirmación tras elección:** "Listo, gracias. Puedes cambiar esto en cualquier momento desde tu cuenta."

## 4. Texto propuesto — versión EN (cuando aplique; gating pendiente confirmar con i18n)

> **Title:** Help us improve Zaltyko
>
> **Body:** We use usage data (which pages you visit and when you sign up) to understand what works. If you accept, we'll also send you onboarding and product emails. If you don't, Zaltyko still works: we just won't measure your journey or send you automated emails.
>
> You can change your choice anytime from your account.
>
> [Accept] [Decline] [View privacy policy]

## 5. Lo que el copy NO promete

Coherente con [[Mensajes aprobados#CTAs y claims seguros]] y [[Mensajes aprobados#No prometer como listo sin validacion]]:

- No dice "RGPD Compliant" ni "100% privado".
- No promete "cero emails" si rechaza (pueden llegar correos transaccionales críticos: recuperación de cuenta, recibos de pago, avisos legales). El banner aclara que NO aceptarlos son correos automáticos de marketing/onboarding.
- No promete duración cerrada de conservación de datos.
- No menciona WhatsApp ni integraciones externas; el consentimiento es estrictamente para Zaltyko.

## 6. Lo que Marketing necesita del board antes de promover

1. Confirmación de que el principio de cadena única es aceptable (vs granularidad).
2. Confirmación del idioma inicial (ES solamente, o ES + EN desde día uno).
3. Confirmación de la posición visual (debajo del hero vs modal vs barra inferior).
4. Confirmación de la redacción final tras gate privacy de Hermin (revisión obligatoria copy ↔ privacy).

## 7. Estado y próximos pasos

- **Estado**: draft interno, listo para circular a Hermin (privacy) y Web Dev cuando ZAL-158 entre a implementación.
- **Próximo paso (este lead)**: registrar este draft en el comentario de coordinación de ZAL-191.
- **Próximo paso (cuando ZAL-158 unblock)**: refinar copy tras feedback de Hermin; circular v2 a board para aprobación; entregar a Web Dev para integrar en banner.
- **Próximo paso (post-implementación)**: medir tasa de aceptación/rechazo y ajustar copy si la distribución muestra fricción (sin cruzar denominador cero mientras no haya muestra).