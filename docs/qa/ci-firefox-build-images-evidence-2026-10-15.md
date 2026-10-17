# Evidencia QA: build Firefox e imágenes locales — 2026-10-15

## Alcance y procedencia

Evidencia guardada exclusivamente en el checkout QA `Zaltyko-mvp-qa-release-20261013`, rama `codex/mvp-qa-release-20261013`, base `23ee94ba76d441cba7a3a0721173cd335c8755c3`. Integración solo se leyó. No se ejecutaron Docker, E2E, instalaciones, pulls ni nuevas ejecuciones CI en esta pasada. Fecha de observación: 2026-10-15, Europe/Madrid; tiempos de logs en UTC.

## Firefox: fase confirmada y límites

Candidato `de6c3a64534c8ccdd3d71050a00aa728c733a5d6`, [run 38703429157](https://github.com/mentessaas/Zaltyko/actions/runs/38703429157).

- [Firefox job 116316873046](https://github.com/mentessaas/Zaltyko/actions/runs/38703429157/job/116316873046): build inició 08:13:06.561Z; timeout comunicado 08:17:06.936Z, unos 240,375 s. Next informó compilación satisfactoria en 2,8 min, generación de 294/294 páginas y, al final, `Finalizing page optimization` / `Collecting build traces`. Playwright no arrancó. Cleanup comunicado a las 08:17:27.678Z; no se hizo inventario independiente de recursos.
- Los marcadores de Next aparecen a las 08:17:06.937Z porque el error imprime salida capturada: esas horas NO son las horas reales de las fases. Última fase observable: recopilación de trazas. Causa raíz de lentitud/bloqueo: **NO VERIFICADA**; no se demuestra falta de CPU, memoria, caché o red.
- [Build del mismo SHA, job 116316872657](https://github.com/mentessaas/Zaltyko/actions/runs/38703429157/job/116316872657): PASS, paso Build 148 s; compilación 107 s; páginas completas 08:09:57.287Z; trazas 08:10:01.156Z. Entorno/carga del job no equivalentes al runner con Supabase activo.
- [WebKit previo, job 116308348754](https://github.com/mentessaas/Zaltyko/actions/runs/38700837089/job/116308348754), SHA `5d072d1902a8f735eae7c0ad6ef367adf09656dc`: build comenzó 07:48:34.544Z; Playwright anunció ejecución 07:52:39.257Z (244,713 s después). Ese intervalo incluye arranque/preparación posteriores al build; NO es duración exacta del build. Un test PASS (40,2 s), cleanup comunicado.
- [Build previo, job 116308348535](https://github.com/mentessaas/Zaltyko/actions/runs/38700837089/job/116308348535): compilación 117 s, páginas completas 07:47:38.952Z, trazas 07:47:43.386Z.

## Captura del runner y diagnóstico propuesto

En el candidato inspeccionado, `scripts/run-e2e-local.ts` ejecuta Next con `stdio=pipe` implícito; `scripts/lib/local-e2e-runner-core.ts` retiene hasta 20 MiB por stream sin emitir progreso. Al fallar, el formatter concatena stdout/stderr y muestra las últimas 35 líneas: pierde cronología entre streams y marcas temporales originales. Al tener éxito no muestra el stdout del build.

Propuesta pendiente, sin implementar ni ejecutar: tests unitarios con proceso falso y reloj controlado que emitan marcadores de Next en chunks, comprueben clasificación de última fase, duración monotónica por fase, límite de buffer y salida sanitizada. Incluir marcador dividido entre chunks, stderr intercalado, salida sin marcador y timeout con terminación del grupo. Mantener 240000 ms; registrar solo etiquetas conocidas y números, sin entorno, URLs ni stderr arbitrario. Esto mejora observabilidad; no prueba ni corrige la causa del build lento.

## Equivalencia de imágenes: 13/13 linux/amd64

Consulta de metadata pública realizada en esta sesión: tags Docker Hub mediante API `/v2/repositories/{repo}/tags/{tag}` y manifiestos ECR mediante Registry API. Se seleccionó linux/amd64; el digest de plataforma reportado por Hub coincide en las 13 referencias con ECR, y se verificó SHA-256 del cuerpo del manifiesto ECR. La identidad del manifiesto implica los mismos descriptores de config y capas ordenadas. No se descargaron blobs de config ni capas, ni se verificó ejecución de imágenes. No es una garantía permanente de inmutabilidad de tags ni evidencia para arm64.

| Ref ECR | Ref Docker Hub | Digest compartido del manifiesto linux/amd64 |
| --- | --- | --- |
| `public.ecr.aws/supabase/postgres:17.6.1.095` | `supabase/postgres:17.6.1.095` | `sha256:4c087262afbfbb47da86e2863a52d7e424eb21ab589f732d77eeaab51be8e521` |
| `public.ecr.aws/supabase/gotrue:v2.188.1` | `supabase/gotrue:v2.188.1` | `sha256:61f1099e790c4f364b70d6fb92cc07e5f90275abf2cf690ff045c63f1d96ee4b` |
| `public.ecr.aws/supabase/realtime:v2.78.18` | `supabase/realtime:v2.78.18` | `sha256:31dee2e8dd02be5fb86b618fcaa9a998ab4774cba530fffe9e269a053ab498cd` |
| `public.ecr.aws/supabase/storage-api:v1.44.11` | `supabase/storage-api:v1.44.11` | `sha256:d07d65b061cada59c4cd35b87167b82712d42c51bfd5e11ba0b4070af4df6102` |
| `public.ecr.aws/supabase/kong:2.8.1` | `library/kong:2.8.1` | `sha256:e21b0b793879ab96720ed4188f9441260273f4bf775bcbff8d435e019ffb759a` |
| `public.ecr.aws/supabase/postgrest:v14.7` | `postgrest/postgrest:v14.7` | `sha256:1791139f50b4939d738c5b0009329aa9e9d4be0a960b6b580c4944b16e157b95` |
| `public.ecr.aws/supabase/studio:2026.03.23-sha-b7847b7` | `supabase/studio:2026.03.23-sha-b7847b7` | `sha256:640b6fdfaca3a0a0f6591c2739528a348b2fdd2968aaa06f1a49a1e1d5f6d7f5` |
| `public.ecr.aws/supabase/logflare:1.34.14` | `supabase/logflare:1.34.14` | `sha256:c7bb40b2243181cf7e80b8f20606b1255a21316013c6d73554b0929468f72959` |
| `public.ecr.aws/supabase/vector:0.53.0-alpine` | `timberio/vector:0.53.0-alpine` | `sha256:7a74872eb7791f65357b200813bcf613c8dedcac561b4f1a68f9d290f6e6a40c` |
| `public.ecr.aws/supabase/imgproxy:v3.8.0` | `darthsim/imgproxy:v3.8.0` | `sha256:e1a8f4b99dd65b374b5705550505ace929b9dac98694614bbab3510f9e5107dd` |
| `public.ecr.aws/supabase/mailpit:v1.22.3` | `axllent/mailpit:v1.22.3` | `sha256:168f762c218e167ba88ae7e48194126eb5ba5e99ef652063e3f14f9c4f0ee70f` |
| `public.ecr.aws/supabase/postgres-meta:v0.96.1` | `supabase/postgres-meta:v0.96.1` | `sha256:6111fe3317ef6022178d12d23624983fe6b0d28ad853dec9067a344337409b9a` |
| `public.ecr.aws/supabase/edge-runtime:v1.73.0` | `supabase/edge-runtime:v1.73.0` | `sha256:0be7a1ed2f598a772786f27ed96e1e3cc523be351f7fd6ab1a2f30bd134dce31` |

Fuentes de mapeo: [Dockerfile de Supabase CLI v2.84.2](https://github.com/supabase/cli/blob/v2.84.2/pkg/config/templates/Dockerfile) y [resolución de registry](https://github.com/supabase/cli/blob/v2.84.2/internal/utils/docker.go). Para reproducir la consulta de cada fila: `https://hub.docker.com/v2/repositories/{repo}/tags/{tag}`; manifiesto ECR `https://public.ecr.aws/v2/supabase/{nombre}/manifests/{tag}` con token público temporal solo en memoria. Ningún token se guarda aquí.

Cambiar de registry no elimina cuotas: [cuotas ECR Public](https://docs.aws.amazon.com/AmazonECR/latest/public/public-service-quotas.html), [límites Docker Hub](https://docs.docker.com/docker-hub/usage/pulls/). No se implementó cambio de registry ni se modificaron refs, timeouts, CI o credenciales.
