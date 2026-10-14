# Ref Supabase del Preview: comprobación anónima — 14-10-2026

## Resultado

**Supabase project ref: NO VERIFICADO.** La inspección no encontró una fuente
accesible que asocie el deployment con un proyecto Supabase.

## Evidencia

- Metadatos Vercel del deployment `dpl_7AUQCt3wFRstynhHFwL7PE4s1TXg`: estado
  `READY`; proyecto Vercel `zaltyko`, ID
  `prj_tUepgxfFz4UMpxJ7PrCjWRC66GYT`. El campo `target` llegó como `null`; no
  confirma el entorno. El listado filtrado por SHA `1182f0c` devolvió este
  deployment.
- La consulta Vercel de metadatos de environment variables, con
  `decrypt=false`, respondió **HTTP 403** para ese proyecto. No se repitió.
- GET anónimo del URL público respondió **HTTP 302**, redirección a host
  `vercel.com`, ruta `/sso-api`. No se siguió el redirect externo ni se usó
  sesión o bypass. No se recibió HTML utilizable y no se descargaron scripts.
- No se leyeron ni registraron valores de environment variables, API keys ni
  publishable/anon keys.

## Conclusión

La ficha accesible identifica deployment y proyecto Vercel, pero la lectura de
environment metadata está bloqueada y la página pública requiere SSO. Por ello
no hay ref Supabase confirmada ni comprobación del mapping para el candidato.

## Fuentes

- [Deployment en Vercel](https://vercel.com/mentessaas-projects/zaltyko/7AUQCt3wFRstynhHFwL7PE4s1TXg)
- [URL pública del candidato](https://zaltyko-40j3sljcr-mentessaas-projects.vercel.app/)
