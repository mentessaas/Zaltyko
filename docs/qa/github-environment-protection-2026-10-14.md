# Protección de pruebas remotas en GitHub — 14-10-2026

## Hechos verificados

Tras autorización del usuario, se creó `e2e-sandbox` en
`mentessaas/Zaltyko` mediante la API de GitHub y se verificó con GET:

- Reviewer obligatorio: `@elvisvaldes`, previamente verificado con permiso write.
- `prevent_self_review: true`.
- Política de ramas personalizada activa, sin patrones permitidos (0).
- No se crearon, leyeron ni trasladaron valores de secretos.
- No se dispararon workflows, pushes, PRs, despliegues ni operaciones Supabase.

La configuración previa contenía únicamente los entornos Preview y Production;
ninguno fue modificado. El repositorio es público y la cuenta operadora tiene
permiso administrativo. La API aceptó las reglas y su lectura posterior las confirmó.

## Límites y siguiente paso

Esta protección solo afecta a jobs que referencien `e2e-sandbox`. El cambio de
workflow sigue local en el candidato; NO protege retroactivamente el CI publicado.
No publicar ni aprobar pruebas remotas: siguen pendientes aislamiento del Preview,
gestión autorizada de secretos y destino de prueba que no toque el Sandbox actual.
La revisión de un Environment tampoco sustituye la revisión independiente del PR.
No se ha verificado ni cambiado la opción de bypass administrativo.

Fuente normativa: [API de entornos de GitHub](https://docs.github.com/en/rest/deployments/environments#create-or-update-an-environment).
