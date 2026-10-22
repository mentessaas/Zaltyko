import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSafeAuthNextPath } from "@/lib/auth/safe-next-path";
import {
  assertConsentProofMatchesSource,
  isValidConsentProof,
  isValidPolicyVersion,
} from "@/lib/consent/owner-consent";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeAuthNextPath(searchParams.get("next"));

  if (code) {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const legalConsentVersion = searchParams.get("legal_consent_version");
      const legalConsentProof = searchParams.get("legal_consent_proof");
      if (legalConsentVersion || legalConsentProof) {
        if (
          !isValidPolicyVersion(legalConsentVersion) ||
          !isValidConsentProof(legalConsentProof)
        ) {
          redirect("/auth/login?error=consent_invalid");
        }
        assertConsentProofMatchesSource("signup", legalConsentProof);
        const { error: consentError } = await supabase.auth.updateUser({
          data: {
            ...(searchParams.get("directory_account") === "1" &&
            /^\/(academias|events|directorio)\//.test(next)
              ? { directory_account: true }
              : {}),
            legal_consent_version: legalConsentVersion,
            legal_consent_proof: legalConsentProof,
          },
        });
        if (consentError) {
          redirect("/auth/login?error=consent_record_failed");
        }
      }
      redirect(next);
    }
  }

  redirect("/auth/login?error=callback_failed");
}
