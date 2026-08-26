import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  checkPwnedPassword,
  findPwnedCount,
  sha1Hex,
} from "@/lib/security/pwned-password";

// Known SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// Known SHA-1 of "password123" is CBFDAC6008F9CAB4083784CBD1874F76618D2A97
const SHA1_PASSWORD = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
const SHA1_PASSWORD123 = "CBFDAC6008F9CAB4083784CBD1874F76618D2A97";
const SHA1_RANDOM = "0123456789ABCDEF0123456789ABCDEF01234567";

describe("pwned-password (HIBP k-anonymity) helper", () => {
  describe("sha1Hex", () => {
<<<<<<< HEAD
    it("computes the canonical SHA-1 of 'password'", () => {
      expect(sha1Hex("password")).toBe(SHA1_PASSWORD);
    });

    it("computes the canonical SHA-1 of 'password123'", () => {
      expect(sha1Hex("password123")).toBe(SHA1_PASSWORD123);
    });

    it("returns 40 uppercase hex chars", () => {
      const hash = sha1Hex("anything");
=======
    it("computes the canonical SHA-1 of 'password'", async () => {
      expect(await sha1Hex("password")).toBe(SHA1_PASSWORD);
    });

    it("computes the canonical SHA-1 of 'password123'", async () => {
      expect(await sha1Hex("password123")).toBe(SHA1_PASSWORD123);
    });

    it("returns 40 uppercase hex chars", async () => {
      const hash = await sha1Hex("anything");
>>>>>>> origin/main
      expect(hash).toMatch(/^[0-9A-F]{40}$/);
    });
  });

  describe("findPwnedCount", () => {
    it("returns the count when the suffix matches", () => {
      const suffix = SHA1_PASSWORD.slice(5); // "61E4C9B93F3F0682250B6CF8331B7EE68FD8"
      const body = [
        "0000000000000000000000000000000000000000:1",
        `${suffix}:9647524`,
        "ABCDEF1234567890ABCDEF1234567890ABCDEF12:3",
      ].join("\r\n");
      expect(findPwnedCount(body, SHA1_PASSWORD)).toBe(9647524);
    });

    it("returns 0 when the suffix does not match", () => {
      const body = [
        "0000000000000000000000000000000000000000:1",
        "ABCDEF1234567890ABCDEF1234567890ABCDEF12:3",
      ].join("\n");
      expect(findPwnedCount(body, SHA1_PASSWORD)).toBe(0);
    });

    it("handles CRLF and LF line endings", () => {
      const suffix = SHA1_PASSWORD123.slice(5);
      const body = `0000000000000000000000000000000000000000:1\r\n${suffix}:10000\n`;
      expect(findPwnedCount(body, SHA1_PASSWORD123)).toBe(10000);
    });

    it("ignores empty lines and padding lines", () => {
      const suffix = SHA1_RANDOM.slice(5);
      const body = [
        "",
        "ADD-PADDING-IGNORE-ME:0",
        `${suffix}:7`,
        "  ",
      ].join("\n");
      expect(findPwnedCount(body, SHA1_RANDOM)).toBe(7);
    });

    it("returns 0 for malformed lines without crashing", () => {
      const body = ["no-colon-here", ":missing-suffix", "ABCDEF:NaN"].join("\n");
      expect(findPwnedCount(body, SHA1_PASSWORD)).toBe(0);
    });

    it("returns 0 for an empty body", () => {
      expect(findPwnedCount("", SHA1_PASSWORD)).toBe(0);
    });
  });

  describe("checkPwnedPassword", () => {
    let originalFetch: typeof fetch | undefined;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch as typeof fetch;
      vi.restoreAllMocks();
    });

    function mockFetch(body: string, status = 200): ReturnType<typeof vi.fn> {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(body),
      } as unknown as Response);
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    it("returns pwned=true with count when the suffix matches", async () => {
      const suffix = SHA1_PASSWORD.slice(5);
      mockFetch(`${suffix}:12345`);

      const result = await checkPwnedPassword("password", {
        fetchImpl: globalThis.fetch,
      });

      expect(result).toEqual({ pwned: true, count: 12345, unavailable: false });
    });

    it("returns pwned=false when the suffix is not in the response", async () => {
      mockFetch("0000000000000000000000000000000000000000:1");

      const result = await checkPwnedPassword("password", {
        fetchImpl: globalThis.fetch,
      });

      expect(result).toEqual({ pwned: false, count: 0, unavailable: false });
    });

    it("only sends the 5-char hash prefix (never the password)", async () => {
      const fetchMock = mockFetch("");

      await checkPwnedPassword("hunter2-secret-password", {
        fetchImpl: globalThis.fetch,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
      expect(calledUrl).toBe(`https://api.pwnedpasswords.com/range/${SHA1_HUNTER2_PREFIX}`);
      expect(calledUrl).not.toContain("hunter2");
      expect(calledUrl).not.toContain("hunter2-secret");
      expect(calledUrl).not.toContain("secret");
      // full 40-char SHA-1 must NOT leave the process
      expect(calledUrl).not.toContain(SHA1_HUNTER2_FULL);
    });

    it("fails open (unavailable=true) on network errors", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await checkPwnedPassword("anypassword", {
        fetchImpl: globalThis.fetch,
      });

      expect(result.unavailable).toBe(true);
      expect(result.pwned).toBe(false);
      expect(result.count).toBe(0);
    });

    it("fails open (unavailable=true) on 5xx responses by default", async () => {
      mockFetch("upstream error", 503);

      const result = await checkPwnedPassword("anypassword", {
        fetchImpl: globalThis.fetch,
      });

      expect(result.unavailable).toBe(true);
      expect(result.pwned).toBe(false);
    });

    it("throws on 5xx when failOpenOnHttpError=false", async () => {
      mockFetch("upstream error", 503);

      await expect(
        checkPwnedPassword("anypassword", {
          fetchImpl: globalThis.fetch,
          failOpenOnHttpError: false,
        })
      ).rejects.toThrow(/HTTP 503/);
    });

    it("returns pwned=false for an empty password without hitting the network", async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await checkPwnedPassword("", {
        fetchImpl: globalThis.fetch,
      });

      expect(result).toEqual({ pwned: false, count: 0, unavailable: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fails open when fetch is not available", async () => {
      const original = globalThis.fetch;
      // @ts-expect-error -- intentionally clear fetch
      delete (globalThis as { fetch?: typeof fetch }).fetch;
      try {
        const isolated = await checkPwnedPassword("password", { fetchImpl: undefined });
        expect(isolated.unavailable).toBe(true);
        expect(isolated.pwned).toBe(false);
      } finally {
        globalThis.fetch = original;
      }
    });
  });
});

// SHA-1 of "hunter2-secret-password" (precomputed for the leakage test)
const SHA1_HUNTER2_FULL = "BD1640E3CD6DB6A1C47B6E2C24C5C2E3DBD24F8C"; // not used; computed at runtime by the helper
// The helper computes the real SHA-1 at call time; we re-derive it for the URL assertion.
import { createHash } from "node:crypto";
function _sha1(s: string) {
  return createHash("sha1").update(s, "utf8").digest("hex").toUpperCase();
}
const SHA1_HUNTER2_PREFIX = _sha1("hunter2-secret-password").slice(0, 5);
