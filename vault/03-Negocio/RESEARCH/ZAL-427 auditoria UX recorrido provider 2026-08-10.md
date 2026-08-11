---
title: ZAL-427 — Auditoría UX del recorrido del rol `provider` (proveedor)
issue: ZAL-427
autor: Product Designer / UX Researcher
fecha: 2026-08-10
status: published
tipo: auditoría de experiencia
alcance: web (src/app, src/components) — mobile evaluado y descartado con recomendación
metodo: lectura de código + sonda de render en jsdom (vitest + @testing-library/react)
---

# ZAL-427 — Auditoría UX del recorrido `provider`

## 0. Por qué esta issue deja de estar bloqueada

ZAL-427 se abrió como placeholder: *"diseñar el recorrido del rol provider cuando exista el código"*, bajo el supuesto de que el rol no existía. Ese supuesto era **parcialmente falso**.

| Superficie | ¿Existe `provider`? | Evidencia |
| --- | --- | --- |
| Web | **Sí, implementado** | `src/lib/product/roles.ts:8` (`ProfileRole`), `src/db/schema/enums.ts:10`, `src/components/RegisterForm.tsx:38` (opción de registro), `src/lib/navigation/registry.ts:53-54` (nav), `src/app/dashboard/profile/page.tsx:518` (perfil), `src/app/dashboard/marketplace/mis-productos/page.tsx` |
| Mobile | No | `mobile/lib/auth/SessionProvider.tsx:14` — `ZaltykoRole` no incluye `provider`; `mobile/lib/auth/role-router.ts` sin entrada en `TABS_BY_ROLE` |

Es decir: **el recorrido del proveedor ya está en producción-código en web y nunca fue auditado.** Esta auditoría cubre esa superficie real en vez de especular sobre pantallas móviles inexistentes.

Contexto de negocio: `vault/03-Negocio/Modelo de negocio.md` §"Línea 2 — Marketplace B2B de proveedores (mes 6-12)". El proveedor vende a academias (calleras, maillots, aparatos, fisios, clinics). Monetización: 5-10% comisión o cuota mensual.

## 1. El recorrido tal como está construido hoy

```
/register  (RegisterForm, rol "Proveedor")
   → confirmación email
   → getDefaultDashboardPath("provider") = /dashboard/marketplace/mis-productos   [roles.ts:169]
        nav lateral: solo 2 entradas — "Mis productos" y "Mi perfil"   [registry.ts:53-54]
   → CTA "Nuevo listing" → /marketplace/nuevo   (route group (public), sale del shell autenticado)
        → <MarketplaceForm />  → POST /api/marketplace
   → éxito: router.push("/marketplace")   (catálogo público, NO vuelve a "Mis productos")
```

Capacidades del rol: `shell: "global"`, `canAccessAcademyWorkspace: false`, sin membresía de academia, sin billing, sin equipo (`roles.ts:76-82`). Es un usuario **sin tenant por diseño**.

El trabajo del proveedor tiene exactamente un job-to-be-done: **publicar una oferta y recibir contacto de academias.** Todo lo demás es secundario.

## 2. Hallazgos

Prioridad: P0 = impide el job principal · P1 = fricción grave o pérdida de confianza · P2 = pulido · P3 = deuda menor.

### PV-1 (P0) — Ningún dropdown de la app ofrece opciones: el proveedor no puede elegir categoría

`src/components/ui/select.tsx` renderiza un `<select>` nativo cuyos hijos son `<SelectTrigger>` (un `div`) y `<SelectContent>` (otro `div`) que envuelve los `<option>`. Según la especificación HTML, `HTMLSelectElement.options` solo recoge `option` que sean **hijos directos** del `select` o de un `optgroup`. Los `option` anidados dentro de un `div` quedan fuera.

**Verificación empírica** (jsdom + @testing-library/react, 2026-08-10):

