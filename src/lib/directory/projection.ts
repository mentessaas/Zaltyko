import { sql } from "drizzle-orm";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
// Always derive linked data from its operational authority. No private columns are projected.
export function publicDirectoryCte() {
  const base = getPublicSiteUrl();
  return sql`WITH operational AS (
 SELECT a.id,'academy'::text AS kind,jsonb_build_object('name',a.name,'description',COALESCE(a.public_description,''),'countryCode',upper(COALESCE(a.country_code,'')),'countryName',a.country,'region',a.region,'city',a.city,'address',a.address,'disciplines',jsonb_build_array(COALESCE(a.discipline_variant,'general')),'website',CASE WHEN a.website LIKE 'https://%' THEN a.website END,'contactEmail',a.contact_email,'contactPhone',a.contact_phone,'sourceUrl',${base}||'/academias/'||a.id::text,'sourceName','Información publicada por la academia','activity','operational','eventStatus','provisional','eventType','competitions','spectatorAccess','unknown') AS data,a.id AS academy_id,NULL::uuid AS event_id,COALESCE(a.created_at,now()) AS modified
 FROM academies a WHERE a.is_public AND NOT a.is_suspended AND a.status IN ('active','trial')
 UNION ALL
 SELECT e.id,'event'::text,jsonb_build_object('name',e.title,'description',COALESCE(e.description,''),'countryCode',upper(COALESCE(e.country_code,a.country_code,'')),'countryName',COALESCE(e.country_name,e.country,a.country),'city',COALESCE(e.city_name,e.city),'region',COALESCE(e.province_name,e.province),'disciplines',jsonb_build_array(COALESCE(e.discipline::text,'general')),'sourceUrl',${base}||'/events/'||e.id::text,'sourceName','Información publicada por el organizador','organizerName',a.name,'organizerUrl',CASE WHEN a.website LIKE 'https://%' THEN a.website END,'eventType',COALESCE(e.event_type::text,'other'),'eventStatus','confirmed','startDate',e.start_date::text,'endDate',e.end_date::text,'registrationEndDate',e.registration_end_date::text,'activity','unknown','spectatorAccess','unknown'),NULL::uuid,e.id,COALESCE(e.updated_at,e.created_at,now())
 FROM events e JOIN academies a ON a.id=e.academy_id WHERE e.is_public AND e.status='published' AND a.is_public AND NOT a.is_suspended AND a.status IN ('active','trial')
 ), projected AS (
 SELECT d.id,d.kind,COALESCE(o.data,d.data) AS data,d.slug,d.publication,d.representation,d.academy_id,d.event_id,d.merged_into,d.reviewed_at,GREATEST(d.updated_at,o.modified) AS updated_at,d.created_at FROM directory_entries d LEFT JOIN operational o ON o.academy_id=d.academy_id OR o.event_id=d.event_id
 UNION ALL
 SELECT o.id,o.kind,o.data,''::text,'published'::text,'unclaimed'::text,o.academy_id,o.event_id,NULL::uuid,o.modified,o.modified,o.modified FROM operational o WHERE NOT EXISTS(SELECT 1 FROM directory_entries d WHERE d.academy_id=o.academy_id OR d.event_id=o.event_id OR d.id=o.id)
 )`;
}
