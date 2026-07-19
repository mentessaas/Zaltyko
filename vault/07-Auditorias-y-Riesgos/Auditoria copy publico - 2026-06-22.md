---
status: active
owner: marketing
last_reviewed: 2026-06-22
source:
  - ../04-Marketing/Mensajes aprobados.md
  - ../01-Producto/Inventario de producto.md
  - ../01-Producto/Vision y propuesta de valor.md
  - ../07-Auditorias-y-Riesgos/Registro de riesgos.md
  - ../src/app/(site)/Hero.tsx
  - ../src/app/(site)/FeaturesSection.tsx
  - ../src/app/(site)/pricing.tsx
  - ../src/app/(site)/Faq.tsx
  - ../src/lib/plans/catalog.ts
---

# Auditoria copy publico - 2026-06-22

## Alcance

Cruce del copy publico de Zaltyko contra [[Mensajes aprobados]] y [[Inventario de producto]]. Superficies revisadas:

- `src/app/(site)/Hero.tsx`
- `src/app/(site)/MakerIntro.tsx`
- `src/app/(site)/FeaturesSection.tsx`
- `src/app/(site)/pricing.tsx`
- `src/app/(site)/Faq.tsx`
- `src/app/(site)/Testimonials.tsx`
- `src/app/(site)/modules/pagos-administracion/page.tsx`
- `src/app/(site)/modules/gestion-atletas/page.tsx`
- `src/app/(site)/modules/eventos-competiciones/page.tsx`
- `src/app/(site)/modules/directorio-academias/page.tsx`
- `src/app/(site)/modules/dashboard-reportes/page.tsx`
- `src/app/(site)/modules/comunicacion/page.tsx`
- `src/app/(site)/modules/clases-horarios/page.tsx`
- `src/app/(public)/marketplace/page.tsx`
- `src/app/(public)/empleo/page.tsx`
- `src/app/(public)/events/page.tsx`

## Reglas de cruce

- [[Mensajes aprobados]] declara como **NO prometido**: facturacion electronica completa, exportacion contable, centro unificado de notificaciones, IA que toma decisiones automaticas, resultados federativos automaticos, soporte enterprise.
- [[Inventario de producto]] declara como **Parcial/avanzado** (QA pendiente): Evaluaciones, Asistencia, Comunicacion, IA, Marketplace/empleo, SEO/i18n.
- Cualquier claim "completo" o "automatico" sobre estas areas es un **roto** hasta que se demuestre lo contrario.

## Hallazgos criticos

### 1. Cifras inventadas en el Hero (ROTO)

`src/app/(site)/Hero.tsx:6-10`:

```tsx
const stats = [
  { label: "Academias", value: "+120", icon: Users },
  { label: "Gimnastas", value: "18k", icon: TrendingUp },
  { label: "Procesado", value: "EUR 3.4M", icon: ShieldCheck },
];
```

No hay evidencia en el repo ni en metricas reales que respalden `+120 academias`, `18k gimnastas` ni `EUR 3.4M procesado`. La vault [[Metricas de marketing y producto]] no recoge datos reales todavia. Mostrar cifras inventadas en una landing es un riesgo legal y de reputacion serio.

**Accion**: o se conectan a datos reales (contador en DB / Sentry / Stripe), o se eliminan las stats y se sustituyen por mensajes cualitativos ("usado por academias pioneras", "en operacion desde...").

### 2. Texto con caracteres chinos en modulo Integraciones (BUG)

`src/app/(site)/FeaturesSection.tsx:130`:

```tsx
"Notificaciones push para提醒 de clases y eventos",
```

Caracteres `提醒` (recordatorio en chino) mezclados con espanol. Es claramente copy a medio traducir o un string mal pegado. Visible al publico.

**Accion**: corregir a "Notificaciones push para recordatorios de clases y eventos".

### 3. Pricing anual matematicamente roto (ROTO)

`src/app/(site)/pricing.tsx:81`:

```tsx
Anual - hasta 20% dto. (proximamente)
```

`src/app/(site)/pricing.tsx:24-27`:

```tsx
annualPrice:
  plan.priceEurCents === 0
    ? "Incluido"
    : `${formatPlanAmount(plan.priceEurCents * 10)}/ano`,
```

El calculo es `precioMensual * 10` (10 meses cobrados = 16,67% descuento), no 12 ni 20%. La promesa de "hasta 20% dto" no es coherente con `* 10`. Si la intencion es 20%, el calculo deberia ser `* 9.6` o `* 10` con descuento correctamente etiquetado.

