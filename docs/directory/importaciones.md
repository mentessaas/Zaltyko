# Formato de importación del directorio

Máximo 2 MB y 1.000 filas por lote. Registrar primero la fuente con URL, país, enlace HTTPS a sus condiciones y referencia verificable de autorización escrita. El Super Admin confirma esa revisión y la acción queda en auditoría. Sin la confirmación vigente no se admite carga, extracción automática ni aceptación de filas. La carga prepara candidatos; aceptar una fila crea un borrador o una propuesta de cambio. Publicación siempre aparte. La validación técnica no determina por sí misma si un permiso es legalmente suficiente.

JSON: lista de objetos con `externalId`, `kind` (`academy`, `event`, `organization`) y `data`. Ejemplo ficticio, no publicable sin comprobación:

```json
[{"externalId":"ejemplo-local-001","kind":"academy","data":{"name":"Academia ficticia de ejemplo","countryCode":"ES","city":"Madrid","sourceName":"Fuente de ejemplo","sourceUrl":"https://example.org/ficha"}}]
```

CSV: cabeceras `externalId,kind,name,countryCode,city,sourceName,sourceUrl`; opcionales `description,region,address,disciplines,website,startDate,endDate,organizerName,registrationUrl`. Disciplinas separadas por `|`; fechas `YYYY-MM-DD`. Valores de disciplina: artistic_female, artistic_male, rhythmic, trampoline, aerobic, acrobatics, parkour, general.

Los campos desconocidos se dejan vacíos. El CSV descarta otras columnas: no conservar responsables personales, menores, emails comerciales del CRM ni puntuaciones. JSON es estricto y rechaza campos ajenos al contrato público.

La procedencia e identificador deben ser estables. Repetir contenido en la misma fuente no duplica el lote. Coincidencias por nombre/país/localidad requieren revisión y vinculación expresa; no se fusionan automáticamente. Si una referencia ya apunta a otra ficha, no puede reasignarse mediante la importación. Las fusiones se realizan desde administración y conservan redirecciones.

Para PDF/OCR, preparar candidatos de este formato con fuente, página y evidencia revisadas antes de cargar. No completar ciudades, disciplinas u organizadores por deducción. Las fechas incompletas impiden publicación. La desaparición de un registro de la fuente no retira su ficha automáticamente.
