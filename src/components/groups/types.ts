export interface CoachOption {
  id: string;
  name: string;
  email: string | null;
  sportConfigIds?: string[];
}

export interface AthleteOption {
  id: string;
  name: string;
  level: string | null;
  status: string;
}

export interface GroupSummary {
  id: string;
  academyId: string;
  name: string;
  discipline: string;
  sportConfigId?: string | null;
  programCode?: string | null;
  levelCode?: string | null;
  categoryCode?: string | null;
  level: string | null;
  technicalFocus?: string | null;
  apparatus?: string[];
  sessionBlocks?: string[];
  color: string | null;
  coachId: string | null;
  coachName: string | null;
  assistantIds: string[];
  assistantNames: string[];
  athleteCount: number;
  createdAt: string;
  monthlyFeeCents?: number | null; // Cuota mensual en céntimos
  billingItemId?: string | null; // Concepto de cobro asociado
}

export interface SportConfigOption {
  id: string;
  name: string;
  code: string;
  defaultAcademyType: string;
  defaultDisciplineVariant: string;
  disciplineName: string;
  branchName: string;
  terminology: Record<string, string>;
  apparatus: Array<{ code: string; name: string; shortName: string | null }>;
  programs: Array<{ code: string; name: string }>;
  levels: Array<{ code: string; name: string; programCode: string | null }>;
  categories: Array<{ code: string; name: string }>;
}

export interface GroupCoach extends CoachOption {}

export interface GroupMember {
  id: string;
  name: string;
  level: string | null;
  status: string;
}

export interface GroupDetail extends GroupSummary {
  coachEmail: string | null;
  assistants: GroupCoach[];
  members: GroupMember[];
  classes: GroupClassSummary[];
}

export interface GroupClassSummary {
  id: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  weekdays: number[];
  coachNames: string[];
  technicalFocus?: string | null;
  apparatus?: string[];
}
