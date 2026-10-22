export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface SessionWorkspaceApparatus {
  code: string;
  name: string;
}

export interface SessionWorkspaceAthlete {
  id: string;
  name: string;
  groupName: string | null;
  groupColor: string | null;
  sportConfigId: string | null;
  disciplineName: string;
  branchName: string;
  apparatus: SessionWorkspaceApparatus[];
}

export interface SessionWorkspaceAttendance {
  athleteId: string;
  status: AttendanceStatus;
  notes: string | null;
}

export interface SessionWorkspaceTerminology {
  athlete: string;
  athletes: string;
  apparatus: string;
  attendance: string;
}

export interface SessionWorkspaceSession {
  id: string;
  classId: string;
  className: string;
  sessionDate: string;
  formattedDate: string;
  formattedTime: string;
  groupName: string | null;
  groupColor: string | null;
  status: string;
  technicalFocus: string | null;
  apparatus: SessionWorkspaceApparatus[];
}
