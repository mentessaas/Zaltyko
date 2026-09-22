# Configuración necesaria para desbloquear GO

El pipeline no ejecuta E2E autenticado con credenciales ficticias. Para habilitarlo, un mantenedor debe crear en GitHub Actions los secretos del repositorio `mentessaas/Zaltyko`:

- `E2E_AUTH_EMAIL`: usuario de pruebas autorizado.
- `E2E_AUTH_PASSWORD`: contraseña de ese usuario.
- `E2E_ACADEMY_ID`: UUID de una academia de pruebas persistente.
- `E2E_PROFILE_ID`: UUID del perfil owner asociado, necesario para los flujos focales.

Los valores se introducen mediante GitHub Settings → Secrets and variables → Actions. No deben pegarse en issues, commits, logs ni conversaciones.

Después de guardarlos:

1. Relanzar el workflow de CI del PR #130.
2. Confirmar que `E2E Credentials Readiness` termina `enabled`.
3. Confirmar que `GO Gate - Authenticated E2E required` pasa.
4. Confirmar que `E2E Authenticated Flows` termina `success`, no `skipping`.
5. Guardar el run URL y el resumen de Playwright en el artefacto de release.

Hasta que los tres secretos mínimos estén configurados, el resultado correcto es `NO-GO`.
