# Gestión internacional y especialización progresiva — 4 noviembre 2026

## Hallazgos y decisión

El usuario sustituye el plan anterior por tres capacidades separadas: administración del club, especialización deportiva y adaptación local/comercial. La falta de reglas federativas no obliga a elegir España ni debe impedir utilizar administración comprobada. España y México son los primeros recorridos objetivo; otros países se atenderán según capacidad real, sin academias ficticias.

Precios base SaaS conservados: Starter 19/190 EUR y Growth 49/490 EUR. Las cuotas manuales EUR/MXN son independientes del cobro SaaS y no acreditan facturación fiscal local.

## Fuente

Plan humano aprobado el 4 de noviembre de 2026, «Zaltyko: gestión internacional y especialización progresiva en gimnasia». Ejecución y aceptación detalladas en [plan de implementación](../../docs/qa/international-implementation-plan-2026-11-04.md). Bootstrap y propuestas nuevas se preparan sobre el candidato 3e2ad57f, sin declarar aceptación de código aún no ejecutado.

## Importancia

- Evitar que los reglamentos bloqueen innecesariamente el acceso administrativo internacional.
- Mostrar futuras propuestas con honestidad, sin vender funciones inexistentes como restricciones de un plan.
- Mantener un solo censo y permisos canónicos al adaptar biblioteca/progreso GAF/GAM, después planificación, ejercicios validados y modelo propio de rítmica.
- Incluir devolución, conservación y supresión desde el diseño; la exportación parcial no es devolución integral.
- No ampliar el núcleo de lanzamiento con todas las ampliaciones a la vez: captación, eventos, reputación y gamificación se ordenan por demanda/dependencias.

## Coordinación y siguiente paso

Backend: registry y bootstrap; Owner: formulario y propuestas; QA: aislamiento, monedas, zonas y derechos; coordinación: integración y CI remota. Archivos separados y sin despliegues independientes.

Integrar un primer candidato administrativo ES/MX y catálogo de propuestas; registrar resultados del SHA exacto. El perfil MX general, si falta, requiere candidato incremental revisado, no un perfil español ni reglas ficticias. Ningún SQL alojado se aplica en este trabajo. El ensayo y producción permanecen intactos.

## Pendiente de apertura

Aceptación alojada del candidato final, correo automático real y procedimientos completos de datos. No se heredan PASS ni se cuentan jobs omitidos. Cualquier SQL o ajuste alojado exige alcance/autorización específicos. Live cerrado hasta alta/datos fiscales, asesor, contratos y configuración propia. Elvis atiende soporte con ayuda de IA; sigue pendiente un suplente humano.

## Corrección de la validación comercial internacional

El candidato a6879f33 falló una prueba unitaria: combinaba configuración Live con operación, sesión y precio sintéticos Test. La validación rechazaba esa mezcla antes de comprobar el cambio de mercado ES→MX. La corrección se limita a los datos de esa prueba: mantiene el 403 por mercado no habilitado, la recuperación única y la ausencia de escrituras. El validador y los controles comerciales del producto no se relajan.

Backend prepara la corrección, QA revisa independientemente y coordinación integra y ejecuta CI remota del nuevo SHA. Ningún resultado de a6879f33 o del padre verde se atribuye al nuevo commit. No se han ejecutado pruebas en el Mac ni aplicado SQL o cambios alojados. Owner concreta por separado el siguiente incremento de derechos de datos; la descarga actual sigue siendo parcial.

El siguiente paso humano será revisar el commit exacto cuando pasen los controles. La revisión de los dos perfiles MX y la decisión de conservación del registro de interés son independientes: se puede mantener el catálogo sin medición mientras se termina esa decisión. No se habilita Live ni se solicita aplicar SQL a partir de esta nota.

## 2026-11-04 — Bloqueo Firefox y diagnóstico acotado

`dba6c7fb`: WebKit/Chromium y CI aislada PASS, Firefox FAILURE al reabrir asociación familiar tras PATCH del tutor y recarga. No está listo para aprobar. Seguimiento dba eliminado tras aviso; no se reinician/cancelan runs. Coordinación prepara metadatos DOM/request sanitizados en la prueba y artifact acotado, sin modificar producto ni aserciones/esperas/retries. Revisión Owner no atribuye causa a hidratación ni refresh. Fuente `docs/qa/firefox-family-reopen-diagnostic-2026-11-04.md`. Backend/QA preparan verificador puro de devolución parcial en archivos separados, fuera del candidato diagnóstico. Sin SQL alojado, Live, producción, ensayo ni builds/tests locales.