```tsx
// @vitest-environment jsdom
render(
  <Select value="" onValueChange={() => {}}>
    <SelectTrigger><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="equipment">Equipamiento</SelectItem>
      <SelectItem value="clothing">Ropa</SelectItem>
    </SelectContent>
  </Select>
);
const select = container.querySelector("select")!;
expect(select.options.length).toBe(2);
```

Resultado: `AssertionError: expected +0 to be 2` → **`options.length === 0`**. El desplegable se pinta vacío.

React emite además dos advertencias que confirman el DOM inválido:
`Warning: Use the 'defaultValue' or 'value' props on <select> instead of setting 'selected' on <option>` y la jerarquía `select > div > option`.

Impacto en el recorrido del proveedor: **"Categoría *" es obligatoria y no tiene opciones seleccionables** (`MarketplaceForm.tsx:126-137`). El proveedor no puede completar el formulario. El job principal del rol es inalcanzable.

Radio de impacto: **26 archivos de `src/` importan `SelectTrigger`** — el defecto no es del marketplace, es del sistema de diseño. Ejemplos afectados: `AnnouncementForm`, `QuickClassModal`, `DocumentUploadModal`, `JobForm`, `TicketFilters`, `ProgressChart`, `notifications/page.tsx`, `my-dashboard`. No verifiqué instancia por instancia; verifiqué el componente base del que todas dependen.

**Owner sugerido:** Web Developer / Engineering Lead. Es un bug de componente base, no de diseño. La sonda de arriba sirve como test de regresión (no la dejé en el repo para no romper el gate; se reproduce pegándola en `tests/`).

### PV-2 (P0) — El proveedor no tiene tenant, y el endpoint de publicar exige tenant

`POST /api/marketplace` está envuelto en `withTenant` (`src/app/api/marketplace/route.ts:98`). El middleware (`src/lib/authz.ts:268-276`) devuelve `403 TENANT_MISSING` cuando no hay `tenantId` válido, salvo que el endpoint sea público, de creación de academia, "flexible" o el usuario sea `super_admin`.

`/api/marketplace` no está en ninguna de esas listas (`src/lib/authz/endpoint-config.ts:22-31` y `:43-56`). Y un `provider` **por definición no tiene academia ni tenant** (`roles.ts:76-82`, `canAccessAcademyWorkspace: false`).

Consecuencia: el rol creado para publicar en el marketplace recibe 403 al publicar en el marketplace. Contradicción entre el modelo de roles y el modelo de autorización.

**Owner sugerido:** Backend / Security. La decisión no es cosmética: hay que elegir entre añadir `/api/marketplace` a los endpoints sin tenant con validación explícita de `userId` en el handler, o dar tenant propio al proveedor. Security debe opinar porque `endpoint-config.ts:4-7` advierte explícitamente sobre el riesgo de la vía "flexible".

### PV-3 (P0) — Campo obligatorio invisible: `userId` nunca se envía desde `/marketplace/nuevo`

`CreateMarketplaceSchema` exige `userId: z.string().uuid()` (`route.ts:16`). `MarketplaceForm` lo toma de props (`userId?: string`, `MarketplaceForm.tsx:34`) y `/marketplace/nuevo/page.tsx:14` monta `<MarketplaceForm />` **sin props**. Se envía `userId: undefined` → `ZodError` → `400 VALIDATION_ERROR`.

Doblemente roto: el handler **ni siquiera usa** `validated.userId`; inserta `userId: context.userId` (`route.ts:108`). El campo es un obstáculo puro.

Para el usuario esto es un callejón sin salida: todos los campos visibles están correctos y el error dice que revise los datos. No hay nada que pueda revisar.

Lo mismo aplica a `sellerType`, que llega con el default `"external"` — un proveedor registrado no es un vendedor externo, y ese valor queda persistido en la fila.

### PV-4 (P1) — El copy del error miente sobre la causa

`MarketplaceForm.tsx:89-96` hace `error.message || "Revisa los datos e inténtalo de nuevo."`.

