# Acceso asistido de mercados administrativos pendientes

## Problema y comportamiento

El alta autoservicio admite España y México de forma independiente de su contratación Live. Un club de otro país necesita conservar su contacto y necesidad sin elegir un país ficticio ni crear una academia fuera de cobertura.

OwnerSetupForm enlaza a `/contact?type=market_access`. El formulario recoge país autodeclarado, función adulta, disciplinas y necesidad. No deduce ISO, moneda, zona horaria o reglamento; no crea academia, matrícula, plan ni consentimiento comercial. El nombre de club es opcional y sirve como contacto. No hay opt-in de campañas ni fecha de lanzamiento prometida.

La ruta antigua `/api/onboarding/owner` también comprueba el mercado administrativo en servidor después de autenticar y validar el payload, antes de consultar o escribir datos. ES/MX continúan al control de perfil existente; los demás reciben422. Esto no habilita Checkout Live de México.

## Persistencia y recuperación

Se reutilizan `leads` y sus interacciones inmutables existentes, sin migración. El motivo `market_access` exige su objeto estricto; otros motivos no admiten ese objeto. El mensaje se guarda como JSON versionado dentro de la interacción. El mensaje serializado completo debe caber en2.000 caracteres.

El servidor normaliza UUID y correo, serializa por clave con un advisory lock transaccional y compara el comando previo antes de escribir. Replay equivalente devuelve los IDs originales. Un cambio de cuerpo con la misma clave devuelve409 sin crear el contacto perdedor. Lead e interacción se escriben en la misma transacción; un fallo de la segunda escritura revierte la primera.

En el formulario, el doble envío en curso se bloquea. Tras perder una respuesta, un reintento sin cambios conserva cuerpo y clave en memoria. No se guardan estos datos en Web Storage y no se afirma recuperación tras cerrar o recargar la pestaña. El evento analítico no incluye país autodeclarado, email, necesidad ni datos de menores. La respuesta operativa utiliza el servicio de correo existente; no activa campañas. Su entrega real no queda acreditada por mocks o persistencia y no existe garantía de outbox transaccional para esa notificación.

El texto libre permite introducir datos a pesar de la advertencia. No hay filtro semántico que garantice excluir datos de menores. Se requiere atención humana y minimización; no se presenta la exportación canónica de academia como devolución de estos contactos legacy. Retención y atención de derechos siguen en el cierre documental antes de activar captación pública.

## Validación prevista

- Contrato: campos, normalización, combinación motivo/objeto, límites y rechazo de campos ajenos.
- UI: selección obligatoria accesible, ausencia de POST al abrir, doble envío y retry exacto sin almacenamiento de PII.
- Ruta: recibos estables, replay equivalente,409 sin escritura extra, contacto ordinario y validación antes de DB/efectos.
- PostgreSQL efímero: ocho comandos equivalentes concurrentes, UUID con mayúsculas, cuerpos en conflicto y rollback por fallo de segunda escritura. Tablas mínimas en un esquema exclusivo del contenedor GitHub, nunca sobre Supabase alojado. Los efectos de email y analítica permanecen simulados.

No se ejecutaron suites, builds, tipos ni instalaciones en el Mac. Los resultados deben atribuirse al SHA de CI posterior; esta especificación por sí sola no acredita ejecución ni aceptación alojada. La preview publicada permanece en64dc9381 mientras se integra y revisa el candidato nuevo. Producción, Live y ensayo quedan intactos.
