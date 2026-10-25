import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ownerScope: vi.fn(),
  rateLimit: vi.fn(),
  getContacts: vi.fn(),
  updateContact: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: () => ({ limit: 30, window: 60 }),
  getVerifiedTenantRateLimitIdentifier: (
    _request: Request,
    organizationId: string
  ) => `verified:${organizationId}`,
  rateLimit: mocks.rateLimit,
  rateLimitExceededResponse: () =>
    new Response(JSON.stringify({ ok: false }), { status: 429 }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.ownerScope,
}));
vi.mock("@/modules/families/application/owner-guardian-contacts", () => ({
  getOwnerGuardianContacts: mocks.getContacts,
  normalizeOwnerGuardianContact: (kind: string, value: string) => ({
    success: kind === "email" ? value.includes("@") : value.startsWith("+"),
    ...(kind === "email" && value.includes("@")
      ? { value: value.trim().toLowerCase(), normalizedValue: value.trim().toLowerCase() }
      : {}),
  }),
  updateOwnerGuardianContact: mocks.updateContact,
}));

import {
  GET,
  PATCH,
} from "@/app/api/v1/owner/guardians/[guardianId]/contacts/route";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const guardianId = "10000000-0000-4000-8000-000000000003";
const userId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000005";
const contactId = "10000000-0000-4000-8000-000000000006";
const idempotencyKey = "owner-guardian-contact-001";
const updatedAt = "2026-10-25T09:30:00.123456Z";
const context = { params: Promise.resolve({ guardianId }) };
const body = {
  organizationId,
  locationId,
  kind: "email",
  expectedContactId: contactId,
  expectedValue: "old@example.test",
  expectedUpdatedAt: updatedAt,
  value: "New@example.test",
};

function getRequest(query = `organizationId=${organizationId}&locationId=${locationId}`) {
  return new Request(
    `https://sandbox.invalid/api/v1/owner/guardians/${guardianId}/contacts?${query}`
  );
}

function patchRequest(payload: unknown = body, key = idempotencyKey) {
  return new Request(
    `https://sandbox.invalid/api/v1/owner/guardians/${guardianId}/contacts`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: JSON.stringify(payload),
    }
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.ownerScope.mockResolvedValue({
    organization: { id: organizationId, name: "QA Academy" },
    member: { id: memberId, role: "owner", locationScopeMode: "all" },
  });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.getContacts.mockResolvedValue({
    guardianId,
    contacts: {
      email: {
        contactId,
        value: "old@example.test",
        verifiedAt: "2026-10-01T10:00:00.000000Z",
        updatedAt,
      },
      phone: null,
    },
  });
  mocks.updateContact.mockResolvedValue({
    guardianId,
    contacts: {
      email: {
        contactId,
        value: "new@example.test",
        verifiedAt: null,
        updatedAt,
      },
      phone: null,
    },
    replayed: false,
  });
});

describe("Owner guardian contacts HTTP boundary", () => {
  it("authenticates before parsing the selected contact", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await GET(getRequest(), context);

    expect(response.status).toBe(401);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.getContacts).not.toHaveBeenCalled();
  });

  it("returns only the canonical primary email and phone with a private no-store response", async () => {
    const response = await GET(getRequest(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getContacts).toHaveBeenCalledWith({
      organizationId,
      locationId,
      guardianId,
      actor: { userId, memberId },
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        guardianId,
        contacts: {
          email: { contactId, value: "old@example.test", updatedAt },
          phone: null,
        },
      },
    });
  });

  it("rejects extra scope parameters rather than widening the contact read", async () => {
    const response = await GET(
      getRequest(
        `organizationId=${organizationId}&locationId=${locationId}&allLocations=true`
      ),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.getContacts).not.toHaveBeenCalled();
  });

  it("derives the actor from the session and returns the replay receipt", async () => {
    mocks.updateContact.mockResolvedValueOnce({
      guardianId,
      contacts: { email: null, phone: null },
      replayed: true,
    });

    const response = await PATCH(patchRequest(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.updateContact).toHaveBeenCalledWith({
      ...body,
      guardianId,
      idempotencyKey,
      actor: { userId, memberId },
    });
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        guardianId,
        contacts: { email: null, phone: null },
        replayed: true,
      },
    });
  });

  it("rejects actor and role fields from the browser", async () => {
    const response = await PATCH(
      patchRequest({ ...body, actor: { userId, memberId }, role: "owner" }),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.ownerScope).not.toHaveBeenCalled();
    expect(mocks.updateContact).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before invoking the command", async () => {
    const response = await PATCH(patchRequest(body, ""), context);

    expect(response.status).toBe(400);
    expect(mocks.updateContact).not.toHaveBeenCalled();
  });

  it("keeps scope denials from the server authorization layer", async () => {
    mocks.ownerScope.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sede denegada", 403)
    );

    const response = await PATCH(patchRequest(), context);

    expect(response.status).toBe(403);
    expect(mocks.updateContact).not.toHaveBeenCalled();
  });
});
