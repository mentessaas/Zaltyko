# Bypass del service worker para Next RSC

Las peticiones con `RSC: 1` o el parámetro `_rsc` quedan fuera de `respondWith()`. Next y el navegador gestionan directamente el transporte de Server Components, refresh y prefetch. El service worker no almacenaba estos documentos; el cambio elimina una capa de mediación y no cambia el tratamiento de páginas HTML, APIs ni assets estáticos.

El trace Firefox disponible muestra RSC y prefetch en las cabeceras y una cancelación alrededor de la navegación explícita. No demuestra que el service worker originara el fallo. El bypass es una reducción de superficie de interferencia, no una causa raíz verificada.

No se incrementa `CACHE_NAME`: las respuestas RSC no entraban en la caché y las reglas de assets estáticos no cambian. La cobertura unitaria verifica bypass por cabecera y query, cache-first de assets, navegación HTML offline y APIs sin caché.

E2E, PostgreSQL y sistemas remotos: no ejecutados.
