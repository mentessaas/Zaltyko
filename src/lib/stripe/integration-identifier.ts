import { randomBytes } from "node:crypto";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function createStripeIntegrationIdentifier(flow: string): string {
  const suffix = Array.from(
    randomBytes(8),
    (byte) => LETTERS[byte % LETTERS.length]
  ).join("");
  return `${flow}_${suffix}`;
}
