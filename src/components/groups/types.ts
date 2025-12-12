export interface CoachOption {
  id: string;
  name: string;
  email: string | null;
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
  level: string | null;
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
}