- Para `TENANT_MISSING` (PV-2) el middleware responde `{ error: "TENANT_MISSING" }` **sin campo `message`** (`authz.ts:275`) → cae al fallback → el usuario lee *"Revisa los datos"* ante un fallo de permisos.
- Para `VALIDATION_ERROR` (PV-3) `apiError` sí trae `message`, pero es `"Error de validación"` genérico, sin decir qué campo.

Copy propuesto por caso:
- Permisos: **"Tu cuenta de proveedor todavía no puede publicar. Escríbenos y lo activamos."** + enlace de contacto.
- Validación con campo conocido: **"Falta {campo}."** anclado al campo, no en toast.
- Error de servidor: **"No pudimos publicar tu anuncio. Vuelve a intentarlo en unos segundos."** (el actual está bien para este caso).

### PV-5 (P1) — Un error de carga se muestra como "no tienes productos"

`mis-productos/page.tsx:62-75`: si la respuesta no es `ok` (401 por sesión caducada, 500 por fallo de DB) el `catch`/rama silenciosa deja `listings = []` y la UI pinta el empty state *"Aún no tienes productos publicados"* con el CTA de publicar.

Un proveedor con 20 anuncios activos y la sesión caducada ve que sus 20 anuncios desaparecieron. Es el peor mensaje posible: destruye la confianza en la plataforma justo en la pantalla que sostiene su negocio.

Faltan tres estados distinguibles: **cargando** (existe), **vacío real** (existe), **error** (no existe). Se necesita el tercero con reintento, y distinguir 401 (reautenticar) de 5xx (reintentar).

### PV-6 (P1) — Se puede publicar un anuncio sin ninguna vía de contacto

`whatsapp`, `email` y `phone` son todos opcionales (`MarketplaceForm.tsx:70-74`, schema `route.ts:28-32`), y `priceType` por defecto es `"contact"` ("A convenir", `mis-productos/page.tsx:45`).

Combinación por defecto alcanzable: anuncio publicado, sin precio, con la etiqueta "A convenir" y **sin forma de convenir nada**. El anuncio consume espacio de catálogo y no puede convertir. Para un marketplace que monetiza por comisión sobre venta, cada anuncio inaccionable es ingreso perdido.

Regla propuesta: **al menos un canal de contacto obligatorio**, validado en cliente y en `CreateMarketplaceSchema` (`z.refine`), con el mensaje *"Necesitamos al menos una forma de que te contacten."*

### PV-7 (P1) — Acciones destructivas y de estado sin feedback de fallo

`handleStatusToggle` y `handleDelete` (`mis-productos/page.tsx:77-119`) solo muestran toast dentro del `catch`, es decir **solo ante fallo de red**. Si la respuesta es 403 o 500, el spinner se apaga y no ocurre nada visible: el proveedor cree que pausó un anuncio que sigue activo, o que borró uno que sigue publicado.

Además `handleDelete` usa `confirm()` nativo (`:104`) para una acción irreversible, fuera del sistema de diseño (el archivo ya importa `useToast`, y el repo tiene componentes de diálogo). El `confirm()` no es estilable, no es traducible por el sistema y en algunos navegadores se puede suprimir.

### PV-8 (P2) — Publicar expulsa al proveedor de su espacio de trabajo

Al publicar con éxito, `router.push("/marketplace")` (`MarketplaceForm.tsx:87`) lleva al catálogo público. El proveedor sale del shell autenticado y aterriza en la vista de comprador, sin confirmación de éxito (no hay toast) y sin ver su anuncio recién creado en su lista.

Recorrido esperado: publicar → toast **"Anuncio publicado"** → volver a `/dashboard/marketplace/mis-productos` con el nuevo anuncio destacado, y un enlace secundario **"Ver como lo ven las academias"** hacia la ficha pública.

Relacionado: `/marketplace/nuevo` vive en el route group `(public)`, así que el formulario de creación se renderiza fuera del shell del dashboard. El proveedor pierde la navegación a mitad de su tarea principal.

