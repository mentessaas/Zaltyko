"use client";

import { useRouter } from "next/navigation";

import { CreateAthleteDialog } from "@/components/athletes/CreateAthleteDialog";
import type { SportConfigOption } from "@/components/groups/types";
import type { GroupOption } from "@/types";

interface NewAthletePageClientProps {
  academyId: string;
  groups: GroupOption[];
  sportConfigs: SportConfigOption[];
}

export function NewAthletePageClient({
  academyId,
  groups,
  sportConfigs,
}: NewAthletePageClientProps) {
  const router = useRouter();
  const athletesPath = `/app/${academyId}/athletes`;

  const returnToAthletes = () => {
    router.push(athletesPath);
    router.refresh();
  };

  return (
    <div className="min-h-[50vh]">
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
