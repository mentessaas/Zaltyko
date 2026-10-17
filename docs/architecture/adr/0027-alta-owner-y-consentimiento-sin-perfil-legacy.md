# ADR-0027 — Alta Owner y aceptación contractual sin perfil legacy

Fecha: 2026-10-14. Estado: aceptada para implementación local; no aplicada en remoto.

## Evidencia y conflicto

El recorrido real de QA crea la identidad en Supabase Auth, pero el siguiente
POST `/api/onboarding/profile` devuelve 500. La allowlist del stack nuevo no
crea `public.profiles`; el endpoint la consulta/inserta. El SQLSTATE no se
conservó en el runner sanitizado, por lo que la ausencia de tabla como causa
exacta sigue pendiente de consulta local. La dependencia estructural sí está
confirmada por el código. El consentimiento heredado añade una FK desde
`public.owner_consent.owner_id` a `public.profiles.user_id`.

El dominio canónico ya vincula `organization_members.user_id` directamente a
`auth.users.id`. Crear un perfil legacy artificial para aceptar términos no
aporta autorización y haría depender una instalación limpia de tablas ajenas al
dominio nuevo. El propietario autoriza sustituir arquitectura heredada, sin
compatibilidad interna obligatoria ni migración compleja de clientes inexistentes.

## Decisión

1. El alta Owner canónica usa la identidad verificada de Supabase Auth y la
   membresía organizativa, no un rol global ni `public.profiles` como requisito.
2. Crear almacenamiento contractual canónico en `zaltyko`, vinculado al sujeto
   `auth.users.id`, con estado, versión, origen, fecha y evidencia mínima.
   La auditoría append-only sobrevive a la eliminación de la fila de estado;
   no contiene nombres, correos, datos de menores ni metadata completa.
3. La política vigente se configura en servidor dentro del dominio nuevo. La
   versión inicial reutiliza la versión documental vigente ya revisada; no se
   inventa texto legal ni se toma una versión aportada por el cliente como vigente.
4. Conservar los controles válidos del gate integrado: usuario verificado,
   metadata solo como transporte de declaración, transacción aceptación+audit,
   lock/replay concurrente, no reactivación implícita de revocados/obsoletos,
   errores controlados y ninguna organización si falla el gate.
5. RLS y grants protegen el estado/audit por sujeto. Lectura propia únicamente;
   escrituras por servicio autenticado, no por cliente directo. La aceptación no
   concede un rol ni activa analítica, marketing o cobros.
6. Registro Owner con sesión confirmada continúa a `/owner/setup` sin POST al
   perfil legacy. Otros roles/directorio conservan sus flujos actuales fuera de
   este corte. Recuperar configuración Owner tampoco recrea ese perfil.
7. No importar consentimientos ni fixtures legacy para obtener un PASS. La
   primera validación empieza en registro UI real sobre un stack limpio.
8. La ausencia de fila canónica no permite reutilizar silenciosamente una
   declaración histórica de Auth, que podría preceder una revocación en otro
   store. El primer grant desde signup exige identidad recién creada después
   del inicio canónico, comprobado con timestamps verificados del servidor.
   Identidades anteriores requieren aceptación explícita nueva, no un signup
   duplicado ni reactivación por metadata. Este límite no concede roles.
9. La recuperación explícita cabe en la pantalla de configuración existente:
   el servidor indica versión vigente y necesidad de aceptación. El formulario
   presenta los enlaces actuales y una casilla inicialmente desmarcada cuando
   corresponda. El bootstrap recibe una declaración separada del comando de
   organización; vuelve a verificar versión/actor y registra grant o re_grant
   con auditoría atómica. Repetir una aceptación activa no duplica auditoría.
   No se exige una segunda casilla al signup reciente ya declarado y válido.

## Reparto y gates

- Backend: esquema/migración aditiva canónica, servicio de consentimiento,
  bootstrap y tests; preservar el helper legacy para sus callers existentes.
- Frontend: rama Owner de RegisterForm y recuperación del login; conservar
  Google/magic link, consentimiento visible y manejo de resultado incierto.
- QA: incluir la migración revisada en stack local, comprobar registro →
  bootstrap → una aceptación/auditoría → operación completa y aislamiento.
- Tech Lead: revisar SQL/grants/RLS/ADRs, integrar y documentar evidencia.

Salida: stack nuevo desde cero sin dependencia `public.profiles` en el alta
Owner; pruebas negativas/concurrentes y rollback reales; recorrido completo en
tres navegadores. No migración remota, publicación productiva ni PILOT-READY
por el mero hecho de completar el código.

## Riesgos que permanecen explícitos

Reaceptación tras revocación/cambio de versión necesita la acción autenticada
y visible definida arriba: no se simula con metadata vieja. Otros flujos de rol
y directorio siguen pendientes de su auditoría completa. La validación técnica
no sustituye revisión legal ni gates de datos reales, restauración y release.
