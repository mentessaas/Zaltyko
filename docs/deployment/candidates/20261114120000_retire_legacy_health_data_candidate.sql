-- CANDIDATE ONLY. Requiere autorización expresa de Elvis antes de cualquier
-- aplicación alojada (staging o producción). No aplicado en ningún entorno.
-- No está en supabase/migrations a propósito.
--
-- Qué hace: elimina del esquema legacy (public) los datos de salud de
-- gimnastas que solo escribía y leía el panel antiguo /app, ya retirado:
--   1. public.athlete_documents (documentos de la gimnasta; el tipo
--      'medical_certificate' guarda certificados médicos y cualquier archivo
--      que la academia subiera).
--   2. public.federative_licenses.medical_certificate_expiry (caducidad del
--      certificado médico).
--   3. public.template_license_config.medical_certificate_required y
--      medical_certificate_validity_months (exigencia y vigencia del
--      certificado en las plantillas deportivas).
--
-- Es DESTRUCTIVO e irreversible: no hay copia en esta migración. Antes de
-- aplicarla, quien la autorice debe (a) comprobar con el recuento de abajo qué
-- filas existen en el entorno, (b) decidir si hace falta exportar algo y
-- (c) borrar los archivos de Storage (ver nota final). No hay clientes reales
-- en producción a 14-11-2026, pero eso se verifica, no se supone.
--
-- Orden en la PR que la aplique, para no romper el esquema Drizzle:
--   1. Aplicar este SQL.
--   2. En la misma PR, quitar de src/db/schema: athlete-documents.ts, la
--      columna medicalCertificateExpiry de federative-licenses.ts y las dos
--      columnas medicalCertificate* de templates/template-license-config.ts, y
--      de src/db/seeds/templates los valores medicalCertificate* de España.
--      (Hoy se conservan porque la base alojada aún tiene las columnas: quitarlas
--      del esquema antes que de la base crearía deriva.)
--   3. Quitar 'medical_certificate' de src/types/athletes.ts (tipos de documento).
--
-- Recuento previo (solo lectura; ejecutar antes y guardar el resultado en el
-- informe, sin copiar datos personales):
--   select count(*) as documentos,
--          count(*) filter (where document_type = 'medical_certificate') as certificados
--   from public.athlete_documents;
--   select count(*) as licencias_con_certificado
--   from public.federative_licenses where medical_certificate_expiry is not null;
--
-- Protección: la migración aborta salvo que la sesión confirme la intención con
--   set local zaltyko.retire_health_data = 'confirmado';
-- dentro de la misma transacción.
begin;

do $retire_legacy_health_data_preflight$
begin
  if coalesce(current_setting('zaltyko.retire_health_data', true), '') <> 'confirmado' then
    raise exception
      'Candidata destructiva: confirmar con set local zaltyko.retire_health_data = ''confirmado'' tras revisar el recuento previo';
  end if;
  if to_regclass('public.athlete_documents') is null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'federative_licenses'
         and column_name = 'medical_certificate_expiry'
     ) then
    raise exception 'Nada que retirar: el entorno no tiene los objetos legacy de salud (¿ya aplicada?)';
  end if;
end
$retire_legacy_health_data_preflight$;

drop table if exists public.athlete_documents;

alter table if exists public.federative_licenses
  drop column if exists medical_certificate_expiry;

alter table if exists public.template_license_config
  drop column if exists medical_certificate_required,
  drop column if exists medical_certificate_validity_months;

commit;

-- NOTA SOBRE STORAGE (no es SQL aplicable): los archivos subidos desde /app
-- viven en el bucket «uploads» con la ruta
-- <tenantId>/<academyId>/athletes/<athleteId>/documents/<archivo>.
-- Borrar filas de storage.objects con SQL no elimina el archivo físico. Hay que
-- listar y borrar esos prefijos con la API de Storage (cliente admin) tras
-- autorización, y comprobar después que el recuento es cero:
--   select count(*) from storage.objects
--   where bucket_id = 'uploads' and name like '%/athletes/%/documents/%';
--
-- Fuera de alcance de esta candidata (no es dato de salud de gimnastas):
-- el tipo enumerado public.document_type (sin uso en columnas actuales; el
-- campo es text) y coach_notes (notas libres de entrenadora; revisar en la
-- EIPD si pueden contener salud).
