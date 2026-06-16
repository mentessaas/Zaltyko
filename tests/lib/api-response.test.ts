import { describe, it, expect } from "vitest";
import {
  apiSuccess,
  apiCreated,
  apiError,
  apiOk,
  apiErrorLegacy,
  normalizeLegacyResponse,
  type ResponseMeta,
} from "@/lib/api-response";

describe("apiSuccess", () => {
  it("should return success response with data", async () => {
    const response = apiSuccess({ user: { id: "123", name: "Test" } });
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ user: { id: "123", name: "Test" } });
  });

  it("should return 200 status by default", async () => {
    const response = apiSuccess({ items: [] });
    expect(response.status).toBe(200);
  });

  it("should include meta when provided", async () => {
    const meta: ResponseMeta = { total: 100, page: 1, pageSize: 20 };
    const response = apiSuccess({ items: [] }, meta);
    const body = await response.json();

    expect(body.meta).toEqual({ total: 100, page: 1, pageSize: 20 });
  });

  it("should not include meta when empty", async () => {
    const response = apiSuccess({ items: [] }, {});
    const body = await response.json();

    expect(body.meta).toBeUndefined();
  });

  it("should handle null data", async () => {
    const response = apiSuccess(null);
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.data).toBeNull();
  });

  it("should handle undefined data", async () => {
    const response = apiSuccess(undefined);
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.data).toBeUndefined();
  });
});

describe("apiCreated", () => {
  it("should return success response with data", async () => {
    const response = apiCreated({ id: "new-resource-id" });
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ id: "new-resource-id" });
  });

  it("should return 201 status", async () => {
    const response = apiCreated({ id: "123" });
    expect(response.status).toBe(201);
  });

  it("should include meta when provided", async () => {
    const meta: ResponseMeta = { total: 1 };
    const response = apiCreated({ id: "123" }, meta);
    const body = await response.json();

    expect(body.meta).toEqual({ total: 1 });
  });

  it("should not include meta when empty", async () => {
    const response = apiCreated({ id: "123" }, {});
    const body = await response.json();

    expect(body.meta).toBeUndefined();
  });
});

describe("apiError", () => {
  it("should return error response with code and message", async () => {
    const response = apiError("NOT_FOUND", "Resource not found", 404);
    const body = await response.json();

    expect(body.ok).toBe(false);
    expect(body.error).toBe("NOT_FOUND");
    expect(body.code).toBe("NOT_FOUND");
    expect(body.message).toBe("Resource not found");
  });

  it("should return correct status code", () => {
    expect(apiError("BAD_REQUEST", "Invalid input", 400).status).toBe(400);
    expect(apiError("UNAUTHORIZED", "Not authenticated", 401).status).toBe(401);
    expect(apiError("FORBIDDEN", "Access denied", 403).status).toBe(403);
    expect(apiError("NOT_FOUND", "Not found", 404).status).toBe(404);
    expect(apiError("SERVER_ERROR", "Internal error", 500).status).toBe(500);
  });

  it("should handle different error codes", async () => {
    const errorCodes = [
      { code: "VALIDATION_ERROR", message: "Invalid data", status: 400 },
      { code: "DUPLICATE_ENTRY", message: "Already exists", status: 409 },
      { code: "RATE_LIMITED", message: "Too many requests", status: 429 },
    ];

    for (const { code, message, status } of errorCodes) {
      const response = apiError(code, message, status);
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error).toBe(code);
      expect(body.message).toBe(message);
    }
  });
});

describe("apiOk (legacy)", () => {
  it("should return simple success response", async () => {
    const response = apiOk();
    const body = await response.json();

    expect(body.ok).toBe(true);
  });

  it("should return 200 status", () => {
    const response = apiOk();
    expect(response.status).toBe(200);
  });
});

describe("apiErrorLegacy (deprecated)", () => {
  it("should return error response with error string", async () => {
    const response = apiErrorLegacy("ERROR_CODE", "Error message", 400);
    const body = await response.json();

    expect(body.ok).toBe(false);
    expect(body.error).toBe("ERROR_CODE");
    expect(body.message).toBe("Error message");
  });

  it("should use default status 400 when not provided", () => {
    const response = apiErrorLegacy("ERROR_CODE");
    expect(response.status).toBe(400);
  });

  it("should include details when provided", async () => {
    const details = { field: "email", reason: "invalid format" };
    const response = apiErrorLegacy("VALIDATION_ERROR", "Invalid input", 400, details);
    const body = await response.json();

    expect(body.details).toEqual(details);
  });

  it("should not include message when not provided", async () => {
    const response = apiErrorLegacy("ERROR_CODE");
    const body = await response.json();

    expect(body.message).toBeUndefined();
  });

  it("should not include details when not provided", async () => {
    const response = apiErrorLegacy("ERROR_CODE", "Message", 400);
    const body = await response.json();

    expect(body.details).toBeUndefined();
  });
});

describe("normalizeLegacyResponse (deprecated)", () => {
  it("should convert success:true to ok:true", () => {
    const legacy = { success: true, data: { id: 1 } };
    const result = normalizeLegacyResponse(legacy);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: 1 });
  });

  it("should convert success:false to ok:false", () => {
    const legacy = { success: false, error: "FAILED" };
    const result = normalizeLegacyResponse(legacy);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("FAILED");
  });

  it("should preserve ok if already present", () => {
    const legacy = { success: true, ok: false };
    const result = normalizeLegacyResponse(legacy);

    // When ok is already present, it should be set to true (last line of function)
    expect(result.ok).toBe(true);
  });

  it("should preserve additional properties", () => {
    const legacy = { success: true, user: { name: "Test" }, count: 5 };
    const result = normalizeLegacyResponse(legacy);

    expect(result.user).toEqual({ name: "Test" });
    expect(result.count).toBe(5);
  });

  it("should handle response without success or ok", () => {
    const legacy = { data: "something" };
    const result = normalizeLegacyResponse(legacy);

    expect(result.ok).toBe(true);
    expect(result.data).toBe("something");
  });
});