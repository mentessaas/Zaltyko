import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("academy-local date actions", () => {
  it("uses the academy country for quick payment cutoffs and due dates", () => {
    const source = read("src/components/dashboard/QuickPaymentModal.tsx");

    expect(source).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(source).toContain("formatShortDateForCountry(charge.dueDate, academyCountry)");
    expect(source).toContain("status=pending,overdue");
    expect(source).not.toContain('new Date().toISOString().split("T")[0]');
  });

  it("defaults quick sessions to the academy calendar", () => {
    const source = read("src/components/dashboard/QuickClassModal.tsx");

    expect(source).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(source).not.toContain('new Date().toISOString().split("T")[0]');
  });

  it("keeps extra-class start and end values as local calendar datetimes", () => {
    const source = read("src/components/athletes/CreateExtraClassDialog.tsx");

    expect(source).toContain("addDaysToCalendarDate");
    expect(source).toContain("const endDateTime = `${endDate}T${endClock}:00`");
    expect(source).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(source).not.toContain("endDate.toISOString()");
  });

  it("keeps charge dates stable in date inputs", () => {
    const source = read("src/components/billing/EditChargeDialog.tsx");

    expect(source).toContain('formatDateForCountry(charge.dueDate, academyCountry, "yyyy-MM-dd")');
    expect(source).not.toContain('new Date(charge.dueDate).toISOString().split("T")[0]');
  });

  it("uses the academy calendar for manual payment date limits", () => {
    const source = read("src/components/billing/RegisterPaymentDialog.tsx");

    expect(source).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(source).not.toContain('new Date().toISOString().split("T")[0]');
  });

  it("formats family-facing calendar dates without browser timezone shifts", () => {
    const calendar = read("src/components/my-dashboard/MyCalendarWidget.tsx");
    const assessments = read("src/components/my-dashboard/MyAssessmentsWidget.tsx");
    const payments = read("src/components/my-dashboard/MyPaymentsWidget.tsx");
    const attendance = read("src/components/my-dashboard/MyAttendanceWidget.tsx");

    expect(calendar).toContain("formatDateForCountry(day.date, academyCountry");
    expect(assessments).toContain("formatDateForCountry(assessment.assessmentDate, academyCountry");
    expect(payments).toContain("formatDateForCountry(dateStr, academyCountry");
    expect(attendance).toContain("formatDateForCountry(dateStr, academyCountry");
    expect(calendar).not.toContain("new Date(day.date).toLocaleDateString");
    expect(assessments).not.toContain("new Date(assessment.assessmentDate).toLocaleDateString");
  });

  it("keeps promotion dates and status decisions in the academy calendar", () => {
    const campaigns = read("src/components/billing/CampaignManager.tsx");
    const campaignList = read("src/components/billing/CampaignList.tsx");
    const scholarships = read("src/components/billing/ScholarshipList.tsx");
    const discounts = read("src/components/billing/DiscountList.tsx");

    expect(campaigns).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(campaignList).toContain("formatDateToISOString(new Date(), academyCountry)");
    expect(campaignList).toContain("formatDateForCountry(campaign.startDate, academyCountry");
    expect(scholarships).toContain("formatDateForCountry(scholarship.startDate, academyCountry");
    expect(discounts).toContain("formatDateForCountry(discount.startDate, academyCountry");
    expect(campaignList).not.toContain("new Date(campaign.startDate)");
    expect(scholarships).not.toContain("new Date(scholarship.startDate)");
  });

  it("keeps coach and athlete progress dates on calendar-day semantics", () => {
    const coach = read("src/components/coach/CoachDashboardPage.tsx");
    const progress = read("src/components/my-dashboard/MyProgressWidget.tsx");

    expect(coach).toContain("formatDateForCountry(assessment.assessmentDate, academyCountry");
    expect(progress).toContain("formatDateForCountry(latestAssessment.assessmentDate, academyCountry");
    expect(progress).toContain("parseCalendarDate(record.date)");
    expect(coach).not.toContain("new Date(assessment.assessmentDate).toLocaleDateString");
  });

  it("converts class date and time from the academy timezone", () => {
    const source = read("src/lib/dashboard/attention-bundle.ts");
    const ownerPanel = read("src/components/dashboard/OwnerAttentionPanel.tsx");
    const coachPanel = read("src/components/dashboard/CoachSimplePanel.tsx");
    const priority = read("src/lib/dashboard/attention-priority.ts");

    expect(source).toContain("fromZonedTime");
    expect(source).toContain("combineDateAndTime(r.sessionDate, r.startTime, academyTimezone)");
    expect(source).toContain("const academyTimezone = resolveAcademyTimezone");
    expect(ownerPanel).toContain("timeZone: academyTimezone");
    expect(coachPanel).toContain("timeZone: academyTimezone");
    expect(priority).toContain("bundle.academyTimezone");
    expect(source).not.toContain("date.setUTCHours(Number(match[1]), Number(match[2])");
  });
});
