# Borradores legales para validación

> **Borrador generado por IA, no es asesoramiento jurídico; requiere revisión por abogado o servicio jurídico antes de publicarse.**

Esta carpeta contiene borradores. **Nada de lo que hay aquí está publicado** ni
cambia las páginas de zaltyko.com (`src/app/terminos/page.tsx`,
`src/app/politica-privacidad/page.tsx`). Cuando el abogado los apruebe, los
cambios se llevarán a esas páginas en un PR aparte.

Los datos personales del titular aparecen como marcadores:
`[NOMBRE Y APELLIDOS DEL TITULAR]`, `[NIF DEL TITULAR]`,
`[DOMICILIO PROFESIONAL]`. Los valores reales se escriben solo en
`src/lib/launch/commercial-launch-profile.ts`, como indica
`docs/deployment/spain-seller-activation-2026-10-26.md`.

## Qué es cada archivo

| Archivo | Qué contiene |
| --- | --- |
| `contrato-encargado-tratamiento.md` | Contrato del art. 28 RGPD entre la academia (responsable) y Zaltyko (encargado), con tres anexos: descripción del tratamiento, medidas técnicas reales del producto y lista de subencargados con su ubicación. |
| `terminos-cambios-propuestos.md` | Cambios a los Términos en formato texto actual → texto propuesto → motivo: identificación del prestador (LSSI 10), contratación electrónica (LSSI 27 y 28), precios con IVA, desistimiento de 14 días, cancelación y paso a Free, y otros. |
| `privacidad-cambios-propuestos.md` | Cambios a la Política de privacidad con el mismo formato: doble papel responsable/encargado, bases jurídicas, plazos, subencargados, transferencias, derechos, menores, salud y cookies. |

## Hallazgos que más afectan a la revisión

1. **Texto de la casilla de desistimiento.** La casilla actual
   (`desistimiento-14d-v1`) dice que, una vez iniciado el servicio, se pierde el
   derecho de desistimiento. El código la basa en el art. 103.m TRLGDCU
   (contenido digital). Si una suscripción SaaS es un servicio digital, se
   aplicaría el art. 103.a (el derecho solo se pierde cuando el servicio se
   ha prestado por completo) con pago proporcional (art. 108.3). Hay un texto
   alternativo (`desistimiento-14d-v2`) en `terminos-cambios-propuestos.md`, T7.
2. **No hay correo propio de confirmación de la contratación** (LSSI art. 28;
   TRLGDCU art. 98.7, soporte duradero). Hace falta antes de abrir la
   contratación a consumidores.
3. **El producto puede tratar datos de salud**: tipo de documento «Certificado
   Médico» y caducidad del certificado médico en licencias federativas. Hay que
   elegir entre admitirlo (con garantías) o retirar esas funciones.
4. **La exportación de la academia no lo cubre todo**: no incluye los archivos
   (documentos, fotos) ni las tablas del esquema anterior, y no hay supresión
   automática de una academia. El contrato de encargo lo dice tal cual.
5. **Proveedores condicionales con transferencia fuera del EEE**: PostHog usa
   un host de EE. UU. si no se configura otro; el asistente de IA usa MiniMax si
   existe la clave. Hay que confirmar qué está activo en producción.
6. **Los Términos ofrecen el DPA solo «a petición»**: el art. 28.3 RGPD exige
   que el contrato exista antes del tratamiento.

## Lo que no se ha podido verificar

Este borrador se ha redactado leyendo el repositorio, sin acceder a Vercel,
Supabase, Stripe ni a los contratos de los proveedores. No se ha verificado:

- la región de Supabase (`eu-north-1` viene del contexto facilitado; no consta
  en el repositorio) ni el plazo de retención de sus copias de seguridad;
- la región de Upstash, Sentry, Brevo, Hostinger, n8n y FacturaDirecta, ni el
  mecanismo de transferencia de cada proveedor (DPF o cláusulas tipo);
- qué variables opcionales están activas en producción (PostHog, Vercel
  Analytics, Speed Insights, Twilio, MiniMax, Stripe Connect, módulos de
  directorio, eventos, empleo y marketplace);
