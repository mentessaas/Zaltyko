# Análisis Profundo: Lógica del Onboarding y Planes de Usuario

## 📋 Resumen Ejecutivo

El sistema de onboarding de Zaltyko SaaS es un wizard de 7 pasos que guía a los usuarios desde la creación de cuenta hasta la configuración completa de su academia. El sistema está completamente integrado con un modelo de planes (Free, Pro, Premium) que aplica límites en tiempo real durante el proceso de onboarding.

---

## 🎯 Estructura del Onboarding

### Pasos del Wizard

El onboarding consta de **7 pasos secuenciales**:

1. **Cuenta** - Creación de usuario y autenticación
2. **Academia** - Creación de la academia con ubicación y tipo
3. **Estructura** - Definición de disciplinas y grupos sugeridos (opcional)
4. **Primer grupo** - Creación del primer grupo de entrenamiento
5. **Atletas** - Agregar primeros atletas
6. **Entrenadores** - Invitar entrenadores (opcional)
7. **Pagos** - Configuración de Stripe para pagos (opcional)

### Flujo de Navegación

```typescript
// Control de pasos accesibles
const [maxStep, setMaxStep] = useState<StepKey>(1);

// Los usuarios solo pueden avanzar hasta maxStep
// No pueden saltar pasos futuros hasta completarlos
```

**Características clave:**
- ✅ Los usuarios pueden retroceder a pasos anteriores
- ✅ No pueden avanzar más allá de `maxStep`
- ✅ El estado se persiste en `localStorage` y en la base de datos
- ✅ Si un usuario autenticado entra, salta automáticamente al paso 2

---

## 💳 Sistema de Planes

### Planes Disponibles

| Plan | Precio | Límites |
|------|--------|---------|
| **Free** | €0/mes | • 1 academia<br>• 50 atletas<br>• 3 grupos<br>• 10 clases |
| **Pro** | €19/mes | • Academias ilimitadas<br>• 200 atletas<br>• 10 grupos<br>• 40 clases |
| **Premium** | €49/mes | • Todo ilimitado<br>• Sin restricciones |

### Límites por Recurso

```typescript
// Definidos en src/lib/limits.ts

const ACADEMY_LIMITS: Record<PlanCode, number | null> = {
  free: 1,      // Solo 1 academia
  pro: null,    // Ilimitado
  premium: null // Ilimitado
};

const CLASS_LIMITS: Record<PlanCode, number | null> = {
  free: 10,
  pro: 40,
  premium: null // Ilimitado
};

const GROUP_LIMITS: Record<PlanCode, number | null> = {
  free: 3,
  pro: 10,
  premium: null // Ilimitado
};

// Los límites de atletas vienen de la tabla `plans` en la BD
// Free: 50, Pro: 200, Premium: null (ilimitado)
```

---

## 🔄 Integración Onboarding ↔ Planes

### 1. Creación de Academia (Paso 2)

**Endpoint:** `POST /api/academies`

**Validación de límites:**
```typescript
// En handleCreateAcademy (onboarding/page.tsx:458)
try {
  await assertUserAcademyLimit(ownerProfile.userId);
} catch (error) {
  if (error.code === "ACADEMY_LIMIT_REACHED") {
    // Error 402 con mensaje de upgrade
    throw new Error(
      `Has alcanzado el límite de academias de tu plan actual. 
       Actualiza a ${upgradeTo} para crear más academias.`
    );
  }
}
```

**Comportamiento:**
- ✅ Usuarios nuevos reciben automáticamente el plan **Free**
- ✅ Se crea una suscripción automática al plan Free si no existe
- ✅ Si el usuario ya tiene 1 academia (límite Free), se bloquea la creación
- ✅ El error incluye sugerencia de upgrade a Pro

**Código relevante:**
```typescript
// src/app/api/academies/route.ts:150-172
// Crear o asegurar suscripción Free si no existe
if (!existingSubscription) {
  const [freePlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);

  await db.insert(subscriptions).values({
    userId: ownerProfile.userId,
    planId: freePlan?.id ?? null,
    status: "active",
  });
}
```

### 2. Creación de Atletas (Paso 5)

**Endpoint:** `POST /api/athletes`

**Validación de límites:**
```typescript
// En handleCreateAthletes (onboarding/page.tsx:673)
for (const athlete of payload) {
  const response = await fetch("/api/athletes", { ... });
  
  if (response.status === 402 && data.error === "LIMIT_REACHED") {
    limitError = {
      message: "Has alcanzado el límite de atletas de tu plan.",
      upgradeTo: data.details?.upgradeTo
    };
    break; // Detener creación de más atletas
  }
}
```

**Comportamiento:**
- ✅ Se valida el límite **antes** de crear cada atleta
- ✅ Si se alcanza el límite, se detiene la creación pero **no se bloquea el paso**
- ✅ Se muestra un mensaje informativo con los atletas creados parcialmente
- ✅ El usuario puede continuar al siguiente paso aunque haya límite

