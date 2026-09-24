import { describe, expect, it } from "vitest";
import { dryRunUpgradeCatalog, normalizeUpgradeSkill } from "@/lib/skills/upgrade-catalog-mapper";

describe("Upgrade catalog mapper", () => {
  it("normalizes discipline, apparatus, provenance and linked video refs", () => {
    const row = normalizeUpgradeSkill({
      id: "skill-1",
      discipline: "women",
      event: "bb",
      element_group: 2,
      name: "Cartwheel",
      description: "A controlled cartwheel",
      letter_grade: "C",
      value: 0.3,
      known_as: ["Side pass"],
      image_url: "https://example.com/skill.png",
    }, "v1", [{
      id: "video-1",
      skill_id: "skill-1",
      youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
      start_time: 4,
      end_time: 9,
    }]);

    expect(row.discipline).toBe("WAG");
    expect(row.apparatus).toBe("balance_beam");
    expect(row.element_group).toBe("II");
    expect(row.aliases).toEqual(["Side pass", "C"]);
    expect(row.video_refs[0]?.source_id).toBe("video-1");
    expect(row.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.status).toBe("active");
  });

  it("marks derived names and unknown mappings for review without dropping rows", () => {
    const report = dryRunUpgradeCatalog([
      { id: "skill-1", discipline: "unknown", event: "??", description: "Technical element" },
      { id: "skill-2", discipline: "men", event: "fx", element_group: 1, name: "Same", description: "Same", value: 0.1 },
      { id: "skill-3", discipline: "men", event: "fx", element_group: 1, name: "Same", description: "Same", value: 0.1 },
    ], [{ skill_id: "orphan", youtube_url: "https://youtu.be/abcdefghijk" }], "v1");

    expect(report.normalized_rows).toBe(3);
    expect(report.needs_review_rows).toBe(1);
    expect(report.duplicate_identity_rows).toBe(2);
    expect(report.orphan_video_rows).toBe(1);
    expect(report.rows[0]?.quality_flags).toContain("name_derived_from_description");
    expect(report.rows[0]?.status).toBe("needs_review");
  });
});
