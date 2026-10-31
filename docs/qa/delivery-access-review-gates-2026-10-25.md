# Controles de acceso y revisión antes de publicación — 25 octubre 2026

## Hallazgos

PR234 HEAD670d15a3 está OPEN/BLOCKED/REVIEW_REQUIRED sin revisiones.
main exige una aprobación externa y seis checks; no se omite protección.
CI40234163820 terminó con fallo Chromium y Required Gate; Firefox/WebKit,
build, unitarias, lint/tipos, RLS, integridad y seguridad de dependencias PASS.
Auth alojado, readiness y pruebas públicas omitidos: no equivalen a PASS.

Chromium: timeout300000ms esperando POST /auth/v1/signup, línea232.
Captura de artefacto12614592364 muestra nombre vacío (placeholder María García)
aunque el test lo había rellenado; correo/contraseña/consentimiento presentes.
La interfaz SSR dejaba editar el formulario antes de hidratación. Se deshabilitan
nombre, correo, contraseña, consentimiento, roles y submit hasta useHydrated.
Se añade regresión SSR→cliente y se comprueban los tres valores antes de enviar.
Hipótesis causal: interacción antes de hidratación; corrección pendiente de CI,
no se eleva timeout ni se retira una comprobación.

GitGuardian check121292031397 FAILURE:
- Incidente38997039: commit6b504e64651ce509d7da278e436b2737c413fa2c,
  scripts/ci/verify-canonical-domain-rehearsal.sh.
- Incidente38997394: commitd64fe2db691b036d2f58f5cc4f4e17282faaeb84,
  .github/workflows/canonical-domain-proposal.yml.

Ambos señalan credenciales sintéticas explícitas del PostgreSQL desechable
de CI, loopback127.0.0.1:55432, basezaltyko_canonical_rehearsal_ci. El runner
exige URL/usuario/base exactos y modoCI; el contenedor se destruye con el job.
No se acredita ninguna credencial real a partir de estas dos coincidencias.
No se ignoraron alertas, rotaron credenciales ni reescribió historia.
La clasificación externa permanece pendiente; secretos reales requerirían
remediación distinta. GitGuardian no figura entre los seis checks obligatorios
del corte consultado, pero se conserva como hallazgo antes de publicar.

Con respuesta humana «si», se guardaron exclusivamente los dos callbacks
de zaltyko-delivery-preview.vercel.app en sandboxaeeootdmuiqkfeernskw.
Recarga confirma cuatro redirects: los dos anteriores del ensayo más los
dos de entregas. Site URL sigue zaltyko-sandbox-preview.vercel.app.
SMTP/proveedores/usuarios/fixtures/preview del ensayo no cambiados.
Alta dedicada sigue pendiente: el humano pidió delegarla, pero el control
del navegador reserva entrada de credencial al usuario; no cuenta ni envío nuevos.

## Fuente

GitHub PR/checks/protección y artefacto Chromium; código RegisterForm/useHydrated.
Supabase UI URL Configuration del proyecto sandbox, relectura después de recarga.
Captura de redirects en auditoría adjunta; sin credenciales.

## Importancia

Ni la SQL productiva aplicada ni los controles aislados sustituyen el recorrido
autenticado de la entrega. Una revisión por agente no satisface aprobación externa
de GitHub. No crear cuentas confirmadas administrativamente para ocultar este gate.

## Siguiente paso

Actualización de CI53684255: ChromiumPASS,1 prueba31,1s; build/lint/tipos/móvil/
seguridad/RLS/DrizzlePASS. UnitariasFAIL en la regresión nueva: jest-dom rechaza
HTMLInputElement de DOMParser por documento/realm distinto, aunque disabled está
presente. Se corrige usando hasAttribute sobre el DOM parseado; se mantiene la
misma aserción semántica y los controles del cliente. Producto sin nuevo cambio.
No se declara PASS de unitarias ni se hereda el resultado entre commits.

Validar la corrección exclusivamente en CI remota. Humano completa contraseña/
condiciones/Crear cuenta en la pestaña de entregas; después comprobar correo real.
Revisor distinto del autor aprueba PR234 para el commit definitivo.
Sin builds/pruebas locales, publicación productiva ni alteración del ensayo.

