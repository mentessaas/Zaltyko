import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";

export const MAX_PROGRESS_BYTES = 1024 * 1024;
export const MAX_PROGRESS_LINE = 1024;
type Milestone = "compiled" | "generated" | "optimizing" | "tracing";

/** Fixed labels only; bounded independent stream buffers and no raw output. */
export function createBuildProgressObserver(
  now: () => number = () => performance.now()
) {
  const started = now();
  let bytes = 0;
  let truncated = false;
  let finished = false;
  const events: Array<{ milestone: Milestone; elapsedMs: number }> = [];
  const streams = {
    stdout: { decoder: new StringDecoder("utf8"), line: "", discard: false },
    stderr: { decoder: new StringDecoder("utf8"), line: "", discard: false },
  };
  const record = (raw: string) => {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
    // Reject OSC, cursor commands, embedded controls and arbitrary suffixes.
    if (/[\x00-\x1f\x7f-\x9f]/.test(line)) return;
    const text = line.replace(/^[✓✔]\s+/, "");
    let milestone: Milestone | undefined;
    if (
      /^Compiled successfully(?: in [0-9]+(?:\.[0-9]+)?(?:ms|s|min|h))?$/.test(
        text
      )
    )
      milestone = "compiled";
    const generation = text.match(
      /^Generating static pages \(([0-9]+)\/([0-9]+)\)$/
    );
    if (generation && generation[1] === generation[2]) milestone = "generated";
    if (/^Finalizing page optimization(?: \.\.\.|…)?$/.test(text))
      milestone = "optimizing";
    if (/^Collecting build traces(?: \.\.\.|…)?$/.test(text))
      milestone = "tracing";
    if (!milestone || events.some((event) => event.milestone === milestone))
      return;
    const elapsed = now() - started;
    if (
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      elapsed > 86_400_000 ||
      elapsed < (events.at(-1)?.elapsedMs ?? 0)
    )
      return;
    events.push({ milestone, elapsedMs: Math.floor(elapsed) });
  };
  const consume = (state: typeof streams.stdout, text: string) => {
    for (const char of text) {
      if (char === "\n" || char === "\r") {
        if (!state.discard) record(state.line);
        state.line = "";
        state.discard = false;
      } else if (!state.discard) {
        if (state.line.length >= MAX_PROGRESS_LINE) {
          state.line = "";
          state.discard = true;
          truncated = true;
        } else state.line += char;
      }
    }
  };
  return {
    push(stream: "stdout" | "stderr", chunk: Buffer | string) {
      if (
        finished ||
        (stream !== "stdout" && stream !== "stderr") ||
        (!Buffer.isBuffer(chunk) && typeof chunk !== "string")
      )
        return;
      if (bytes >= MAX_PROGRESS_BYTES) {
        truncated = true;
        for (const state of Object.values(streams)) {
          state.line = "";
          state.discard = true;
        }
        return;
      }
      // Avoid allocating a copy of an unbounded string supplied by a caller.
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk.slice(0, MAX_PROGRESS_BYTES));
      const remaining = MAX_PROGRESS_BYTES - bytes;
      const accepted = buffer.subarray(0, remaining);
      bytes += accepted.length;
      if (
        buffer.length > remaining ||
        (typeof chunk === "string" && chunk.length > MAX_PROGRESS_BYTES)
      )
        truncated = true;
      consume(streams[stream], streams[stream].decoder.write(accepted));
      if (buffer.length > remaining) {
        // A cut tail is not a complete marker, even if its prefix matches one.
        streams[stream].line = "";
        streams[stream].discard = true;
      }
    },
    finish() {
      if (!finished) {
        for (const state of Object.values(streams)) {
          consume(state, state.decoder.end());
          if (!state.discard) record(state.line);
          state.line = "";
        }
        finished = true;
      }
      return { milestones: events.map((event) => ({ ...event })), truncated };
    },
  };
}
