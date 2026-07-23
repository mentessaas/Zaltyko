import { describe, expect, it } from "vitest";

import { extractVerifiedAcademyCandidate } from "@/lib/authz/endpoint-config";

describe("academy authorization context", () => {
  it("reads academyId from a cloned JSON body without consuming the handler body", async () => {
    const request = new Request("http://localhost/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ academyId: "academy-a", email: "user@example.com" }),
    });

    await expect(extractVerifiedAcademyCandidate(request)).resolves.toEqual({
      academyId: "academy-a",
      conflict: false,
    });
    await expect(request.json()).resolves.toMatchObject({ academyId: "academy-a" });
  });

  it("rejects conflicting path, query, body, or header academy identifiers", async () => {
    const request = new Request(
      "http://localhost/api/academies/academy-a/settings?academyId=academy-a",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-academy-id": "academy-b",
        },
        body: JSON.stringify({ academyId: "academy-a" }),
      }
    );

    await expect(
      extractVerifiedAcademyCandidate(request, {
        params: { academyId: "academy-a" },
      })
    ).resolves.toEqual({ academyId: "academy-a", conflict: true });
  });
});