### PV-9 (P2) — La navegación del proveedor no incluye el marketplace

`registry.ts:53-54` da al proveedor exactamente dos entradas: "Mis productos" y "Mi perfil". No hay acceso al catálogo público, así que no puede ver su oferta como la ve una academia ni comparar su posicionamiento con el de otros proveedores — la tarea de valor más obvia después de publicar.

Falta también cualquier superficie de **demanda**: no hay bandeja de mensajes ni registro de contactos recibidos. El único indicador de tracción es el contador de vistas de la tarjeta (`mis-productos/page.tsx:194-196`). El proveedor no sabe si el marketplace le funciona, y sin esa señal no renovará una cuota mensual.

### PV-10 (P2) — El formulario no permite subir imágenes, pero la tarjeta las espera

El schema acepta `images` (`route.ts:33`) y la tarjeta de "Mis productos" las renderiza (`mis-productos/page.tsx:157-169`), con un fallback *"Sin imagen"*. Pero `MarketplaceForm` **no tiene ningún campo de imagen**.

Resultado: el 100% de los anuncios creados por el flujo oficial nace sin imagen. En un catálogo de equipamiento y ropa deportiva, la foto es el principal factor de conversión. El placeholder "Sin imagen" se convierte en el estado permanente del catálogo.

### PV-11 (P2) — Etiquetas sin control asociado y campo obligatorio no validable

Los `<Label htmlFor="type">`, `htmlFor="category"` y `htmlFor="priceType"` (`MarketplaceForm.tsx:113, 126, 176`) apuntan a IDs que ningún elemento declara: `SelectTrigger` es un `div` que no recibe `id`. Sin asociación label↔control, un lector de pantalla anuncia el campo sin nombre. Incumple WCAG 2.1 AA **1.3.1 (Info y relaciones)** y **4.1.2 (Nombre, función, valor)**.

El `required` está puesto sobre `<Select>` (`:127`), no sobre el `<select>` renderizado, por lo que la validación nativa del formulario no lo aplica: se puede enviar sin categoría y recibir un 400. (Con PV-1 vigente esto es académico —no hay nada que seleccionar— pero debe arreglarse en el mismo cambio.)

### PV-12 (P2) — Ubicación como texto libre rompe el filtrado del marketplace

`país` es un `Input` libre con valor por defecto `"España"`, y `provincia`/`ciudad` también libres (`MarketplaceForm.tsx:234-258`). "Madrid", "madrid" y "MADRID" serán tres ubicaciones distintas.

El marketplace es explícitamente multi-país (el vault mantiene *documentos normativos por país* y el modelo de negocio apunta al mercado hispano). Un catálogo cuya ubicación no se puede filtrar de forma fiable no permite la búsqueda que una academia necesita ("proveedores de aparatos cerca de mí"), que es la razón por la que el proveedor paga.

### PV-13 (P3) — Anuncio de demostración inyectado en entornos no productivos

`GET /api/marketplace` inserta `demoMarketplaceListing` cuando no hay resultados y `NODE_ENV !== "production"` (`route.ts:86-87`). En staging o en una demo comercial, un proveedor recién registrado ve en el catálogo un producto que no existe, y su propio catálogo vacío parece poblado. Conviene que sea explícitamente un dato de ejemplo etiquetado como tal, o que quede detrás de un flag distinto de `NODE_ENV`.

## 3. Resumen de prioridades

