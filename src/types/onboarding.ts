export type StepKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface StepDefinition {
  id: StepKey;
  label: string;
}

export interface CoachInput {
  name: string;
  email: string;
}

export interface AthleteInput {
  name: string;
}

export interface OnboardingFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  academyName: string;
  academyType: string;
  selectedCountry: string;
  selectedRegion: string;
  selectedCity: string;
  selectedDisciplines: string[];
  structureGroups: string[];
  groupName: string;
  groupDiscipline: string;
  groupLevel: string;
  groupWeekday: string;
  groupStartTime: string;
  groupEndTime: string;
  coaches: CoachInput[];
  athletes: AthleteInput[];
}