Ademas, [[Tarea - Validar checkout y planes]] confirma que el plan anual esta como "proximamente" y no hay `stripePriceId` anual. Por lo tanto el banner "Anual - hasta 20% dto" es una promesa que el checkout no cumple.

**Accion**: hasta no implementar price IDs anuales, el banner debe decir solo "Anual (proximamente)" sin porcentaje. O corregir la formula y reflejarla en codigo.

### 4. Plan Growth dice "Academias ilimitadas" pero Starter dice "1 academia" (INCONSISTENCIA)

`src/lib/plans/catalog.ts:50` (Growth) tiene `academyLimit: null` ("ilimitadas") mientras Starter tiene `academyLimit: 1`. El feature bullet de Growth dice "Academias ilimitadas".

Esto choca con el modelo multi-tenant de Zaltyko: el tenant es la academia, no la cuenta de academia. Si una sola academia puede gestionar "academias ilimitadas" sin pagar Network, el upsell a Network pierde valor.

**Accion**: revisar con Elvis si "Academias ilimitadas" en Growth significa "sedes ilimitadas" o es un error de copy. Actualizar [[Pricing]] y `catalog.ts`.

### 5. Mensajes aprobados dice "no prometer como listo" y landing lo hace

Claims en `FeaturesSection.tsx` que cruzan la linea de "NO prometer como listo":

| Claim | Archivo | Razon |
| --- | --- | --- |
| "Exportables PDF para federaciones y padres" | FeaturesSection.tsx:79 | [[Modulo - Evaluaciones]] dice "export visible y permisos tenant" sin validar. |
| "Reportes comparativos entre academias" | FeaturesSection.tsx:81 | No aparece en [[Inventario de producto]]. |
| "Facturacion sin errores ni hojas de calculo" | FeaturesSection.tsx:64 | [[Mensajes aprobados]] veta "exportacion contable" y "facturacion electronica completa". |
| "Sincronizacion en tiempo real sin errores" | FeaturesSection.tsx:110 | Promesa fuerte sin evidencia tecnica explicita. |
| "sin depender de WhatsApp" | FeaturesSection.tsx:98 | [[Tarea - Consolidar comunicacion]] confirma que WhatsApp esta tras feature flag. |
| "Datos 100% seguros" / "Aislamiento total" / "Encriptacion" | pricing.tsx:33-34 | RLS esta activo pero "encriptacion en reposo" no esta confirmado en [[Patrones obligatorios]]. |
| "Notificaciones push para提醒 de clases y eventos" | FeaturesSection.tsx:130 | Bug de copy (punto 2). |
| "Planes de respuesta ante incidentes" | FeaturesSection.tsx:149 | No documentado en [[Produccion y go-live]] ni [[Runbook deploy]]. |
| "Login sin contrasena (Magic Link) o con Google" | FeaturesSection.tsx:144 | NextAuth v5 con magic link no esta confirmado en [[Arquitectura]]. |

### 6. Modulo Comunicacion promete "centro unificado" pero no lo es (ROTO)

`src/app/(site)/modules/comunicacion/page.tsx` repite: "Un centro de notificaciones unificado", "Notificaciones a padres y staff sin depender de WhatsApp".

[[Tarea - Consolidar comunicacion]] confirma que `/messages`, `/notifications` y `/whatsapp` son paginas separadas, no un centro unificado. WhatsApp esta tras feature flag.

**Accion**: ajustar copy a "canales diferenciados con historial comun" o similar. No usar "centro unificado".

### 7. Modulo Evaluaciones promete "Exportables PDF para federaciones" (ROTO)

`src/app/(site)/modules/gestion-atletas/page.tsx` (presumiblemente) y `FeaturesSection.tsx:79` repiten "Exportables PDF para federaciones y padres" y "Reportes comparativos entre academias".

[[Modulo - Evaluaciones]] dice que el valor visible en UI todavia necesita cierre. [[Tarea - Validar evaluaciones end-to-end]] confirma QA pendiente.

**Accion**: quitar el claim de export PDF federativo hasta validar E2E. Reemplazar por "exportacion CSV/JSON en desarrollo".

### 8. Testimonios con lenguaje de funcionalidad, no de usuario (REVISABLE)

`src/app/(site)/Testimonials.tsx` (3 testimonios): incluyen frases como "La asistencia diaria se volvio automatica", "Coaches y padres recibieron [info]", "grupos, cobros y familias ordenados". Son afirmaciones funcionales fuertes sin atribucion verificable.

