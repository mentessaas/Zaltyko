# Apertura esencial España — matriz finita

## Candidato y límites de evidencia

Base de trabajo aac0c5e33bcb278f7f982cc59fa8f2c27f53495f, rama codex/mvp-main-bridge-20261025, PR234. Esta actualización implementa el recorte del plan humano. Los resultados anteriores de aac no acreditan este diff. No hay migración ni cambio de API; no se consulta ni modifica el ensayo natural. Ningún build/test pesado se ejecuta en Mac.

| Recorrido | Implementado | Prueba aislada del nuevo commit | Sandbox del nuevo commit | Publicado en producción |
| --- | --- | --- | --- | --- |
| Alta, consentimiento, confirmación, recuperación y academia | Sí, existente | Pendiente CI | Pendiente; histórico de correo no sustituye nuevo recorrido | NO VERIFICADO |
| Familias, responsables y gimnastas | Sí, existente | Pendiente CI/replay SQL | Pendiente pruebas completas en academias de entrega | NO VERIFICADO |
| Grupos, clases, inscripciones y asistencia | Sí, existente | Pendiente CI/E2E sintético | Pendiente | NO VERIFICADO |
| Cuotas mensuales y pagos manuales | Sí, existente | Pendiente CI/replay SQL | Histórico pago35EUR; no acredita entrega actual ni todos los casos | NO VERIFICADO |
| Resumen persistido sin métricas avanzadas | Nuevo recorte | Pendiente CI; nuevos tests de autorización/indisponibilidad/navegación | Pendiente | No |
| Dos academias/dos sedes y denegaciones | Guards existentes | Pendiente CI/replay | Pendiente cierre por rutas del commit | NO VERIFICADO |
| Idempotencia/concurrencia/respuesta perdida/sin parciales | Guards existentes | Pendiente CI/replay | Pendiente cierre | NO VERIFICADO |
| Free30/3/10, excedente y archivo | Existente | Pendiente CI/replay | Evidencia histórica separada; pendiente candidata actual | NO VERIFICADO |
| Móvil375/768/1280, errores/vacío | Existente y recorte nuevo | Se amplía E2E sintético; pendiente ejecución remota | Pendiente | NO VERIFICADO |
| SaaS Checkout/Portal/cancelación/impago/caducidad | Existente | Pendiente CI; no confundir con ciclo remoto auténtico | Test histórico separado; terminal natural pendiente en seguimiento propio | NO VERIFICADO |
| Landing, FAQ, ayuda y catálogo esenciales | Nuevo recorte | Pendiente CI; precios base sin IVA | Pendiente | No |
| Crons excluidos del artefacto candidato | vercel.json crons vacío | Pendiente CI | No activados por esta edición local | No cambio remoto |

## Cambios concretos

- /owner obtiene scope autorizado y resumen operativo; mantiene redirección legacy y denegaciones. Si falla la lectura, muestra indisponibilidad, nunca cero financiero inventado.
- Selector de sede limitado a las autorizadas; agregación solo con permiso. Servicios conservan sus propios guards.
- /owner/insights y /owner/health-score/setup devuelven404. Se conserva código/API histórico sin activar procesador global.
- Portada, catálogo, features, FAQ, ayuda, integraciones e índices llms describen solo capacidades esenciales. Se conservan importes y cuotas; se explicita sin IVA por decisión humana.
- /modules/* se retira como embudo y redirige a /features. Sus fuentes se conservan; sitemap deja de emitir esas URLs.
- Manifiesto sin crons y despliegues Git automáticos deshabilitados. No se retiran ni alteran tareas existentes remotas por editar el archivo.

## Bloqueos concretos antes de cobrar

Identidad del vendedor (autónomo/sociedad, NIF y domicilio), fiscalidad aplicable y precio final, condiciones/privacy y correo de soporte operativo. No se inventan ni se deducen de Stripe test. Usuario confirmó precios sin IVA; no confirmó los otros datos. Revalidar configuración Live propia y DNS/DB/TLS/Auth/correo/Redis/observabilidad sin heredar sandbox. Primera venta auténtica, sin compras reales de prueba.

Fuentes oficiales consultadas26oct2026: [LSSI art10](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10), [facturación art6](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696#a6), [AEAT tipos IVA](https://www3.agenciatributaria.gob.es/Sede/iva/calculo-iva-repercutido-clientes/tipos-impositivos-iva.html). El tipo general21% es referencia, no resolución fiscal del vendedor o cualquier operación.

## Próximo gate

Commit y CI remota completa, revisión externa del HEAD resultante y validación autenticada delivery. Revisión de contenido SEO histórico y superficies legacy aún pendiente antes de dominio público. No reducir controles SQL ni presentar una preview como producción.
