# Runbook de backup y restore — esquema canónico

## Objetivo

Demostrar que un backup cifrado puede restaurarse en una base aislada, que el
esquema `zaltyko` conserva invariantes y que RLS/grants no se pierden. Este
documento no autoriza operar sobre producción.

## Precondiciones

- destino nuevo, vacío y explícitamente aprobado;
- operador distinto valida origen y destino;
- secretos suministrados por gestor seguro, nunca en historial o archivos;
- cifrado en tránsito y reposo, acceso mínimo y registro de la operación;
- RPO/RTO aprobados. Propuesta inicial: RPO 24 h y RTO 8 h; `NO VERIFICADO`.

## Backup lógico de prepiloto

1. Validar hostname, proyecto y entorno del origen.
2. Crear dump custom solo de `zaltyko` y objetos requeridos; no exportar
   `auth.users` a un equipo personal.
3. Cifrar el artefacto con la clave corporativa y registrar checksum, versión de
   PostgreSQL, hora, tamaño y responsable.
4. Guardar manifiesto separado del secreto de descifrado.

## Restore aislado

1. Crear destino desechable sin acceso público.
2. Restaurar roles/extensiones acordados y después el dump.
3. Aplicar migraciones posteriores solo si el ensayo lo requiere.
4. Ejecutar `pnpm gate:zaltyko-cutover` y los runners PR-01…PR-08.
5. Verificar manualmente RLS forzada, grants, FK cross-tenant, auditoría
   inmutable, reconciliación de ledger y conteos por tabla.
6. Registrar tiempos frente a RPO/RTO y destruir el destino siguiendo el
   procedimiento aprobado.

## Criterios de fallo

- checksum o versión no coinciden;
- falta una migración, policy o grant;
- un rol authenticated lee tablas sensibles;
- ledger no reconcilia;
- aparecen datos fuera del alcance aprobado;
- no puede demostrarse borrado del destino de ensayo.

Ningún restore se ha ejecutado en entorno remoto durante PR-09; por tanto este
gate permanece abierto.
