"use client";

import { useRouter } from "next/navigation";

import { CreateAthleteDialog } from "@/components/athletes/CreateAthleteDialog";
import type { SportConfigOption } from "@/components/groups/types";
import type { GroupOption } from "@/types";

interface NewAthletePageClientProps {
  academyId: string;
  groups: GroupOption[];
  sportConfigs: SportConfigOption[];
  conversionTrialId?: string;
}

export function NewAthletePageClient({
  academyId,
  groups,
  sportConfigs,
  conversionTrialId,
}: NewAthletePageClientProps) {
  const router = useRouter();
  const athletesPath = `/app/${academyId}/athletes`;

  const returnToAthletes = () => {
    router.push(athletesPath);
    router.refresh();
  };

  return (
    <div className="min-h-[50vh]">
      {conversionTrialId ? (
        <div className="mb-4 rounded-xl border border-zaltyko-teal/30 bg-zaltyko-teal/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
          Conversión desde la prueba <span className="font-mono text-xs">{conversionTrialId}</span>. Completa los datos del atleta y del tutor para finalizar el alta.
        </div>
      ) : null}
      <CreateAthleteDialog
        academyId={academyId}
        open
        onClose={returnToAthletes}
        onCreated={returnToAthletes}
        groups={groups}
        sportConfigs={sportConfigs}
      />
    </div>
  );
}
