// IndexNow helper. IndexNow is the push protocol that lets sites notify
// search engines (Bing, Yandex, Seznam, Naver) about new/updated/deleted
// URLs in real time. ChatGPT indexes via Bing's index, so faster Bing
// indexing → faster citation visibility on ChatGPT, Bing Copilot and the
// rest of the AI search stack that reads Bing.
//
// Spec: https://www.indexnow.org/documentation
//
// The key is NOT a secret. It only proves domain ownership by being served
// at `https://<host>/.well-known/indexnow-key.txt`. Anyone can see it.
// What matters is that the file at that URL contains the same string we
// send in the request body, so Bing can fetch it and confirm we own the
// domain before accepting the submission.

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY = "d1edd327-692d-48e2-899b-b68988f6e809";

export interface IndexNowResult {
  submitted: number;
  accepted: boolean;
  status: number;
  error?: string;
}

export async function submitIndexNow(
  urls: string[],
  host?: string,
): Promise<IndexNowResult> {
  if (urls.length === 0) {
    return { submitted: 0, accepted: true, status: 204 };
  }

  let parsedHost: string;
  try {
    parsedHost = host ?? new URL(urls[0]).host;
  } catch {
    return { submitted: 0, accepted: false, status: 0, error: "INVALID_URL" };
  }

  try {
    // NOTE: we intentionally do NOT pass `keyLocation` explicitly. Per the
    // 2026-09-09 probe, sending it makes IndexNow's strict URL-vs-keyLocation
    // validation reject the URLs as "not related to your site verified
    // through the keylocation parameter" (HTTP 422), even though the key file
    // serves correctly and the host matches. Letting IndexNow auto-derive the
    // key location from `host` returns HTTP 202.
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: parsedHost,
        key: INDEXNOW_KEY,
        urlList: urls,
      }),
    });
    return {
      submitted: urls.length,
      accepted: res.ok,
      status: res.status,
    };
  } catch (err) {
    return {
      submitted: 0,
      accepted: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
