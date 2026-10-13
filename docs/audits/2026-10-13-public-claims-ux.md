# Auditoría de copy público y primer recorrido owner — 2026-10-13

## Alcance y evidencia

- Superficie: preview Vercel de la rama `codex/zaltyko-plan-implementation`,
  commit observado `b54a49a3652a40f2e8f28d0cad35cb7920ed2705`.
- Rutas observadas: `/`, `/auth/register?role=owner` y
  `/modules/pagos-administracion`; solo lectura, sin crear cuentas ni enviar
  formularios.
- Método: árbol de accesibilidad/DOM y capturas del viewport móvil actual.
  Estas capturas representan el preview, no producción.
- Capturas: [home](../audit/evidence/ui/2026-10-13/home-mobile.jpg),
  [alta owner](../audit/evidence/ui/2026-10-13/owner-registration-mobile.jpg),
  [cobros](../audit/evidence/ui/2026-10-13/family-payments-mobile.jpg).
  La captura de [copy de cobros corregido en local](../audit/evidence/ui/2026-10-13/family-payments-local-after-fix.jpg)
  verifica la nueva presentación móvil. No representa el Preview ni producción:
  esos entornos aún no contienen este cambio.

## Hallazgos

| Prioridad | Evidencia observada | Riesgo para la persona | Decisión/estado |
| --- | --- | --- | --- |
| P1 | Home y comparativa ofrecían cobros automáticos; la página de cobros decía que los cargos y recordatorios salían solos. El núcleo de esta rama solo permite registrar pagos manuales y no ejecuta cargos familiares. | La academia puede contratar esperando que Zaltyko cobre cuotas automáticamente, una capacidad que no está activa. | Corregido localmente en landing, comparativa, ficha de cobros, funcionalidades, integraciones, ayuda, catálogo de planes y `llms-full.txt`. Se añadieron assertions de contrato. No desplegado. |
| P2 | El CTA de propietario abría un registro que mostraba cinco tipos de cuenta, incluido proveedor, aunque el destino indicase `role=owner`. | La elección ajena al objetivo inmediato añadía carga visual y desplazaba los campos de alta en móvil. | Corregido localmente: el CTA owner muestra el rol de dirección y oculta el selector; `/auth/register` genérico conserva los cinco roles. Se añadió prueba de componente y E2E. El E2E está sujeto al gate de proyecto Supabase aprobado; no se intentó saltarlo. |
| No verificado | No se completó una sesión autenticada del Owner Dashboard. | No hay evidencia visual actual del recorrido operativo ni de su accesibilidad humana. | Pendiente de una cuenta E2E aislada aprobada; no pedir ni introducir credenciales de producción. |

## Verificación local de los cambios

- 48/48 pruebas de copy, onboarding y dashboard, más 12/12 pruebas del módulo
  de autenticación; `pnpm typecheck` y `git diff --check` pasan.
- `pnpm build` termina correctamente y genera 288 páginas/rutas. Como el entorno
  local no tiene las variables de Stripe, Supabase ni base de datos, Next avisa
  al generar algunas rutas dinámicas. Esto no verifica integraciones remotas.
- ESLint focal no tiene errores; devuelve 9 warnings existentes en formularios
  y perfiles. La prueba Playwright no arrancó por el guard que exige un proyecto
  Supabase aprobado; no se cuenta como pasada.
- No se verificó el nuevo registro owner en navegador porque su shell intenta
  contactar Supabase. Se verificó el componente con prueba unitaria; no se envió
  formulario ni se creó una cuenta.

## Copy de lanzamiento acordado

> Organiza las cuotas, registra manualmente los pagos recibidos y consulta qué
> importes siguen pendientes. En este lanzamiento no se realizan cargos
> automáticos a las familias.

Stripe debe quedar descrito como facturación del plan SaaS de Zaltyko, no como
conexión ya operativa para cobrar automáticamente a las familias. El núcleo
contempla que la automatización pueda habilitarse solo en planes pagados, pero
no se anuncia hasta completar consentimiento/mandato, entitlement,
provisioning, Connect, worker/webhook idempotentes, recuperación, Stripe Test y
QA de release. Free y trial siguen en manual.

## Gates pendientes

- PR #225 necesita aprobación independiente antes de merge; no eludir la
  protección de `main`.
- El nuevo formulario owner tiene prueba de componente y contrato de producto.
  La prueba Playwright se añadió, pero quedó bloqueada antes de ejecutarse por el
  guard que exige un `E2E_TARGET_SUPABASE_PROJECT_REF` aprobado; no se usó un
  sandbox legacy ni un valor ficticio para saltar el gate.
- Publicar y comprobar el copy corregido en el dominio de producción después
  del merge. No usar el preview como prueba de producción ni captar clientes
  mientras la discrepancia siga visible.
- Completar walkthrough autenticado y revisión de teclado/lector del Owner
  Dashboard en un destino de pruebas aislado.
