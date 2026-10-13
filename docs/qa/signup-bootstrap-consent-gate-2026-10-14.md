# QA — gate de consentimiento en bootstrap Owner

## Contrato verificado

POST /api/v1/organizations/bootstrap valida primero la sesión Supabase y el
payload, y después exige consentimiento activo antes de llamar al servicio que
crea la organización, sede y membresía Owner.

La ruta vuelve a leer el usuario completo desde la sesión Supabase y comprueba
que su ID coincide con el sujeto autenticado inicial antes de usar los campos
de metadata como transporte de la declaración de signup.

Este endpoint queda limitado a sesión cookie Supabase con usuario completo
verificado. Aunque el helper inicial reconoce sujetos internos firmados o una
sesión de desarrollo, el gate los rechaza si no puede recuperar desde Supabase
un usuario completo con el mismo ID. La ruta ya era cookie-based y no ofrece
autenticación Bearer; no se añade ese contrato aquí.

- user_metadata.legal_consent_version y legal_consent_proof son únicamente
  datos de transporte de lo declarado durante signup. No conceden roles ni
  autorizan operaciones por sí mismos.
- La versión contractual vigente se lee de app_config en el servidor.
- Una fila existente en owner_consent es la fuente de verdad. Si está
  revocada o usa una versión anterior, metadata repetida no la reactiva.
- El primer consentimiento se guarda junto con owner_consent_audit dentro de
  una transacción. La serialización por usuario hace que los reintentos
  concurrentes no dupliquen la concesión ni su auditoría.
- Ausencia de consentimiento responde 428; metadatos malformados o de otro
  origen responden 403; un fallo de configuración/DB/auditoría responde 503. Las respuestas no incluyen errores internos y el bootstrap no se
  ejecuta cuando el gate falla.

## Dependencia de perfil y propuesta pendiente

owner_consent.owner_id tiene FK a profiles.user_id. El gate comprueba que
el perfil exista y no lo crea a partir de Auth metadata. Por tanto, una cuenta
autenticada sin perfil recibe el mismo 428 seguro y no crea academia.

Verificado en el endpoint existente POST /api/onboarding/profile: resuelve el
user ID con auth.getUser, y si no hay perfil inserta una fila profiles con ese
ID. El payload mínimo {name, role: "owner"} crea la fila requerida si la
petición termina correctamente. Ese role de perfil no crea ni sustituye la
membresía de organización; el bootstrap vincula el rol Owner dentro de su
propia transacción. La recuperación UI explícita debe completar este POST antes
de reintentar el bootstrap.

Contrato recomendado para cuentas sin perfil: ofrecer un paso explícito y
autenticado de creación del perfil mínimo requerido, vinculado al user ID
verificado y limitado a campos de perfil permitidos. Ese paso debe formar parte
de la recuperación UX antes de reintentar el bootstrap; el gate de consentimiento
no lo crea de forma oculta ni usa metadata de Auth para inventar identidad o
autoridad. El consentimiento debe proceder de una aceptación real en la UI.
No aceptar consentimientos sembrados por SQL/API administrativa. La UX de
recuperación debe distinguir perfil pendiente y consentimiento pendiente; queda
fuera de este cambio.

## Cobertura añadida

- Store: consentimiento ausente, versión obsoleta, prueba malformada, estado
  revocado, versión ya persistida antigua, perfil inexistente, replay
  concurrente, rollback al fallar audit y configuración sin versión vigente.
- Ruta: 428/403/503 controlados, ninguna creación de organización ante
  fallo del gate y orden consentimiento antes de bootstrap.

Estas pruebas son unitarias con DB simulada; no demuestran el estado de una base
remota ni el comportamiento de un despliegue.

Verificación PostgreSQL reproducible: bash
scripts/run-owner-consent-store-local.sh. El harness levanta un clúster efímero
con tablas mínimas y FK para probar transacciones; no aplica migraciones ni
valida RLS. Exige opt-in y tres URLs explícitas, sin credenciales, al mismo
PostgreSQL loopback, base postgres y puerto indicado; el store se importa solo
después de validar. Las pruebas negativas rechazan ejecución directa sin opt-in
y URLs remotas antes del import dinámico.

Resultado: PASS; dos llamadas concurrentes dejaron una fila de consentimiento
y una de auditoría; una fila revocada no se reactivó; un trigger que hizo fallar
la auditoría revirtió la inserción del consentimiento; un usuario sin perfil no
recibió una fila de consentimiento. No se usó Supabase remoto.
