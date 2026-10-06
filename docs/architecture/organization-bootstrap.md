# Bootstrap canónico de organización

- Estado: implementado y verificado localmente
- Fecha: 2026-10-06
- Alcance: desbloqueo técnico de PR-09

## Contrato

Una cuenta autenticada con intención owner entra en `/owner/setup`. El comando
crea en una sola transacción:

1. organización en estado `trial`;
2. primera sede con zona horaria IANA;
3. membership owner activo con scope `all`;
4. recibo idempotente, auditoría y evento outbox.

La identidad owner siempre procede de la sesión; nunca del payload. Tres
entregas concurrentes con la misma clave producen una organización. Reutilizar
la clave con otro payload falla, igual que intentar una segunda organización
activa desde el setup inicial.

La tabla de recibos tiene RLS forzada, cero grants para `authenticated` y no
contiene nombres personales. La API canónica es
`POST /api/v1/organizations/bootstrap` y exige `Idempotency-Key`.

## Entrada de autenticación

`resolveUserEntry` consulta primero memberships canónicos para owner/admin/
manager. Un owner registrado sin membership va al setup nuevo sin crear
`public.profiles`, `public.academies` ni `tenant_id`. Otros roles conservan por
ahora su resolver separado.

## Evidencia local

- triple submit concurrente: una organización/sede/member/audit/outbox;
- retry idéntico estable y conflicto de payload detectado;
- actor externo denegado;
- scope owner agregado correcto;
- ruta auth owner existente → `/owner?organizationId=...`;
- ruta auth owner nuevo → `/owner/setup`;
- RLS forzada y Data API sin grants.

Comando: `pnpm test:zaltyko-organization-bootstrap:local`.

## Límites

No se ha ejecutado signup/login real en Supabase remoto ni envío de correo. El
flujo no crea datos operativos, plan comercial, suscripción o checkout. Esos
efectos no deben añadirse implícitamente al bootstrap.
