import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  validateAndNormalizeEmail,
} from "@/lib/validation/email-utils";
import {
  isValidDateString,
  formatDateForDB,
} from "@/lib/validation/date-utils";
import {
  escapeLikeSearch,
} from "@/lib/helpers";

/**
 * Integration tests combining validation utilities
 * These tests verify that utilities work correctly together
 */

describe("Validation Integration", () => {
  describe("Email + Date validation flow", () => {
    it("should validate a complete user registration payload", () => {
      const payload = {
        email: "user@example.com",
        birthDate: "2000-01-15",
        startDate: "2024-03-01",
      };

      const isValid =
        isValidEmail(payload.email) &&
        isValidDateString(payload.birthDate) &&
        isValidDateString(payload.startDate);

      expect(isValid).toBe(true);
    });

    it("should reject invalid email in registration payload", () => {
      const payload = {
        email: "invalid-email",
        birthDate: "2000-01-15",
      };

      expect(isValidEmail(payload.email)).toBe(false);
    });

    it("should format dates for database storage", () => {
      const dates = [
        new Date("2024-01-15"),
        "2024-03-20",
        new Date("2024-12-31"),
      ];

      const formatted = dates.map(formatDateForDB);

      expect(formatted).toEqual(["2024-01-15", "2024-03-20", "2024-12-31"]);
    });
  });

  describe("Data sanitization flow", () => {
    it("should normalize and store email correctly", () => {
      const userInput = {
        email: "  User.Name@EXAMPLE.COM  ",
        birthDate: "  2000-05-20  ",
      };

      const normalizedEmail = validateAndNormalizeEmail(userInput.email);
      const parsedDate = formatDateForDB(userInput.birthDate);

      expect(normalizedEmail).toBe("user.name@example.com");
      expect(parsedDate).toBe("2000-05-20");
    });
  });

  describe("Search sanitization", () => {
    it("should escape special characters for LIKE queries", () => {
      const userSearch = "50% off!";
      const escaped = escapeLikeSearch(userSearch);

      expect(escaped).toBe("50\\% off!");
    });
  });
});