- si las rutas `/app/[academyId]/…` (documentos y licencias, esquema anterior)
  están accesibles en producción y si contienen datos reales;
- si Stripe envía recibos por correo y si FacturaDirecta envía la factura al
  cliente automáticamente;
- la configuración del portal de clientes de Stripe (cancelación al final del
  periodo);
- que las acciones de súper admin queden registradas en la auditoría;
- si menores de 14 años pueden recibir invitaciones de acceso;
- el cifrado en reposo (se atribuye al proveedor, no se ha comprobado).

## Checklist para quien revise

### Decisiones jurídicas

- [ ] Confirmar el reparto responsable/encargado (incluidas las cuentas del
      personal y de las familias invitadas por la academia).
- [ ] Validar la calificación de la suscripción (servicio digital frente a
      contenido digital) y el texto de la casilla de inicio inmediato.
- [ ] Decidir si el desistimiento se limita a consumidores o se ofrece a todos.
- [ ] Decidir la opción A o B sobre datos de salud.
- [ ] Validar que aceptar el contrato de encargo con una casilla en el registro
      es suficiente (art. 28.9 RGPD).
- [ ] Fijar los plazos marcados «PROPUESTA»: aviso de subencargados (30 días),
      brechas (48 horas), traslado de solicitudes (5 días hábiles), devolución y
      supresión (30 + 30 días), conservación de registros, soporte y facturación.
- [ ] Decidir el límite de responsabilidad (Términos §8 y contrato de encargo,
      cláusula 9), con mínimo para el plan Free.
- [ ] Confirmar que no es obligatorio designar delegado de protección de datos.
- [ ] Decidir si hace falta EIPD antes de abrir a datos reales (la recomienda
      `docs/privacy/zaltyko-rgpd-assessment.md`).
- [ ] Confirmar fuero, adhesión o no a arbitraje de consumo y la referencia a la
      plataforma ODR (suprimida).

### Comprobaciones con los proveedores

- [ ] Descargar y archivar el DPA de Supabase, Vercel, Upstash, Brevo, Sentry,
      Hostinger, Stripe, n8n y FacturaDirecta; anotar región y mecanismo de
      transferencia en el Anexo III.
- [ ] Revisar en Vercel las variables opcionales activas y actualizar el
      Anexo III (apartados B y C).
- [ ] Si PostHog está activo, configurar el host de la UE.
- [ ] No activar MiniMax con datos reales sin análisis de transferencia.

### Cambios técnicos necesarios antes de publicar los textos

- [ ] Correo de confirmación de la contratación con el resumen, la versión de
      los Términos y el texto de la casilla (T5).
- [ ] Guardar la versión de los Términos en los metadatos del Checkout (T4).
- [ ] Enlace a Términos junto a la casilla del plan (T4).
- [ ] Si cambia la casilla: nuevo texto y `IMMEDIATE_START_CONSENT_VERSION =
      "desistimiento-14d-v2"` en
      `src/modules/saas-billing/domain/immediate-start-consent.ts`.
- [ ] Procedimiento escrito de brechas, de derechos y de supresión de una
      academia (incluidos archivos y esquema anterior).
- [ ] Página pública con la lista de subencargados.
- [ ] Política de cookies y enlace para cambiar la elección.
- [ ] Alinear el precio de Network (`src/lib/plans/catalog.ts` dice 99 €/mes).

### Publicación (PR posterior, no este)

- [ ] Completar NIF y domicilio en `commercial-launch-profile.ts` y pasar
      `registrationStatus` a `"verified"`.
- [ ] Llevar los textos aprobados a `src/app/terminos/page.tsx` y
      `src/app/politica-privacidad/page.tsx`, con nueva fecha y versión.
- [ ] Actualizar la versión de la política de consentimiento del registro
      (`owner_signup_consent_policy`) si cambian los textos aceptados.
- [ ] Marcar `legalTextsApproved: true` solo tras la aprobación escrita de
      Elvis y del abogado.
