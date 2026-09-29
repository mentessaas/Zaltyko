import { describe, expect, it } from "vitest";

import { getNextRegistrationRoleIndex } from "@/lib/auth/registration-role-navigation";

describe("getNextRegistrationRoleIndex", () => {
  it.each([
    ["ArrowDown", 0, 1],
    ["ArrowRight", 4, 0],
    ["ArrowUp", 4, 3],
    ["ArrowLeft", 0, 4],
    ["Home", 3, 0],
    ["End", 1, 4],
  ])("maps %s from %i to %i", (key, currentIndex, expectedIndex) => {
    expect(getNextRegistrationRoleIndex(key, currentIndex, 5)).toBe(
      expectedIndex
    );
  });

  it("ignores non-navigation keys and invalid indexes", () => {
    expect(getNextRegistrationRoleIndex("Space", 0, 5)).toBeNull();
    expect(getNextRegistrationRoleIndex("ArrowDown", 5, 5)).toBeNull();
    expect(getNextRegistrationRoleIndex("ArrowDown", 0, 0)).toBeNull();
  });
});
