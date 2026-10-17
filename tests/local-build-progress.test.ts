import { describe, expect, it } from "vitest";
import {
  createBuildProgressObserver,
  MAX_PROGRESS_BYTES,
  MAX_PROGRESS_LINE,
} from "../scripts/lib/local-build-progress";

describe("bounded build progress", () => {
  it("handles every byte split including UTF8 and ANSI with monotonic observations", () => {
    const input = Buffer.from(
      "\x1b[32m✓ Compiled successfully in 2.9min\x1b[0m\n✓ Generating static pages (294/294)\nFinalizing page optimization ...\nCollecting build traces ...\n"
    );
    for (let split = 0; split <= input.length; split++) {
      let tick = 100;
      const observer = createBuildProgressObserver(() => tick);
      tick = 110;
      observer.push("stdout", input.subarray(0, split));
      tick = 120;
      observer.push("stdout", input.subarray(split));
      const result = observer.finish();
      expect(result.milestones.map((event) => event.milestone)).toEqual([
        "compiled",
        "generated",
        "optimizing",
        "tracing",
      ]);
      expect(
        result.milestones.every(
          (event) => event.elapsedMs >= 10 && event.elapsedMs <= 20
        )
      ).toBe(true);
      expect(result.truncated).toBe(false);
    }
  });
  it("keeps streams separate, flushes tails and emits each label only once", () => {
    let tick = 0;
    const observer = createBuildProgressObserver(() => tick);
    tick = 12;
    observer.push("stdout", "Compiled success");
    observer.push("stderr", "Collecting build traces ...\r");
    observer.push("stdout", "fully\nCompiled successfully\n");
    observer.push("stderr", "Finalizing page optimization ...");
    expect(observer.finish().milestones).toEqual([
      { milestone: "tracing", elapsedMs: 12 },
      { milestone: "compiled", elapsedMs: 12 },
      { milestone: "optimizing", elapsedMs: 12 },
    ]);
    observer.push("stdout", "Generating static pages (1/1)\n");
    expect(observer.finish().milestones).toHaveLength(3);
  });
  it("never exposes arbitrary text, OSC, non-SGR ANSI, secrets or incomplete generation", () => {
    const observer = createBuildProgressObserver(() => 0);
    observer.push(
      "stdout",
      "secret=/private/token\nCompiled successfully secret\nGenerating static pages (1/9)\n\x1b]0;secret\x07Compiled successfully\n\x1b[2JCollecting build traces ...\n"
    );
    expect(observer.finish()).toEqual({ milestones: [], truncated: false });
  });
  it("bounds lines and total input while retaining bounded fixed labels", () => {
    const observer = createBuildProgressObserver(() => 0);
    observer.push(
      "stdout",
      "x".repeat(MAX_PROGRESS_LINE + 1) + "Compiled successfully\n"
    );
    observer.push("stderr", Buffer.alloc(MAX_PROGRESS_BYTES + 1, 120));
    observer.push("stdout", "Compiled successfully\n");
    expect(observer.finish()).toEqual({ milestones: [], truncated: true });
  });
  it("ignores invalid types and nonmonotonic or nonfinite clocks", () => {
    let tick = 100;
    const observer = createBuildProgressObserver(() => tick);
    observer.push("stdout", null as unknown as string);
    observer.push("invalid" as "stdout", "Compiled successfully\n");
    tick = NaN;
    observer.push("stdout", "Compiled successfully\n");
    tick = 99;
    observer.push("stdout", "Compiled successfully\n");
    expect(observer.finish().milestones).toEqual([]);
  });
  it("does not turn a tail cut at the byte limit into a marker", () => {
    const observer = createBuildProgressObserver(() => 0);
    const marker = "Compiled successfully";
    const prefix = "\n".repeat(MAX_PROGRESS_BYTES - marker.length);
    observer.push("stdout", Buffer.from(prefix + marker + " secret suffix"));
    expect(observer.finish()).toEqual({ milestones: [], truncated: true });
  });
});
