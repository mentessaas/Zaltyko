# Análisis Profundo: Lógica del Onboarding y Planes de Usuario

> **Fuente de verdad (13/09/2026):** los nombres, precios y límites comerciales se leen de `src/lib/plans/catalog.ts`. Este análisis documenta el comportamiento técnico del checkout y del onboarding; cualquier cifra que no coincida con ese catálogo está obsoleta y no debe copiarse a interfaces, emails ni propuestas comerciales.

## 📋 Resumen Ejecutivo

El flujo actual de onboarding separa deliberadamente la cuenta del espacio de trabajo. Primero se crea la identidad del usuario; después, el owner configura la academia en un formulario corto y entra al dashboard; por último, el checklist del dashboard acompaña la activación operativa. El sistema está integrado con los planes Free, Starter, Growth y Network.

---

## 🎯 Estructura del Onboarding

### Etapas actuales

1. **Cuenta** — registro y autenticación del usuario.
2. **Espacio de trabajo** — nombre, país, disciplina y tipo de academia; los grupos, programas, clases y ubicación detallada quedan como ajustes opcionales.
3. **Dashboard** — checklist para crear grupo, añadir atletas, calendario, entrenador, cobros y primera comunicación.
4. **Activación operativa** — métrica de producto basada en datos: al menos una clase, una gimnasta y una asistencia dentro de los primeros siete días.

**Características verificadas:**
- ✅ La cuenta no se presenta como si ya hubiera creado una academia.
- ✅ El formulario guarda un borrador local no sensible para recuperarse de interrupciones.
- ✅ La configuración avanzada está colapsada por defecto y puede completarse después.
- ✅ Los hitos `first_class_created`, `first_athlete_added`, `first_attendance_recorded` y `academy_activated` usan claves idempotentes.
- ⚠️ La métrica está instrumentada, pero todavía necesita cohortes reales para validar conversión y tiempo a valor.

---

## 💳 Sistema de Planes

### Planes Disponibles

| Plan | Precio | Límites |
|------|--------|---------|
| **Free** | €0/mes | • 1 academia<br>• 30 gimnastas<br>• 3 grupos<br>• 10 clases |
| **Starter** (`pro`) | €19/mes | • 1 academia<br>• 75 gimnastas<br>• 5 grupos<br>• 20 clases |
| **Growth** (`premium`) | €49/mes | • 1 academia<br>• 200 gimnastas<br>• 10 grupos<br>• 40 clases |
| **Network** | €99/mes | • Multi-sede acompanado<br>• Limites operativos amplios<br>• CTA comercial sin checkout autoservicio |

### Límites por Recurso

```typescript
// Definidos en src/lib/limits.ts

const ACADEMY_LIMITS: Record<PlanCode, number | null> = {
  free: 1,      // Solo 1 academia
  pro: 1,       // Starter: 1 academia en v1 comercial
  premium: 1    // Growth: 1 academia en v1 comercial
};

const CLASS_LIMITS: Record<PlanCode, number | null> = {
  free: 10,
  pro: 20,
  premium: 40
};

const GROUP_LIMITS: Record<PlanCode, number | null> = {
  free: 3,
  pro: 5,
  premium: 10
};

// Los límites de atletas vienen de la tabla `plans` en la BD
// Free: 30, Starter/pro: 75, Growth/premium: 200
```

---

## 🔄 Integración Onboarding ↔ Planes

### 1. Creación del espacio de trabajo

**Endpoint principal:** `POST /api/onboarding/owner`.

**Comportamiento verificado:**
- ✅ La cuenta autenticada y la academia se crean en pasos explícitos.
- ✅ La suscripción Free se asegura si el usuario todavía no tiene una.
- ✅ El límite de academias se comprueba antes de crear otra; Network se ofrece como conversación comercial para multi-sede.
- ✅ La configuración avanzada (ubicación detallada, grupos, programas y clases) está colapsada por defecto y puede completarse después desde el dashboard.