**Manejo de errores parciales:**
```typescript
// Si se crearon algunos atletas pero se alcanzó el límite
if (limitError && createdCount > 0) {
  setError(
    `${limitError.message} Se crearon ${createdCount} de ${payload.length} atletas. 
     Puedes actualizar tu plan más adelante desde facturación.`
  );
  // Continuar al siguiente paso
  setStep(5);
  setMaxStep((prev) => (prev < 5 ? 5 : prev));
}
```

### 3. Creación de Grupos y Clases

**Grupos:** Validados en `POST /api/groups`
**Clases:** Validadas en `POST /api/classes`

**Comportamiento:**
- ✅ Los límites se validan en tiempo real
- ✅ Si se alcanza el límite, se retorna error 402
- ✅ El usuario debe actualizar su plan para continuar

---

## 📊 Persistencia de Estado

### 1. Estado Local (localStorage)

**Clave:** `gymna_onboarding_state`

**Datos guardados:**
```typescript
{
  step: StepKey,
  academyId: string | null,
  tenantId: string | null,
  academyType: string,
  selectedCountry: string,
  selectedRegion: string,
  selectedCity: string,
  fullName: string,
  email: string
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
  currentStep: number,        // Paso actual del wizard
  completedWizard: boolean,   // Si completó todos los pasos
  steps: {                    // Flags de pasos completados
    account?: boolean,
    academy?: boolean,
    structure?: boolean,
    // ...
  },
  notes: string,
  lastCompletedAt: timestamp,
  updatedAt: timestamp
}
```

**Sincronización:**
```typescript
// Al completar cada paso, se marca en el servidor
await markWizardStep({
  academyId,
  tenantId,
  step: "academy" // o "structure", "athletes", etc.
});

// Al cargar, se consulta el estado del servidor
const res = await fetch(`/api/onboarding/state?academyId=${academyId}`);
const data = await res.json();
const serverStep = data?.state?.currentStep ?? 0;
```

---

## 🎨 Experiencia de Usuario

### Manejo de Límites en el Onboarding

**Filosofía:** "No bloquear, informar"

1. **Academias:**
   - ❌ **Bloquea** la creación si se alcanza el límite
   - ✅ Muestra mensaje claro con opción de upgrade

2. **Atletas:**
   - ✅ **Permite** crear parcialmente
   - ✅ Informa cuántos se crearon vs cuántos se intentaron
   - ✅ Permite continuar al siguiente paso

3. **Grupos/Clases:**
   - ❌ **Bloquea** si se alcanza el límite
   - ✅ Muestra mensaje con opción de upgrade

### Mensajes de Error

**Patrón consistente:**
```typescript
`Has alcanzado el límite de [RECURSO] de tu plan actual. 
${upgradeTo ? `Actualiza a ${upgradeTo.toUpperCase()} para [ACCION].` : 
  "Contacta con soporte para aumentar tu límite."}`
```

**Ejemplos:**
- "Has alcanzado el límite de academias de tu plan actual (1 academia). Actualiza a PRO para crear más academias."
- "Has alcanzado el límite de atletas de tu plan actual. Actualiza a PRO para agregar más atletas."

---

## 🔐 Seguridad y Validaciones

### Validaciones por Paso

**Paso 1 (Cuenta):**
- ✅ Email válido
- ✅ Contraseña mínimo 6 caracteres
- ✅ Confirmación de contraseña coincide

**Paso 2 (Academia):**
- ✅ Nombre mínimo 3 caracteres
- ✅ País seleccionado
- ✅ Región válida para el país
- ✅ Ciudad válida para la región
- ✅ Tipo de academia seleccionado
- ✅ **Límite de academias del plan**

**Paso 3 (Estructura):**
- ✅ Al menos una disciplina seleccionada
- ✅ Al menos un grupo con nombre válido
- ⚠️ **Opcional** - puede saltarse

**Paso 4 (Primer Grupo):**
- ✅ Nombre del grupo requerido
- ✅ Hora de inicio y fin válidas
- ✅ **Límite de grupos del plan** (implícito)

**Paso 5 (Atletas):**
- ✅ Al menos un atleta con nombre
- ✅ **Límite de atletas del plan** (validado por atleta)

**Paso 6 (Entrenadores):**
- ✅ Emails válidos (si se proporcionan)
- ⚠️ **Opcional** - puede saltarse

**Paso 7 (Pagos):**
- ⚠️ **Opcional** - puede saltarse

---

## 🚀 Flujo Completo de Onboarding

### Escenario 1: Usuario Nuevo (Plan Free)

