import { describe, expect, it } from "vitest";

import { getRequiredRoutePermission } from "@/lib/authz/route-permissions";

describe("getRequiredRoutePermission", () => {
  describe("account-scoped onboarding (no academy context yet)", () => {
    it("returns null for GET /api/academies (discovery)", () => {
      expect(getRequiredRoutePermission("/api/academies", "GET")).toBeNull();
    });

    it("returns null for POST /api/academies (signup)", () => {
      expect(getRequiredRoutePermission("/api/academies", "POST")).toBeNull();
    });

    it("still requires settings:write for PUT /api/academies (rare but routed)", () => {
      // PUT no está en la lista de métodos account-scoped, debe caer a la tabla
      expect(getRequiredRoutePermission("/api/academies", "PUT")).toBe(
        "settings:write"
      );
    });

    it("requires settings:write for /api/academies/[id] sub-resources", () => {
      expect(
        getRequiredRoutePermission("/api/academies/abc-123", "GET")
      ).toBe("settings:read");
      expect(
        getRequiredRoutePermission("/api/academies/abc-123/settings", "PATCH")
      ).toBe("settings:write");
    });
  });

  describe("family-conversation (cross-module override)", () => {
    it.each([
      ["/api/athletes/at-123/family-conversation", "POST"],
      ["/api/athletes/at-123/family-conversation", "GET"],
      ["/api/groups/gr-456/family-conversation", "POST"],
      ["/api/groups/gr-456/family-conversation", "GET"],
    ])(
      "forces communications:send for %s %s (regardless of default module)",
      (pathname, method) => {
        expect(getRequiredRoutePermission(pathname, method)).toBe(
          "communications:send"
        );
      }
    );

    it("does NOT match unrelated suffix family-conversation-like", () => {
      // El regex requiere el segmento exacto, no debe capturar falsos positivos
      expect(
        getRequiredRoutePermission(
          "/api/athletes/at-123/not-family-conversation",
          "GET"
        )
      ).toBe("athletes:read");
    });

    it("does NOT match when path is deeper than expected", () => {
      expect(
        getRequiredRoutePermission(
          "/api/athletes/at-123/family-conversation/extra",
          "GET"
        )
      ).toBe("athletes:read");
    });
  });

  describe("academies announcements (exact-segment regex)", () => {
    it("returns communications:read for GET on announcements index", () => {
      expect(
        getRequiredRoutePermission(
          "/api/academies/ac-1/announcements",
          "GET"
        )
      ).toBe("communications:read");
    });

    it("returns communications:send for POST on announcements index", () => {
      expect(
        getRequiredRoutePermission(
          "/api/academies/ac-1/announcements",
          "POST"
        )
      ).toBe("communications:send");
    });

    it("returns communications:send for nested announcement resource", () => {
      expect(
        getRequiredRoutePermission(
          "/api/academies/ac-1/announcements/ann-99",
          "PATCH"
        )
      ).toBe("communications:send");
    });

    it("does NOT match /api/announcements (different prefix)", () => {
      // /api/announcements (no academy) debe caer a la tabla general
      expect(getRequiredRoutePermission("/api/announcements", "GET")).toBe(
        "communications:read"
      );
    });
  });

  describe("class generation/recurring shortcuts", () => {
    it.each([
      "/api/classes/cl-1/generate-sessions",
      "/api/classes/cl-1/recurring-settings",
    ])("POST to %s requires classes:schedule", (pathname) => {
      expect(getRequiredRoutePermission(pathname, "POST")).toBe(
        "classes:schedule"
      );
    });

    it("recurring-settings also matches when nested deeper", () => {
      expect(
        getRequiredRoutePermission(
          "/api/classes/cl-1/recurring-settings/something",
          "POST"
        )
      ).toBe("classes:schedule");
    });

    it("returns default class permission for non-matching methods", () => {
      // GET /api/classes/cl-1/generate-sessions no está cubierto por el shortcut
      expect(
        getRequiredRoutePermission("/api/classes/cl-1/generate-sessions", "GET")
      ).toBe("classes:read");
    });
  });

  describe("communication templates override", () => {
    it("returns communications:read for GET templates", () => {
      expect(
        getRequiredRoutePermission("/api/communication/templates", "GET")
      ).toBe("communications:read");
    });

    it("returns communications:templates for write methods", () => {
      expect(
        getRequiredRoutePermission("/api/communication/templates", "POST")
      ).toBe("communications:templates");
      expect(
        getRequiredRoutePermission("/api/communication/templates", "PATCH")
      ).toBe("communications:templates");
      expect(
        getRequiredRoutePermission("/api/communication/templates", "DELETE")
      ).toBe("communications:templates");
    });
  });

  describe("charges sub-routes", () => {
    it("refund endpoint requires billing:payments", () => {
      expect(
        getRequiredRoutePermission("/api/charges/ch-1/refund", "POST")
      ).toBe("billing:payments");
    });

    it("remind endpoint requires billing:update", () => {
      expect(
        getRequiredRoutePermission("/api/charges/ch-1/remind", "POST")
      ).toBe("billing:update");
    });

    it("GET on charges/[id] still falls back to charges table rule", () => {
      expect(getRequiredRoutePermission("/api/charges/ch-1", "GET")).toBe(
        "billing:read"
      );
    });

    it("refund only matches the exact two-segment pattern", () => {
      expect(
        getRequiredRoutePermission("/api/charges/ch-1/refund/audit", "GET")
      ).toBe("billing:read");
    });
  });

  describe("financial metrics sub-route", () => {
    it("returns billing:reports for financial-metrics GET", () => {
      expect(
        getRequiredRoutePermission(
          "/api/dashboard/ac-1/financial-metrics",
          "GET"
        )
      ).toBe("billing:reports");
    });

    it("REGRESIÓN: /api/dashboard/kpi-trends no cae al wrong literal-id (2026-07-08)", () => {
      // El bug original: extractAcademyId tomaba "kpi-trends" como academyId.
      // Aquí verificamos que el match correct para una ruta dashboard estática
      // (no academy-scoped) sigue siendo reports:read, NO billing:reports.
      expect(
        getRequiredRoutePermission("/api/dashboard/kpi-trends", "GET")
      ).toBe("reports:read");
    });

    it("financial-metrics shortcut is GET-only (writes fall through to null)", () => {
      // Fix: el override antes aplicaba a cualquier método, lo que pedía
      // billing:reports (read-only por convención) para POST/PUT/DELETE.
      // Ahora solo GET lo activa; el resto cae al comportamiento default
      // (null, sin check de permisos en authz.ts).
      expect(
        getRequiredRoutePermission(
          "/api/dashboard/ac-1/financial-metrics",
          "POST"
        )
      ).toBeNull();
      expect(
        getRequiredRoutePermission(
          "/api/dashboard/ac-1/financial-metrics",
          "DELETE"
        )
      ).toBeNull();
      expect(
        getRequiredRoutePermission(
          "/api/dashboard/ac-1/financial-metrics",
          "PUT"
        )
      ).toBeNull();
    });

    it("financial-metrics GET still works after the fix", () => {
      expect(
        getRequiredRoutePermission(
          "/api/dashboard/ac-1/financial-metrics",
          "GET"
        )
      ).toBe("billing:reports");
    });
  });

  describe("notifications and reports export", () => {
    it("requires communications:send for /api/notifications/send", () => {
      expect(
        getRequiredRoutePermission("/api/notifications/send", "POST")
      ).toBe("communications:send");
    });

    it("requires reports:export for report export endpoints", () => {
      expect(
        getRequiredRoutePermission("/api/reports/financial/export", "GET")
      ).toBe("reports:export");
    });

    it("does NOT match reports export when path has more segments", () => {
      // "/api/reports/x/export/y" no termina en /export, debe caer al default
      expect(
        getRequiredRoutePermission("/api/reports/x/export/y", "GET")
      ).toBe("reports:read");
    });
  });

  describe("academy settings & roles", () => {
    it("settings endpoint distinguishes GET (read) vs writes (write)", () => {
      expect(
        getRequiredRoutePermission("/api/academies/ac-1/settings", "GET")
      ).toBe("settings:read");
      expect(
        getRequiredRoutePermission("/api/academies/ac-1/settings", "PATCH")
      ).toBe("settings:write");
      expect(
        getRequiredRoutePermission("/api/academies/ac-1/settings", "PUT")
      ).toBe("settings:write");
      expect(
        getRequiredRoutePermission("/api/academies/ac-1/settings", "DELETE")
      ).toBe("settings:write");
    });

    it("roles endpoint requires settings:users (any method)", () => {
      expect(
        getRequiredRoutePermission("/api/academies/ac-1/roles", "GET")
      ).toBe("settings:users");
      expect(
        getRequiredRoutePermission("/api/academies/ac-1/roles/role-1", "PATCH")
      ).toBe("settings:users");
      expect(
        getRequiredRoutePermission(
          "/api/academies/ac-1/roles/role-1/members",
          "POST"
        )
      ).toBe("settings:users");
    });
  });

  describe("ROUTE_PERMISSIONS table", () => {
    it("athletes: read/create/update/delete mapping", () => {
      expect(getRequiredRoutePermission("/api/athletes", "GET")).toBe(
        "athletes:read"
      );
      expect(getRequiredRoutePermission("/api/athletes", "POST")).toBe(
        "athletes:create"
      );
      expect(getRequiredRoutePermission("/api/athletes/at-1", "PATCH")).toBe(
        "athletes:update"
      );
      expect(getRequiredRoutePermission("/api/athletes/at-1", "DELETE")).toBe(
        "athletes:delete"
      );
    });

    it("classes: full CRUD + schedule", () => {
      expect(getRequiredRoutePermission("/api/classes", "GET")).toBe(
        "classes:read"
      );
      expect(getRequiredRoutePermission("/api/classes", "POST")).toBe(
        "classes:create"
      );
      expect(getRequiredRoutePermission("/api/classes/cl-1", "PATCH")).toBe(
        "classes:update"
      );
      expect(getRequiredRoutePermission("/api/classes/cl-1", "DELETE")).toBe(
        "classes:delete"
      );
    });

    it("class-sessions requires classes:schedule for writes", () => {
      expect(getRequiredRoutePermission("/api/class-sessions", "GET")).toBe(
        "classes:read"
      );
      expect(getRequiredRoutePermission("/api/class-sessions", "POST")).toBe(
        "classes:schedule"
      );
      expect(
        getRequiredRoutePermission("/api/class-sessions/sess-1", "PATCH")
      ).toBe("classes:schedule");
      expect(
        getRequiredRoutePermission("/api/class-sessions/sess-1", "DELETE")
      ).toBe("classes:schedule");
    });

    it("class-enrollments and class-waiting-list share the same matrix", () => {
      const paths = ["/api/class-enrollments", "/api/class-waiting-list"];
      for (const path of paths) {
        expect(getRequiredRoutePermission(path, "GET")).toBe("classes:read");
        expect(getRequiredRoutePermission(path, "POST")).toBe(
          "classes:schedule"
        );
        expect(
          getRequiredRoutePermission(`${path}/x-1`, "PATCH")
        ).toBe("classes:schedule");
      }
    });

    it("groups: same CRUD shape as classes", () => {
      expect(getRequiredRoutePermission("/api/groups", "GET")).toBe(
        "classes:read"
      );
      expect(getRequiredRoutePermission("/api/groups", "POST")).toBe(
        "classes:create"
      );
      expect(getRequiredRoutePermission("/api/groups/gr-1", "DELETE")).toBe(
        "classes:delete"
      );
    });

    it("attendance: read + schedule only (no update/delete)", () => {
      expect(getRequiredRoutePermission("/api/attendance", "GET")).toBe(
        "classes:read"
      );
      expect(getRequiredRoutePermission("/api/attendance", "POST")).toBe(
        "classes:schedule"
      );
      expect(getRequiredRoutePermission("/api/attendance/att-1", "PATCH")).toBe(
        "classes:schedule"
      );
    });

    it("academy-diagnostics and audit-logs: settings read/write", () => {
      for (const path of ["/api/academy-diagnostics", "/api/audit-logs"]) {
        expect(getRequiredRoutePermission(path, "GET")).toBe("settings:read");
        expect(getRequiredRoutePermission(path, "POST")).toBe("settings:write");
      }
    });

    it("academy-expenses and coach-compensation: billing matrix", () => {
      for (const path of ["/api/academy-expenses", "/api/coach-compensation"]) {
        expect(getRequiredRoutePermission(path, "GET")).toBe("billing:read");
        expect(getRequiredRoutePermission(path, "POST")).toBe(
          "billing:update"
        );
        expect(getRequiredRoutePermission(path, "PATCH")).toBe(
          "billing:update"
        );
        expect(getRequiredRoutePermission(path, "DELETE")).toBe(
          "billing:update"
        );
      }
    });

    it("assessments: athletes read, but only update (no create) for writes", () => {
      expect(getRequiredRoutePermission("/api/assessments", "GET")).toBe(
        "athletes:read"
      );
      expect(getRequiredRoutePermission("/api/assessments", "POST")).toBe(
        "athletes:update"
      );
      expect(getRequiredRoutePermission("/api/assessments/as-1", "PATCH")).toBe(
        "athletes:update"
      );
    });

    it("coaches: full CRUD", () => {
      expect(getRequiredRoutePermission("/api/coaches", "GET")).toBe(
        "coaches:read"
      );
      expect(getRequiredRoutePermission("/api/coaches", "POST")).toBe(
        "coaches:create"
      );
      expect(getRequiredRoutePermission("/api/coaches/co-1", "DELETE")).toBe(
        "coaches:delete"
      );
    });

    it("billing: unified read/write", () => {
      expect(getRequiredRoutePermission("/api/billing", "GET")).toBe(
        "billing:read"
      );
      expect(getRequiredRoutePermission("/api/billing", "POST")).toBe(
        "billing:update"
      );
      expect(getRequiredRoutePermission("/api/billing/b-1", "PATCH")).toBe(
        "billing:update"
      );
    });

    it("charges/billing-items/receipts/scholarships/discounts: billing:create on POST", () => {
      for (const path of [
        "/api/charges",
        "/api/billing-items",
        "/api/receipts",
        "/api/scholarships",
        "/api/discounts",
      ]) {
        expect(getRequiredRoutePermission(path, "GET")).toBe("billing:read");
        expect(getRequiredRoutePermission(path, "POST")).toBe(
          "billing:create"
        );
        expect(getRequiredRoutePermission(path, "PATCH")).toBe(
          "billing:update"
        );
      }
    });

    it("transactions: read + payments only", () => {
      expect(getRequiredRoutePermission("/api/transactions", "GET")).toBe(
        "billing:read"
      );
      expect(getRequiredRoutePermission("/api/transactions", "POST")).toBe(
        "billing:payments"
      );
    });

    it("payments and quick-actions/record-payment: standard billing matrix", () => {
      for (const path of ["/api/payments", "/api/quick-actions/record-payment"]) {
        expect(getRequiredRoutePermission(path, "GET")).toBe("billing:read");
        expect(getRequiredRoutePermission(path, "POST")).toBe(
          "billing:update"
        );
      }
    });

    it("reports: read/create (no update/delete)", () => {
      expect(getRequiredRoutePermission("/api/reports", "GET")).toBe(
        "reports:read"
      );
      expect(getRequiredRoutePermission("/api/reports", "POST")).toBe(
        "reports:create"
      );
    });

    it("dashboard: reports:read only (GET)", () => {
      expect(getRequiredRoutePermission("/api/dashboard", "GET")).toBe(
        "reports:read"
      );
      expect(getRequiredRoutePermission("/api/dashboard", "POST")).toBeNull();
    });

    it("analytics: read + create", () => {
      expect(getRequiredRoutePermission("/api/analytics", "GET")).toBe(
        "reports:read"
      );
      expect(getRequiredRoutePermission("/api/analytics", "POST")).toBe(
        "reports:create"
      );
    });

    it("events: full CRUD", () => {
      expect(getRequiredRoutePermission("/api/events", "GET")).toBe(
        "events:read"
      );
      expect(getRequiredRoutePermission("/api/events", "POST")).toBe(
        "events:create"
      );
      expect(getRequiredRoutePermission("/api/events/ev-1", "DELETE")).toBe(
        "events:delete"
      );
    });

    it("communication: read / send, templates on DELETE", () => {
      expect(getRequiredRoutePermission("/api/communication", "GET")).toBe(
        "communications:read"
      );
      expect(getRequiredRoutePermission("/api/communication", "POST")).toBe(
        "communications:send"
      );
      expect(getRequiredRoutePermission("/api/communication", "DELETE")).toBe(
        "communications:templates"
      );
    });

    it("contact-messages: read / send (no templates)", () => {
      expect(getRequiredRoutePermission("/api/contact-messages", "GET")).toBe(
        "communications:read"
      );
      expect(
        getRequiredRoutePermission("/api/contact-messages", "POST")
      ).toBe("communications:send");
      // Diferencia clave con /api/communication: DELETE aquí es send, no templates
      expect(
        getRequiredRoutePermission("/api/contact-messages", "DELETE")
      ).toBe("communications:send");
    });

    it("messages: read / send (no PUT, no templates)", () => {
      expect(getRequiredRoutePermission("/api/messages", "GET")).toBe(
        "communications:read"
      );
      expect(getRequiredRoutePermission("/api/messages", "POST")).toBe(
        "communications:send"
      );
      // PUT no está mapeado → null
      expect(getRequiredRoutePermission("/api/messages", "PUT")).toBeNull();
    });

    it("announcements: read / send (no PUT)", () => {
      expect(getRequiredRoutePermission("/api/announcements", "GET")).toBe(
        "communications:read"
      );
      expect(getRequiredRoutePermission("/api/announcements", "POST")).toBe(
        "communications:send"
      );
      expect(getRequiredRoutePermission("/api/announcements", "PUT")).toBeNull();
    });

    it("invitations: settings:users (GET/POST only)", () => {
      expect(getRequiredRoutePermission("/api/invitations", "GET")).toBe(
        "settings:users"
      );
      expect(getRequiredRoutePermission("/api/invitations", "POST")).toBe(
        "settings:users"
      );
      expect(getRequiredRoutePermission("/api/invitations", "PATCH")).toBeNull();
    });

    it("link-requests: settings:users (GET/POST/PATCH)", () => {
      expect(getRequiredRoutePermission("/api/link-requests", "GET")).toBe(
        "settings:users"
      );
      expect(getRequiredRoutePermission("/api/link-requests", "POST")).toBe(
        "settings:users"
      );
      expect(getRequiredRoutePermission("/api/link-requests", "PATCH")).toBe(
        "settings:users"
      );
    });

    it("licenses: athletes:read / update", () => {
      expect(getRequiredRoutePermission("/api/licenses", "GET")).toBe(
        "athletes:read"
      );
      expect(getRequiredRoutePermission("/api/licenses", "POST")).toBe(
        "athletes:update"
      );
    });

    it("competition-results: athletes:read / update", () => {
      expect(getRequiredRoutePermission("/api/competition-results", "GET")).toBe(
        "athletes:read"
      );
      expect(
        getRequiredRoutePermission("/api/competition-results", "POST")
      ).toBe("athletes:update");
    });

    it("upload: athletes:update only for POST", () => {
      expect(getRequiredRoutePermission("/api/upload", "POST")).toBe(
        "athletes:update"
      );
      expect(getRequiredRoutePermission("/api/upload", "GET")).toBeNull();
    });

    it("whatsapp: read / send", () => {
      expect(getRequiredRoutePermission("/api/whatsapp", "GET")).toBe(
        "communications:read"
      );
      expect(getRequiredRoutePermission("/api/whatsapp", "POST")).toBe(
        "communications:send"
      );
    });

    it("academy-memberships: DELETE only (settings:users)", () => {
      expect(getRequiredRoutePermission("/api/academy-memberships", "GET")).toBeNull();
      expect(getRequiredRoutePermission(
        "/api/academy-memberships/m-1",
        "DELETE"
      )).toBe("settings:users");
    });
  });

  describe("method normalization", () => {
    it("normalizes lowercase method to uppercase", () => {
      expect(getRequiredRoutePermission("/api/athletes", "get")).toBe(
        "athletes:read"
      );
      expect(getRequiredRoutePermission("/api/athletes", "post")).toBe(
        "athletes:create"
      );
    });

    it("normalizes mixed case", () => {
      expect(getRequiredRoutePermission("/api/athletes", "PaTcH")).toBe(
        "athletes:update"
      );
    });
  });

  describe("edge cases", () => {
    it("returns null for an unknown route", () => {
      expect(getRequiredRoutePermission("/api/unknown", "GET")).toBeNull();
    });

    it("returns null for a known route with an unmapped method", () => {
      // /api/athletes no tiene HEAD mapeado
      expect(getRequiredRoutePermission("/api/athletes", "HEAD")).toBeNull();
    });

    it("returns null for OPTIONS (CORS preflight)", () => {
      expect(getRequiredRoutePermission("/api/athletes", "OPTIONS")).toBeNull();
    });

    it("does NOT match prefix by substring (no false positives)", () => {
      // /api/athletes-archive empieza con /api/athletes-archive, NO /api/athletes
      expect(
        getRequiredRoutePermission("/api/athletes-archive", "GET")
      ).toBeNull();
    });

    it("matches prefix when followed by /", () => {
      expect(
        getRequiredRoutePermission("/api/athletes/at-1/classes", "GET")
      ).toBe("athletes:read");
    });

    it("matches prefix on exact equality", () => {
      expect(getRequiredRoutePermission("/api/athletes", "GET")).toBe(
        "athletes:read"
      );
    });

    it("does NOT match a different prefix that happens to share a substring", () => {
      // /api/athletes-old no debe caer a /api/athletes
      expect(
        getRequiredRoutePermission("/api/athletes-old", "GET")
      ).toBeNull();
    });
  });

  describe("regression: detected bugs from recent changelog", () => {
    it("2026-07-08 kpi-trends: returns reports:read, not billing:reports", () => {
      // El bug era a nivel de extractAcademyId, pero aquí verificamos que el
      // permission lookup no confunde el segmento "kpi-trends" con un academyId
      // semánticamente ambiguo. /api/dashboard/kpi-trends NO debe caer al
      // shortcut billing:reports (que requiere /api/dashboard/[academyId]/financial-metrics).
      expect(
        getRequiredRoutePermission("/api/dashboard/kpi-trends", "GET")
      ).toBe("reports:read");
    });

    it("financial-metrics regex requires exactly 2 segments after /api/dashboard", () => {
      // /api/dashboard/financial-metrics (1 seg) NO debe matchear
      expect(
        getRequiredRoutePermission("/api/dashboard/financial-metrics", "GET")
      ).toBe("reports:read");
    });
  });
});