| ID | Prioridad | Hallazgo | Owner sugerido |
| --- | --- | --- | --- |
| PV-1 | P0 | `ui/select` no expone opciones (`options.length === 0`); 26 archivos afectados | Web Dev / Eng Lead |
| PV-2 | P0 | `POST /api/marketplace` exige tenant; el proveedor no tiene tenant por diseño | Backend / Security |
| PV-3 | P0 | `userId` obligatorio nunca enviado desde `/marketplace/nuevo`; el handler ni lo usa | Web Dev |
| PV-4 | P1 | Copy de error atribuye a "datos" fallos de permisos | Product Designer + Web Dev |
| PV-5 | P1 | Error de carga indistinguible de catálogo vacío | Web Dev |
| PV-6 | P1 | Anuncio publicable sin ningún canal de contacto | Web Dev + Backend |
| PV-7 | P1 | Toggle y borrado sin feedback ante 4xx/5xx; `confirm()` nativo | Web Dev |
| PV-8 | P2 | Al publicar expulsa al catálogo público, sin confirmación de éxito | Web Dev |
| PV-9 | P2 | Nav del proveedor sin marketplace ni señal de demanda | Product Designer + Web Dev |
| PV-10 | P2 | Sin campo de imagen pese a que el schema y la tarjeta las usan | Web Dev |
| PV-11 | P2 | Labels huérfanas (WCAG 1.3.1 / 4.1.2) y `required` inoperante | Web Dev |
| PV-12 | P2 | Ubicación en texto libre; impide filtrado multi-país | Product Designer + Backend |
| PV-13 | P3 | Listing de demo inyectado fuera de producción | Web Dev |

**Los tres P0 son acumulativos**: aunque se arreglara PV-1, PV-3 seguiría devolviendo 400; y aunque se arreglara PV-3, PV-2 devolvería 403. Hoy el recorrido del proveedor no puede completarse por ninguna vía. Cualquier captación de proveedores antes de cerrar los tres genera una promesa incumplida en el primer minuto de uso.

## 4. Recomendación sobre mobile (pregunta original de ZAL-427)

**Recomendación: no añadir `provider` a `mobile/lib/auth/role-router.ts`.** Razones observables, no de gusto:

1. La estructura de pestañas de mobile es de **membresía de academia**: Inicio, Agenda, Mensajes, Avisos, Perfil. Un proveedor no tiene agenda de clases, ni asistencia, ni atletas. Cuatro de las cinco pestañas quedarían vacías — exactamente el problema F-2 que documentó ZAL-396 para el rol `athlete`, pero peor.
2. Las tareas del proveedor (redactar ficha, cargar fotos, comparar precios, gestionar catálogo) son de escritorio. La app móvil de Zaltyko está construida para consumo en el gimnasio.
3. Añadir el rol obliga a mantener una superficie octava en `TABS_BY_ROLE` con un único destino útil.

**Alternativa de menor coste si en el futuro se quiere presencia móvil**: notificación push de "una academia se interesó por tu anuncio" con enlace profundo a la web, sin shell de pestañas propio. Eso cubre la parte del job que sí es urgente y móvil (responder rápido a un lead) sin duplicar el catálogo.

Esta recomendación requiere decisión de Product Lead. Hasta que se tome, mobile queda **fuera de alcance**, no bloqueado.

## 5. Método y límites

- **Sí verificado**: código de `src/app/dashboard/marketplace/**`, `src/app/(public)/marketplace/**`, `src/components/marketplace/MarketplaceForm.tsx`, `src/components/ui/select.tsx`, `src/lib/product/roles.ts`, `src/lib/navigation/registry.ts`, `src/lib/authz.ts`, `src/lib/authz/endpoint-config.ts`, `src/app/api/marketplace/**`, `mobile/lib/auth/**`. Más una sonda de render ejecutada en jsdom que confirma PV-1.
- **No verificado**: no ejecuté el recorrido en navegador con una sesión real de `provider` (no hay servidor de desarrollo levantado ni credenciales de proveedor de prueba). PV-2, PV-3 y PV-5 están derivados del código con la cadena de llamadas trazada, no observados en pantalla.
- **Siguiente verificación recomendada**: sembrar un usuario `provider` en la base local, levantar `pnpm dev` y recorrer registro → publicar → gestionar con Playwright + axe. Eso confirmaría los tres P0 en pantalla y cubriría el contraste y el foco, que esta auditoría no evalúa.
- Sin secretos, sin producción, sin datos reales, sin dinero real.
