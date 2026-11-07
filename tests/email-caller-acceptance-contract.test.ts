import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

// Callers that may ignore the sender result because they never claim delivery
// to the user, never persist a "sent" marker and never emit a success event.
const ACCESSORY_CALLERS: Record<string, string> = {
  "src/app/api/contact/route.ts": "persists the request first; success means stored, not emailed",
  "src/app/api/link-requests/route.ts": "link request is created; the email is a courtesy notice",
  "src/app/api/super-admin/users/[profileId]/route.ts": "plan-change notice after the change is applied",
  "src/app/api/profile/adjust-plan-limits/route.ts": "notice after limits are applied",
  "src/lib/alerts/attendance/createAttendanceNotifications.ts": "best-effort alert",
  "src/lib/billing/trial-service.ts": "best-effort trial notice",
  "src/lib/stripe/notification-service.ts": "best-effort billing notice",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("email sender result is never presented as delivery when not accepted", () => {
  it("binds the sender result everywhere except documented accessory notices", () => {
    const unbound: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const path = relative(process.cwd(), file);
      if (path === "src/lib/email/email-service.ts") continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (!/\bsendEmailWithLogging\(/.test(line) || /function sendEmailWithLogging|import /.test(line)) return;
          const bound = /(?:=|return)\s*(?:await\s+)?sendEmailWithLogging\(/.test(line);
          if (!bound && !ACCESSORY_CALLERS[path]) unbound.push(`${path}:${index + 1}`);
        });
    }
    expect(unbound).toEqual([]);
  });

  it("public contact forms report a non-delivered message instead of success", () => {
    for (const path of [
      "src/app/api/public/events/[id]/contact/route.ts",
      "src/app/api/public/academies/[id]/contact/route.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("const delivered = await sendEmailWithLogging(");
      const guard = source.indexOf("if (!delivered)");
      expect(guard, path).toBeGreaterThan(0);
      expect(source.indexOf('"CONTACT_NOT_DELIVERED"', guard), path).toBeGreaterThan(guard);
      expect(source.indexOf("status: 503", guard), path).toBeGreaterThan(guard);
      expect(source.indexOf("success: true"), path).toBeGreaterThan(guard);
    }
  });

  it("athlete magic-link invitations never record sentAt or success for an unsent email", () => {
    const source = read("src/lib/athletes/magic-link-invite-service.ts");
    expect(source).toContain("sentAt: null,");
    const notAccepted = source.indexOf('throw new Error("EMAIL_NOT_ACCEPTED")');
    expect(notAccepted).toBeGreaterThan(0);
    expect(source.indexOf('trackEvent("first_athlete_invited"')).toBeGreaterThan(notAccepted);
    expect(source.indexOf(".set({ sentAt: now, updatedAt: now })")).toBeGreaterThan(notAccepted);
    expect(source).toContain('reason: notSent ? "EMAIL_NOT_SENT" : "INTERNAL_ERROR"');
  });

  it("staff and admin invitations expose whether the email was accepted", () => {
    expect(read("src/app/api/invitations/route.ts")).toContain("emailSent = await sendEmailWithLogging(");
    expect(read("src/app/api/invitations/route.ts")).not.toContain("emailSent = true;");

    const adminUsers = read("src/app/api/admin/users/route.ts");
    expect(adminUsers).toContain("emailSent = await sendEmailWithLogging(");
    expect(adminUsers).toContain("apiSuccess({ ok: true, emailSent })");
    const inviteForm = read("src/components/admin/InviteUserForm.tsx");
    expect(inviteForm).toContain("payload?.data?.emailSent !== false");
    expect(inviteForm).toContain("Invitación guardada sin correo");

    const activation = read("src/app/api/super-admin/athletes/activate-access/route.ts");
    expect(activation).toContain("emailSent = await sendEmailWithLogging(");
    expect(activation).toContain("emailSent: result.emailSent ?? null");
  });

  it("direct notification and support messages do not report a skipped send as sent", () => {
    expect(read("src/app/api/notifications/send/route.ts")).toContain("apiSuccess({ ok: accepted, sent: accepted })");

    const supportMessage = read("src/app/api/super-admin/users/[profileId]/send-message/route.ts");
    const guard = supportMessage.indexOf('"EMAIL_NOT_SENT"');
    expect(guard).toBeGreaterThan(0);
    expect(supportMessage.indexOf("Correo enviado correctamente")).toBeGreaterThan(guard);
  });
});