### 2. Creación de Atletas

**Endpoint:** `POST /api/athletes`

**Comportamiento verificado:**
- ✅ `POST /api/athletes` valida el límite antes de insertar y mantiene el alcance por academia/tenant.
- ✅ Una importación puede terminar parcialmente: los registros válidos se conservan y el usuario recibe el conteo creado y la opción de upgrade.
- ✅ La importación CSV dispone de preview, hash del archivo y rollback explícito por lote.

### 3. Creación de Grupos y Clases

**Grupos:** Validados en `POST /api/groups`
**Clases:** Validadas en `POST /api/classes`

**Comportamiento verificado:**
- ✅ Los límites se validan en tiempo real y también dentro de la transacción para grupos y clases.
- ✅ Si se alcanza el límite, se retorna `402` con un CTA de upgrade que conserva el `academyId`.
- ✅ El usuario puede continuar configurando la academia y volver a facturación sin perder el contexto de su sede.

### 4. Activación medible

La métrica norte no depende de marcar pasos manualmente: una academia cuenta como activada si, dentro de sus primeros siete días, tiene al menos una clase no eliminada, una gimnasta no eliminada y una asistencia vinculada a una sesión válida. Los hitos se registran una sola vez mediante claves idempotentes; falta validar cohortes reales antes de fijar objetivos comerciales.

---

## 📊 Persistencia de Estado

### 1. Estado Local (localStorage)

**Clave:** `zaltyko:owner-onboarding-draft:v1`

**Datos guardados:**
```typescript
{
  academyName: string,
  countryCode: string,
  region: string,
  city: string,
  academyKind: string,
  disciplineVariant: string,
  fullName: string
}
```

**Uso:**
- ✅ Se guarda automáticamente en cada cambio
- ✅ Se restaura al recargar la página
- ✅ Permite continuar donde se quedó el usuario

### 2. Estado del Servidor (Base de Datos)

**Tabla:** `onboarding_states`

**Estructura:**
```typescript
{
  academyId: UUID,
  tenantId: UUID,
  ownerProfileId: UUID,
  currentStep: number,        // Índice de WIZARD_STEPS
  completedWizard: boolean,
  steps: {                    // academy, athletes, payments-team, brand, activation
    [key: string]: boolean | undefined,
  },
  notes: string,
  lastCompletedAt: timestamp,
  updatedAt: timestamp
}
```

**Sincronización:**
```typescript
// Al completar una etapa, se marca en el servidor
await markWizardStep({
  academyId,
  tenantId,
  step: "academy" // también: athletes, payments-team, brand, activation
});

// Al cargar, se consulta el estado del servidor
const res = await fetch(`/api/onboarding/state?academyId=${academyId}`);
const data = await res.json();
const serverStep = data?.state?.currentStep ?? 0;
```

---

## 🎨 Experiencia de Usuario

### Manejo de Límites en el Onboarding

**Filosofía:** "No bloquear la puesta en marcha, informar con precisión"

1. **Academias:**
   - ❌ **Bloquea** la creación si se alcanza el límite
   - ✅ Muestra mensaje claro con opción de upgrade o conversación Network

2. **Atletas:**
   - ✅ **Permite** crear parcialmente cuando una importación llega al límite
   - ✅ Informa cuántos se crearon frente a cuántos se intentaron
   - ✅ Permite corregir, reintentar o hacer rollback del lote sin perder los registros válidos

3. **Grupos/Clases:**
   - ❌ **Bloquea** si se alcanza el límite
   - ✅ Muestra mensaje con opción de upgrade y mantiene el contexto de la academia

### Mensajes de Error

**Patrón consistente:**
```typescript
`Has alcanzado el límite de [RECURSO] de tu plan actual. 
${upgradeTo ? `Actualiza a ${upgradeTo.toUpperCase()} para [ACCION].` : 
  "Contacta con soporte para aumentar tu límite."}`
```

