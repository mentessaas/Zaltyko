# Equivalencia exacta de repositorio fijado — 2026-10-15

## Entrega local separada

Base: commit de diagnóstico c9a70c8bad96ef89a37579dd9d38f2477be0a2b6. Este cambio amplía solo las representaciones textuales equivalentes del mismo repositorio fijado y digest exacto. No normaliza cadenas observadas.

Conjunto derivado exclusivamente del pin:

- REPO@MANIFEST_SHA256.
- docker.io/REPO@MANIFEST_SHA256.
- NOMBRE@MANIFEST_SHA256 solo si el repositorio fijado es library/NOMBRE simple, sin subpaths. Actualmente solo library/kong cumple esa condición entre los 13 pins.

Para Kong se permiten exactamente library/kong@sha, docker.io/library/kong@sha y kong@sha. docker.io/kong@sha NO se añade: está fuera del conjunto acordado aunque otra implementación pudiera canonizarlo. No se aceptan otros dominios (incluidos index.docker.io y registry-1.docker.io), namespaces, subpaths, tags, espacios, cambios de mayúsculas o digest distinto. Entradas no string no se convierten. Igual que antes, basta una entrada exacta en RepoDigests; otras entradas no satisfacen la comprobación por sí mismas.

Se conservan config SHA256 exacta y linux/amd64, seis checks saneados, validación antes y después del retag, un fallback por rate-limit exclusivo y presupuesto compartido de 600 s. Pins y política de pull no cambian. La base QA es más antigua que el guard de Main de status entero positivo: integrar por hunks y PRESERVAR ese guard; no copiar el helper completo.

## Evidencia y límites

313/313 tests mock PASS en tres archivos (2,96 s). Suite nueva: 27 positivos, 223 negativos y tres checks adicionales de config/repositorio posretag y tipos no string. Se sustituye la fixture Kong que rechazaba la forma familiar por un caso positivo, conservando todos los demás fallos de identidad y diagnóstico.

La fixture sintética demuestra y corrige el defecto de compatibilidad del comparador frente a la forma familiar. No demuestra qué campo difirió realmente en el job WebKit 116350475834. No afirma resolver ese CI ni el timeout independiente de Firefox.

Fuentes primarias versionadas: [Moby v28.5.1 backend clásico](https://github.com/moby/moby/blob/v28.5.1/daemon/images/image_inspect.go), [backend containerd](https://github.com/moby/moby/blob/v28.5.1/daemon/containerd/image_inspect.go) y [distribution/reference v0.6.0](https://github.com/distribution/reference/blob/v0.6.0/normalize.go). Moby presenta RepoDigests con FamiliarString; reference retira docker.io y library/ para el nombre oficial simple, conservando el digest.

## Changelog

2026-10-15: implementación local de conjunto exacto por pin y pruebas mock. Sin Docker, inspect real, pulls, instalaciones, builds, E2E, CI, push ni escrituras remotas. Pendiente revisión e integración por hunks de Main/Frontend. No constituye GO a otra corrida.

Actualización Main10:18UTC: integrado selectivamente sobre d6740f3d, guard positivo actual preservado. Frontend92GO y QA149GO estáticos; Main379/379mockPASS9archivos,tsc0,eslint0,formato/diffcheck0. El mock utiliza el timeout en aserciones >0/<=600000, conserva observación por llamadas. Con protecciones reconfirmadas se prepara un único candidato nuevo, no rerun. No resolución real de WebKit o Firefox demostrada. Evidencia consolidada ci-2b581cd9-local-diagnostics-2026-10-15.md.
