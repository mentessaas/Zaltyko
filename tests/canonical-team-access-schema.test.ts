import { describe, expect, it } from "vitest";
import { canonicalTeamSchemaExpression } from "@/modules/staff/application/canonical-team-access-schema";

describe("reviewed team schema expression comparison", () => {
  it("normalizes PostgreSQL literal casts and redundant parentheses", () => {
    expect(canonicalTeamSchemaExpression("((status = 'pending'::text))")).toBe(canonicalTeamSchemaExpression("status='pending'"));
    expect(canonicalTeamSchemaExpression("role = ANY (ARRAY['manager'::zaltyko.member_role,'coach'::zaltyko.member_role])"))
      .toBe(canonicalTeamSchemaExpression("role = ANY ('{manager,coach}'::zaltyko.member_role[])"));
  });
  it("preserves boolean precedence and rejects a widened role constraint", () => {
    expect(canonicalTeamSchemaExpression("(status='pending' OR status='accepted') AND revision>0"))
      .not.toBe(canonicalTeamSchemaExpression("status='pending' OR (status='accepted' AND revision>0)"));
    expect(canonicalTeamSchemaExpression("role=ANY(ARRAY['manager','coach'])"))
      .not.toBe(canonicalTeamSchemaExpression("role=ANY(ARRAY['manager','coach','owner'])"));
  });
  it.each(["role = arbitrary_function()", "id::text = 'x'", "revision >= 0; SELECT 1", "unknown syntax"])("does not silently erase unexpected syntax: %s", expression => {
    // Unknown functions remain in the signature; unsupported casts/statements
    // fail closed rather than normalizing to the reviewed candidate.
    if (expression === "role = arbitrary_function()") expect(canonicalTeamSchemaExpression(expression)).not.toBe(canonicalTeamSchemaExpression("role='coach'"));
    else expect(() => canonicalTeamSchemaExpression(expression)).toThrow();
  });
});
