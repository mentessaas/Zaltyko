import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import {
  FAMILY_NO_ACCESS_BODY,
  FAMILY_NO_ACCESS_TITLE,
} from "@/modules/family-portal/domain/family-portal-presentation";

/**
 * Neutral empty state. It never says whether the account, an email or a
 * family exists: an unlinked account and a revoked one look the same.
 */
export function FamilyNoAccess() {
  return (
    <section className={ownerUi.emptyState} aria-labelledby="family-no-access-title">
      <h2 id="family-no-access-title" className={ownerUi.cardTitle}>
        {FAMILY_NO_ACCESS_TITLE}
      </h2>
      <p className={`${ownerUi.muted} mt-3 max-w-md`}>{FAMILY_NO_ACCESS_BODY}</p>
    </section>
  );
}