**Ejemplos:**
- "Has alcanzado el límite de academias de tu plan actual (1 academia). Para varias sedes, habla con Zaltyko sobre Network."
- "Has alcanzado el límite de gimnastas de tu plan actual. Actualiza a Starter para agregar más gimnastas."

---

## 🔐 Seguridad y Validaciones

### Validaciones actuales

**Cuenta:** Supabase valida email, contraseña y sesión; el formulario de owner solo se muestra a un usuario autenticado.

**Espacio de trabajo:** nombre, país, disciplina y tipo se validan server-side; la academia se comprueba contra el tenant y el límite de academias antes de insertar.

**Configuración avanzada:** programas, aparatos, grupos base y clases se normalizan y validan por rama deportiva. La sección es opcional y está colapsada por defecto.

**Operación posterior:** atletas, grupos, clases, asistencia, invitaciones y pagos pasan por autorización de academia, límites del plan y validaciones específicas del recurso. La importación de atletas añade preview, hash, lote y rollback explícito.

**Pendiente de verificación externa:** pruebas E2E con cuentas de cada rol, recuperación de pagos Stripe, entrega real de email/WhatsApp/push y revisión jurídica formal de datos de menores, retención y borrado.

---

## 🚀 Flujo Completo de Onboarding

### Escenario 1: Usuario Nuevo (Plan Free)

```
1. Usuario crea cuenta
   └─> Se crea el perfil y se asigna Free si no existe suscripción

2. Usuario completa el espacio de trabajo
   └─> Nombre, país, disciplina y tipo
   └─> Opcional: grupos, programas, clases y ubicación detallada
   └─> Entra al dashboard sin confundir cuenta con academia

3. Usuario sigue el checklist del dashboard
   └─> Crea grupo, añade atletas, configura calendario e invita equipo
   └─> Activa cobros y envía la primera comunicación cuando esté listo

4. Usuario registra una asistencia
   └─> Si ya existe clase y atleta dentro de los primeros 7 días,
       se registra `academy_activated` una sola vez
```

### Escenario 2: Usuario Free Intenta Segunda Academia

```
1. Usuario ya tiene 1 academia (límite Free alcanzado)

2. Intenta crear segunda academia → ❌ BLOQUEADO
   └─> assertUserAcademyLimit() detecta límite
   └─> Retorna error 402 con mensaje:
       "Has alcanzado el límite de academias de tu plan actual (1 academia). 
        Para varias sedes, habla con Zaltyko sobre Network."
   └─> Usuario debe contactar a Zaltyko para evaluar Network
```

### Escenario 3: Usuario Free Agrega Atletas Más Allá del Límite

```
1. Usuario tiene 28 gimnastas (2 disponibles en Free)

2. Intenta importar 5 gimnastas → ⚠️ PARCIAL
   └─> Se crean las filas permitidas hasta 30
   └─> El lote conserva preview/hash y muestra el resultado parcial
   └─> El usuario puede corregir, actualizar el plan o hacer rollback
```

---

## 🔍 Puntos Clave de la Implementación

### 1. Asignación Automática de Plan Free

**Cuándo:** al crear la primera academia desde `POST /api/onboarding/owner`.

La ruta asegura una suscripción Free dentro del flujo de creación y devuelve la URL del workspace recién creado. La emisión de eventos de producto se realiza después del commit para no contar academias que luego hayan hecho rollback.

### 2. Validación de Límites en Tiempo Real

**Función clave:** `assertWithinPlanLimits()`
**Ubicación:** `src/lib/limits.ts:185-285`

```typescript
export async function assertWithinPlanLimits(
  tenantId: string,
  academyId: string,
  resource: LimitResource // "athletes" | "classes" | "groups" | "academies"
) {
  const subscription = await getActiveSubscription(academyId);
  // Cuenta recursos por tenant/academia y lanza LimitError (402) si excede.
}
```

