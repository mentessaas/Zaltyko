# Alertas de dependencias: main frente al candidato

15 de octubre de 2026, 09:02 UTC. Auditoría solo lectura Main y Frontend77. Candidato `e7dff88b39ba4fdf19c2f35f1f918a8ff3fa02a1`; main observado `aac785213a9d3678c6215da62ef4e9f6931d3163`. Fuente primaria de registros: API GitHub `GET /repos/mentessaas/Zaltyko/dependabot/alerts?state=open&per_page=100`. No dismiss, instalación, actualización ni nueva prueba de regresión durante esta auditoría.

## Hallazgos y límites

- Siete alertas abiertas en main: dos critical y cinco high, cuatro advisories únicos. No es el resultado de escanear un despliegue del candidato.
- Tres registros tienen versión corregida en el candidato: MCP SDK y los dos locks de shell-quote.
- Cuatro registros de dos advisories mantienen versión afectada, con parches locales móviles; no están resueltos upstream ni cerrados en GitHub.
- El lock raíz también conserva braces3.0.3. El parche de `mobile/patches/` no demuestra protección del árbol raíz. Aplicabilidad/reachability raíz pendiente de revisión separada.
- El PASS del job de seguridad raíz no prueba ausencia de riesgos móviles. La etiqueta `runtime` de GitHub tampoco demuestra inclusión o ejecución en un binario final.

| Registros abiertos | Paquete / advisory primario | main → candidato | Conclusión acotada |
| --- | --- | --- | --- |
| #310 high, raíz pnpm | [MCP SDK GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) | 1.30.0 → 1.32.1 | Corregido por versión; primera versión corregida1.31.0. |
| #309/#308 critical, ambos locks móviles | [shell-quote GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | 1.10.0 → 1.11.0 | Corregido por versión. |
| #305/#304 high, ambos locks móviles | [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | 3.0.3 → 3.0.3 | Sin versión upstream corregida en metadata consultada; mitigación móvil local. |
| #301/#300 high, ambos locks móviles | [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | 1.4.0 → 1.4.0 | Sin versión upstream corregida en metadata consultada; mitigación móvil local. |

## Aplicabilidad observada, no inferida por severidad

MCP: `src/app/api/mcp/route.ts` usa `createMcpHandler` como servidor; importación directa del SDK observada de tipos de servidor. Frontend no encontró cliente OAuth en `src`; el advisory excluye servidores MCP. La versión está igualmente corregida; la búsqueda estática no es una prueba exhaustiva de ejecución.

shell-quote: cadena React Native → react-devtools-core, herramientas móviles. Pin/overrides1.11.0 y regresión del token con salto de línea existentes. No acredita un binario publicado.

braces: micromatch/Metro/patch-package. Parche móvil limita profundidad/ciclos y conserva cinco regresiones. node-forge: Expo CLI/code-signing-certificates; parche móvil de validación ASN.1 anidada y regresión de firma manipulada. Ambos dependen de aplicar `patch-package`; ser herramientas no elimina riesgo en CI/build/firma. La evidencia de pruebas procede de ejecuciones locales anteriores documentadas, no de nuevos tests de esta auditoría.

El CI candidato define instalación móvil congelada con postinstall y job móvil PASS. Esto no demuestra parchear dependencias raíz ni resolver advisories por versión. [Evidencia previa de ambos gestores, parches y 339 pruebas](./mobile-tooling-dos-2026-10-15.md).

Accionable: sí. Siguiente paso: cerrar análisis de alcance de braces raíz y verificar mitigaciones relevantes antes de una decisión de release; sin dismiss por conveniencia ni equiparar riesgo documentado a aceptación. Mantener separado CI, seguridad, esquema/recuperación, aprobación independiente y publicación.

### Revisión raíz Frontend78

Cadenas verificadas en `pnpm-lock.yaml`: Tailwind3.4.19 → chokidar3.6.0/braces o micromatch4.0.8/braces (también por fast-glob3.3.3); next-sitemap4.2.3 → fast-glob3.3.3 → micromatch/braces; plugin ESLint Next15.5.27 → fast-glob3.3.1 → micromatch/braces. `postcss.config.mjs` activa Tailwind y `tailwind.config.mjs` usa tres globs estáticos bajo `src`; los scripts declaran next build/next-sitemap/ESLint.

No se encontraron importaciones directas de braces/micromatch/chokidar/fast-glob en src/scripts, ni una ruta demostrable de entrada HTTP/patrones de usuarios a braces. Alcance demostrado de herramientas build/dev/sitemap/lint; runtime servidor NO DEMOSTRADO, no inspección de bundles desplegados. No hay mitigación raíz en pnpmfile/overrides/manifiesto; brace-expansion es otro paquete. Frontend prepara parche raíz acotado mediante patchedDependencies y regresiones compatibles, **aún no integrado ni probado**. Sin cambio de versión ni cierre de advisory.

Actualización posterior09:27UTC: parche Frontende4d7caee integrado selectivamente en Main, Backend88/QA133GO estático, hashpnpm dymdrenw7322ki6dxkzzldxbhm y2refs. Main10regresionesPASS dentro de89tests focales; instalación congelada offline sin scripts. Se retiraron del parche raíz cambios ajenos de comillas/block.invalid heredados del móvil; este último no se modifica. Mitigación profundidad/ciclos, no presupuesto general de CPU/memoria/expansión combinatoria. Versión3.0.3 sigue identificable; no dismiss, upstreamfix ni seguridadruntime demostrada. [Detalle](./root-braces-cve-2026-93687.md).
