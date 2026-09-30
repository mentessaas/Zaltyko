import { db } from "@/db";
import { sql } from "drizzle-orm";
import { rows, syncOperationalDirectory } from "./service";
import { fetchSourceCandidates } from "./imports";
import { flag } from "./contracts";
import { enqueueDigests, processDeliveries } from "./communications";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
export async function maintainDirectory() {
  const synchronized = await syncOperationalDirectory();
  let fetched = 0,
    failed = 0,
    cleaned = 0;
  if (flag("imports")) {
    const sources = await rows(
      sql`SELECT s.id FROM directory_sources s WHERE s.enabled AND s."authorization" IS NOT NULL AND s.adapter<>'manual' AND (s.checked_at IS NULL OR s.checked_at<now()-CASE WHEN EXISTS(SELECT 1 FROM directory_import_rows r JOIN directory_entries d ON d.id=r.entry_id WHERE r.source_id=s.id AND d.kind='event' AND d.data->>'startDate' BETWEEN CURRENT_DATE::text AND (CURRENT_DATE+30)::text) THEN interval '1 day' ELSE interval '7 days' END) ORDER BY s.checked_at NULLS FIRST LIMIT 3`
    );
    for (const source of sources)
      try {
        await fetchSourceCandidates(String(source.id));
        fetched++;
      } catch (e) {
        failed++;
        await rows(
          sql`UPDATE directory_sources SET checked_at=now(),last_error=${e instanceof Error ? e.message.slice(0, 500) : "Revisión manual necesaria"} WHERE id=${source.id}::uuid`
        );
      }
  }
  const claims = await rows(
    sql`SELECT id,evidence_path FROM directory_claims WHERE status IN ('approved','rejected','withdrawn') AND decided_at<now()-interval '30 days' AND NOT retain_evidence AND (evidence IS NOT NULL OR evidence_path IS NOT NULL) ORDER BY decided_at LIMIT 100`
  );
  for (const claim of claims) {
    await db.transaction(async (tx) => {
      const locked = (
        await tx.execute(
          sql`SELECT evidence_path FROM directory_claims WHERE id=${claim.id}::uuid AND NOT retain_evidence AND status IN ('approved','rejected','withdrawn') AND decided_at<now()-interval '30 days' FOR UPDATE`
        )
      ).rows[0];
      if (!locked) return;
      if (locked.evidence_path) {
        const { error } = await getSupabaseAdminClient()
          .storage.from("directory-evidence")
          .remove([String(locked.evidence_path)]);
        if (error) return;
      }
      await tx.execute(
        sql`UPDATE directory_claims SET evidence=NULL,evidence_path=NULL WHERE id=${claim.id}::uuid`
      );
      cleaned++;
    });
  }
  // Unused uploads are not claim evidence. Only remove old objects with no reference from any claim.
  const orphaned = await rows(
    sql`SELECT name FROM storage.objects o WHERE bucket_id='directory-evidence' AND created_at<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM directory_claims c WHERE c.evidence_path=o.name) ORDER BY created_at LIMIT 100`
  );
  if (orphaned.length)
    await getSupabaseAdminClient()
      .storage.from("directory-evidence")
      .remove(orphaned.map((o) => String(o.name)));
  if (flag("communications")) await enqueueDigests();
  const deliveries = await processDeliveries();
  return {
    synchronized: synchronized.length,
    fetched,
    failed,
    evidenceDeleted: cleaned,
    ...deliveries,
  };
}
