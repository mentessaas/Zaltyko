# Bootstrap canónico — aceptación contractual pendiente

## Hallazgo

En el corte `105a1de5`, RegisterForm recoge aceptación y transporta versión/
referencia por Auth metadata. La ruta canónica
`/api/v1/organizations/bootstrap` verifica identidad, pero no persiste ni
comprueba esa evidencia antes de crear organización, sede y membership Owner.
El recorder existente solo se invoca en el alta legacy, cuya página redirige
al bootstrap nuevo. Callback Google actualiza metadata; no acredita persistencia.

Fuente: auditoría Backend, rutas y `src/lib/consent/owner-consent-store.ts`.
51 pruebas focales existentes y verificador bootstrap PostgreSQL PASS no
cubren este gate; no representan aprobación de tratamiento de datos reales.

## Decisión de implementación

- Verificar usuario Auth en servidor y política vigente desde configuración.
- Metadata es una autodeclaración de entrada, no autoridad para roles ni prueba
  criptográfica: el `consent_proof` existente solo valida formato/origen.
- Persistir aceptación y evento de auditoría atómicamente e idempotentemente.
- Exigir fila vigente granted, sin revocación, antes del bootstrap; ausencia,
  revocación, versión antigua o error de configuración no generan organización.
- No reotorgar consentimiento automáticamente desde metadata si existe una
  revocación. Recuperación requiere aceptación explícita, no repetir registro.
- No conceder analítica: su consentimiento browser es independiente.
- No inventar textos jurídicos, ni crear fixtures de consentimiento por SQL o
  Supabase Admin para ocultar el hueco del walkthrough.

Backend es dueño del store, ruta y pruebas. Frontend conserva su corrección
de errores de red. Cualquier dependencia de perfiles legacy o nueva UI de
reaceptación se revisará antes de ampliar el contrato. No se aplicaron cambios
de esquema ni remotos por esta decisión.
