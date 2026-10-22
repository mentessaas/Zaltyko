import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { DirectoryError } from "./service";
export function publicIPv4(value: string) {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}
export async function fetchApprovedSource(url: URL) {
  const addresses = await lookup(url.hostname, { all: true });
  const selected = addresses.find((a) => publicIPv4(a.address));
  if (!selected)
    throw new DirectoryError(
      "PRIVATE_SOURCE",
      "La fuente no resuelve a una dirección pública permitida",
      403
    );
  // Pin the checked address. TLS still verifies the original domain; redirects are never followed.
  return new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        family: 4,
        headers: {
          "User-Agent": "ZaltykoDirectory/1.0 (+https://zaltyko.com/contact)",
        },
        lookup: (_host, _options, callback) =>
          callback(null, selected.address, 4),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new DirectoryError(
              "SOURCE_UNAVAILABLE",
              "Fuente no disponible o redirigida",
              502
            )
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2000000) {
            req.destroy(
              new DirectoryError("SOURCE_TOO_LARGE", "Fuente demasiado grande")
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );
    const deadline = setTimeout(
      () =>
        req.destroy(
          new DirectoryError("SOURCE_TIMEOUT", "La fuente tardó demasiado", 504)
        ),
      15000
    );
    req.on("error", reject);
    req.on("close", () => clearTimeout(deadline));
    req.end();
  });
}