**Accion**: o son clientes reales (verificar y pedir permiso para foto/testimonio), o se sustituyen por casos de uso descriptivos sin apariencia de testimonio. El campo `avatar.src` apunta a URLs Unsplash, lo que sugiere testimonios fabricados. Riesgo legal y reputacional.

### 9. Marketplace y Empleo: copy modera, pero confirman el "publish" apunta a legacy (BUG)

`src/app/(public)/marketplace/page.tsx` y `src/app/(public)/empleo/page.tsx` tienen CTAs como:

```tsx
publishHref="/dashboard/marketplace/mis-productos"
publishHref="/dashboard/events/new"
```

Estas rutas `/dashboard/...` son las legacy que conviven con `/app/[academyId]/...`. Los links publicos llevaran al usuario a una zona posiblemente deprecada o sin soporte.

**Accion**: redireccionar `/dashboard/*` a `/app/[academyId]/*` o actualizar el href en estos componentes a la ruta moderna.

### 10. FAQ afirma "polucion de retencion 30 dias" sin evidencia (REVISABLE)

`src/app/(site)/Faq.tsx:42-45`:

```text
Tus datos se mantienen disponibles durante 30 dias despues de cancelar. Puedes exportar toda tu informacion en cualquier momento. Pasados los 30 dias, se eliminan de nuestros servidores segun nuestra politica de retencion.
```

No hay enlace a la politica de retencion. Si el periodo de retencion legal (RGPD) es diferente, esto es un problema legal.

**Accion**: confirmar politica de retencion con Elvis y enlazar a documento legal. Si es de 30 dias, documentarlo en [[Produccion y go-live]] y en `docs/`.

## Tabla resumen de hallazgos

| # | Tipo | Archivo | Severidad | Estado |
| --- | --- | --- | --- | --- |
| 1 | Cifras inventadas | Hero.tsx:6-10 | Alta | Abierto |
| 2 | Caracteres chinos | FeaturesSection.tsx:130 | Alta | Abierto |
| 3 | Pricing anual matematicas | pricing.tsx:24-81 | Alta | Abierto |
| 4 | "Academias ilimitadas" Growth | catalog.ts:50 | Media | Por revisar con Elvis |
| 5 | Claims que cruzan la linea | FeaturesSection.tsx + modulos | Alta | Parcial abierto |
| 6 | "Centro unificado" comunicacion | modules/comunicacion | Alta | Abierto |
| 7 | Export PDF federaciones | FeaturesSection.tsx:79 + gestion-atletas | Alta | Abierto |
| 8 | Testimonios sin atribucion | Testimonials.tsx | Media | Por verificar |
| 9 | Links publicos a /dashboard legacy | (public)/marketplace + empleo | Media | Abierto |
| 10 | FAQ retencion 30 dias | Faq.tsx:42-45 | Media | Por confirmar |

## Acciones derivadas para el backlog

| P0 | Accion | Owner |
| --- | --- | --- |
| P0 | Quitar o conectar a datos reales las stats `+120`, `18k`, `EUR 3.4M` del Hero. | marketing + tech |
| P0 | Corregir string roto con `提醒` en FeaturesSection.tsx:130. | marketing |
| P0 | Eliminar el "% 20 dto" del banner anual o implementar price IDs anuales y ajustar la formula `* 10`. | tech + marketing |
| P0 | Reescribir claims de evaluaciones (export PDF, comparativas) hasta validar QA E2E. | marketing + producto |
| P0 | Aclarar "centro unificado" de comunicacion o suavizar el copy. | marketing |
| P1 | Redirigir `/dashboard/*` o actualizar hrefs publicos en marketplace/empleo/events. | tech |
| P1 | Confirmar politica de retencion 30 dias y enlazar a documento legal. | Elvis + legal |
| P1 | Verificar si los testimonios son clientes reales o sustituirlos por casos descriptivos. | marketing |
| P2 | Revisar Growth "Academias ilimitadas" y alinear con el modelo multi-tenant. | Elvis + producto |

## Como se actualizo esta auditoria

- Generada el 2026-06-22 por lectura directa del copy publico en `src/app/(site)/` y `src/app/(public)/`.
- Cada claim esta enlazado al archivo y linea correspondiente.
- Sin secretos ni credenciales.
- Siguiente paso: Elvis aprueba o corrige; marketing reescribe; tech cierra los bugs numericos.
