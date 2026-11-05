# Acceso de equipo — candidato de fase 1

## Hallazgos y alcance

Personal conserva su directorio sin cuenta. Este candidato añade, detrás de `ZALTYKO_TEAM_ACCESS_ENABLED=false`, invitaciones canónicas para Manager y Coach con sedes explícitas, inspección autenticada, aceptación expresa, reemisión y revocación de invitaciones pendientes. Solo Owner activo con alcance `all` gestiona invitaciones. No concede Owner/Admin ni modifica membresías previas.

El enlace se revela una vez y se comparte manualmente, sin enviar correo. La credencial aleatoria permanece en memoria del navegador; el servidor conserva un hash. La página limpia el fragmento antes de inicializar telemetría y no acepta automáticamente tras iniciar sesión. Los reintentos conservan cuerpo/clave mientras la página siga abierta; recuperar un recibo no revela el enlace ni rota el token.

Membresía, sedes, consumo del token, recibo y auditoría forman una transacción. Se revalida la autorización después del lock de organización. Una membresía previa, incluso revocada, nunca se reactiva al aceptar. Un recibo histórico tampoco presenta una membresía revocada como activa.

## Fuentes y verificación

Backend, Owner y QA realizaron revisiones estáticas separadas, sin P1/P2 de producto abiertos al congelar las fuentes. No equivale a ejecución. Las suites HTTP/UI comprueban gate exacto, roles, validación, revisión, identidad, aceptación expresa y recuperación manual. La suite PostgreSQL solo instala el candidato en GitHub/Linux/loopback desechable y comprueba RLS/ACL, carreras, rollback tardío, unicidad y exportación verificable.

Exportador y verificador admiten las tres tablas nuevas solo como grupo completo conocido, con contajes por academia y sin valores de invitación, credencial o recibo. La devolución continúa parcial y no restaurable.

Se mantienen los controles de CI principal y aislada. Tests, tipos y builds están **NO EJECUTADOS** hasta observar los runs remotos posteriores a la integración. No se ejecutaron pruebas, builds, instalaciones ni servicios en Mac. Matriz: `docs/qa/team-access-acceptance-2026-11-05.md`.

## Importancia y límites

Es una frontera de acceso. La función queda desactivada, el SQL no se aplica y la preview publicada continúa en `608a53bb`. No incluye vínculo de perfil, asignación a sesiones, entrada operativa de Coach ni baja de un miembro aceptado. No acredita autoservicio completo de equipo ni MVP listo para abrir.

## Siguiente paso

1. Verificar CI principal, aislada, Static Gates, integridad SQL y GitGuardian del mismo SHA, distinguiendo controles omitidos.
2. Resolver fallos sin retirar controles y obtener revisión externa del candidato resultante.
3. Presentar SQL, hash y permisos exactos de la credencial del destino de entregas para autorización específica. El candidato exige tres relaciones ausentes; no repara instalaciones previas. No aplicar a un destino existente por inferencia.
4. Habilitar y validar en entregas solo después de las autorizaciones correspondientes, con aceptación incremental y sesiones QA existentes.

Producción, Live y ensayo están excluidos. Devolución integral y preparación fiscal/comercial y productiva permanecen abiertas.