```
1. Usuario crea cuenta → Paso 1 completado
   └─> Se crea perfil automáticamente
   └─> Se asigna plan Free automáticamente

2. Usuario crea academia → Paso 2 completado
   └─> Valida límite: ¿Tiene 0 academias? ✅
   └─> Crea academia exitosamente
   └─> Crea suscripción Free si no existe
   └─> Marca paso "academy" en onboarding_states

3. Usuario define estructura → Paso 3 completado
   └─> Guarda disciplinas y grupos sugeridos
   └─> Marca paso "structure"

4. Usuario crea primer grupo → Paso 4 completado
   └─> Valida límite: ¿Tiene < 3 grupos? ✅
   └─> Crea grupo y clase asociada
   └─> Marca paso "first_group"

5. Usuario agrega atletas → Paso 5 completado
   └─> Intenta crear 5 atletas
   └─> Valida límite por cada atleta
   └─> Si alcanza límite (50), crea parcialmente
   └─> Muestra mensaje informativo
   └─> Marca paso "athletes"

6. Usuario invita entrenadores → Paso 6 completado
   └─> Envía invitaciones por email
   └─> Marca paso "coaches"

7. Usuario configura pagos → Paso 7 completado
   └─> Conecta con Stripe (opcional)
   └─> Redirige a dashboard
   └─> Marca wizard como completado
```

### Escenario 2: Usuario Free Intenta Segunda Academia

```
1. Usuario ya tiene 1 academia (límite Free alcanzado)

2. Intenta crear segunda academia → ❌ BLOQUEADO
   └─> assertUserAcademyLimit() detecta límite
   └─> Retorna error 402 con mensaje:
       "Has alcanzado el límite de academias de tu plan actual (1 academia). 
        Actualiza a PRO para crear más academias."
   └─> Usuario debe actualizar a Pro para continuar
```

### Escenario 3: Usuario Free Agrega Atletas Más Allá del Límite

```
1. Usuario tiene 48 atletas (2 disponibles en Free)

2. Intenta agregar 5 atletas en onboarding → ⚠️ PARCIAL
   └─> Atleta 1: ✅ Creado (49 total)
   └─> Atleta 2: ✅ Creado (50 total - LÍMITE ALCANZADO)
   └─> Atleta 3: ❌ Error LIMIT_REACHED
   └─> Atleta 4: ❌ No se intenta (loop detenido)
   └─> Atleta 5: ❌ No se intenta (loop detenido)
   
   └─> Mensaje mostrado:
       "Has alcanzado el límite de atletas de tu plan. 
        Se crearon 2 de 5 atletas. 
        Puedes actualizar tu plan más adelante desde facturación."
   
   └─> Usuario puede continuar al siguiente paso
```

---

## 🔍 Puntos Clave de la Implementación

### 1. Asignación Automática de Plan Free

**Cuándo:** Al crear la primera academia
**Dónde:** `src/app/api/academies/route.ts:150-172`

```typescript
// Si no existe suscripción, crear una con plan Free
if (!existingSubscription) {
  const [freePlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, "free"))
    .limit(1);

  await db.insert(subscriptions).values({
    userId: ownerProfile.userId,
    planId: freePlan?.id ?? null,
    status: "active",
  });
}
```

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
  
  // Contar recursos actuales
  // Comparar con límite del plan
  // Lanzar error 402 si se excede
}
```

### 3. Manejo de Errores Parciales

**Solo aplica a:** Creación de atletas
**Razón:** Mejor UX - permite progreso parcial

```typescript
// En handleCreateAthletes
let createdCount = 0;
let limitError: { message: string; upgradeTo?: string } | null = null;

for (const athlete of payload) {
  try {
    // Intentar crear
    if (response.status === 402) {
      limitError = { ... };
      break; // Detener pero no fallar completamente
    }
    createdCount++;
  } catch (err) {
    if (limitError) break;
    throw err;
  }
}

// Continuar aunque haya límite parcial
if (createdCount > 0) {
  setStep(5); // Avanzar al siguiente paso
}
```

### 4. Sincronización Estado Cliente-Servidor

**Cliente:** `localStorage` para persistencia inmediata
**Servidor:** `onboarding_states` para persistencia permanente

```typescript
// Cliente guarda en localStorage
useEffect(() => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    step, academyId, tenantId, ...
  }));
}, [step, academyId, ...]);

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
"Actualiza a PRO para crear más academias."
```

**Mejorado:**
```
"Actualiza a PRO (€19/mes) para crear academias ilimitadas. 
[Botón: Ver planes]"
```

### 2. Mostrar Límites Restantes

**Agregar en UI:**
```
"Tienes 2 de 50 atletas disponibles en tu plan Free"
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

**Para usuarios Pro/Premium:**
- Saltar pasos opcionales automáticamente
- Mostrar opciones avanzadas desde el inicio

---

## 📚 Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `src/app/onboarding/page.tsx` | Componente principal del wizard |
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

