/**
 * Common reporting utilities for Zaltyko static gates.
 *
 * Each gate produces a list of `Finding` and exits with a non-zero code
 * when run with `--strict` and at least one finding exists. The output
 * is a JSON document on stdout, suitable for CI artifacts.
 *
 * Output shape:
 *   {
 *     "gate": "unbounded-reads",
 *     "scannedFiles": <int>,
 *     "findings": [ { file, line, rule, reason, hint } ],
 *     "exit": "ok" | "violations"
 *   }
 */
import process from "node:process";

import type { Finding } from "./walker";

export interface GateReport {
  gate: string;
  scannedFiles: number;
  findings: Finding[];
  exit: "ok" | "violations";
}

export function emitReport(gate: string, scannedFiles: number, findings: Finding[]): GateReport {
  const strict = process.argv.includes("--strict");
  const report: GateReport = {
    gate,
    scannedFiles,
    findings,
    exit: findings.length === 0 ? "ok" : "violations",
  };

  const jsonOnly = process.argv.includes("--json");
  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    if (findings.length === 0) {
      process.stdout.write(`[${gate}] OK — scanned ${scannedFiles} files, no findings.\n`);
    } else {
      process.stdout.write(`[${gate}] ${findings.length} finding(s) across ${scannedFiles} files:\n`);
      for (const f of findings) {
        process.stdout.write(`  ${f.file}:${f.line}  [${f.rule}] ${f.reason}\n`);
        process.stdout.write(`      hint: ${f.hint}\n`);
      }
    }
  }

  if (strict && findings.length > 0) {
    process.exitCode = 1;
  }

  return report;
}
