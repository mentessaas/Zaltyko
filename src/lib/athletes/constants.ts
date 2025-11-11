export const athleteStatusOptions = ["active", "inactive", "injured", "suspended"] as const;

export type AthleteStatus = (typeof athleteStatusOptions)[number];