### 3. Manejo de Errores Parciales

**Solo aplica a:** Creación de atletas
**Razón:** Mejor UX - permite progreso parcial

```typescript
// La importación se confirma por lote y puede hacer rollback explícito.
// Las creaciones individuales siguen devolviendo el límite de forma clara.
const preview = await fetch("/api/athletes/import", { method: "POST" });
// confirmar: POST /api/athletes/import con batchId + hash
// rollback: POST /api/athletes/import/:batchId/rollback
```

### 4. Sincronización Estado Cliente-Servidor

**Cliente:** `localStorage` para persistencia inmediata
**Servidor:** `onboarding_states` para persistencia permanente

```typescript
// El formulario de owner guarda solo un borrador no sensible.
window.localStorage.setItem("zaltyko:owner-onboarding-draft:v1", JSON.stringify({
  fullName, academyName, countryCode, region, city, academyKind, disciplineVariant,
}));

// Servidor marca pasos completados
await markWizardStep({
  academyId,
  tenantId,
  step: "academy"
});
```

---

## 📈 Métricas y Tracking

### Eventos Analíticos

**Durante onboarding:**
- `signup_completed` - Al crear cuenta
- `academy_created` - Al crear academia
- `first_athlete_added` - Al agregar primer atleta

**Tracking:** `src/lib/analytics.ts`

---

## 🎯 Recomendaciones y Mejoras Potenciales

### 1. Mejorar Mensajes de Upgrade

**Actual:**
```
"Actualiza a Starter para agregar más gimnastas."
```

**Mejorado:**
```
"Growth aumenta capacidad operativa dentro de una academia. Para varias sedes, habla con Zaltyko sobre Network.
[Botón: Hablar con Zaltyko]"
```

### 2. Mostrar Límites Restantes

**Agregar en UI:**
```
"Tienes 2 de 30 gimnastas disponibles en tu plan Free"
```

### 3. Validación Preventiva

**Antes de crear:**
```typescript
// Verificar límite antes de mostrar formulario
const canCreateMore = await checkRemainingLimit(academyId, "athletes");
if (canCreateMore.remaining === 0) {
  // Mostrar mensaje de upgrade antes de intentar crear
}
```

### 4. Onboarding Condicional por Plan

**Para usuarios Starter/Growth:**
- Saltar pasos opcionales automáticamente
- Mostrar opciones avanzadas desde el inicio

---

## 📚 Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `src/app/onboarding/owner/page.tsx` | Entrada del onboarding del owner |
| `src/components/onboarding/OwnerOnboardingForm.tsx` | Formulario de espacio de trabajo y configuración avanzada |
| `src/components/dashboard/OnboardingChecklist.tsx` | Checklist operativo posterior a la creación |
| `src/lib/limits.ts` | Lógica de validación de límites |
| `src/app/api/academies/route.ts` | Endpoint creación academia |
| `src/app/api/athletes/route.ts` | Endpoint creación atletas |
| `src/app/api/onboarding/state/route.ts` | Gestión estado onboarding |
| `src/lib/onboarding.ts` | Utilidades onboarding |
| `src/db/schema/onboarding-states.ts` | Schema BD estado onboarding |

---

## ✅ Conclusión

El sistema de onboarding está **completamente integrado** con el modelo de planes, aplicando límites en tiempo real durante todo el proceso. La filosofía es **"no bloquear, informar"** para atletas (permitiendo progreso parcial) pero **bloquear** para recursos críticos como academias.

**Fortalezas:**
- ✅ Validación en tiempo real
- ✅ Mensajes claros de upgrade
- ✅ Persistencia de estado robusta
- ✅ Manejo de errores parciales

**Áreas de mejora:**
- ⚠️ Mostrar límites restantes en UI
- ⚠️ Validación preventiva antes de crear
- ⚠️ Onboarding diferenciado por plan
