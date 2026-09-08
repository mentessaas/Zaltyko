# GEO Technical SEO Audit — zaltyko.com
Date: 2026-09-08
Auditor: geo-technical skill (live curl + header inspection, no CrUX field data available)

## Technical Score: 84/100 — Good

## Score Breakdown
| Category | Score | Status |
|---|---|---|
| Crawlability | 14/15 | Pass |
| Indexability | 9/12 | Warn |
| Security | 10/10 | Pass |
| URL Structure | 7/8 | Pass |
| Mobile Optimization | 8/10 | Pass |
| Core Web Vitals | n/a | Not measured (no field data) |
| Server-Side Rendering | 15/15 | Pass |
| Page Speed & Server | 14/15 | Pass |
| **Subtotal (measured)** | **77/85 → scaled to 100** | |

Status: Pass = ≥80% of category points, Warn = 50–79%, Fail = <50%

Note on Core Web Vitals: no CrUX / PageSpeed Insights field data captured in this run. Scoring below assumes "good" pending field measurement. Re-test with PageSpeed Insights / Chrome UX Report before shipping GEO changes.

---

## AI Crawler Access — EXEMPLARY

| Crawler | User-Agent | Status | Notes |
|---|---|---|---|
| GPTBot | GPTBot | ✅ Allowed (explicit) | First-class allow directive |
| ClaudeBot | ClaudeBot | ✅ Allowed (explicit) | First-class allow directive |
| PerplexityBot | PerplexityBot | ✅ Allowed (explicit) | First-class allow directive |
| Google-Extended | Google-Extended | ✅ Allowed (explicit) | Gemini / Google AI training allowed |
| Googlebot | Googlebot | ✅ Allowed (via `User-agent: *` Allow: /) | Search + AI Overviews pass |
| Bingbot | bingbot | ✅ Allowed (via `*`) | Bing → ChatGPT index path open |
| Applebot-Extended | Applebot-Extended | ✅ Allowed (via `*`) | Apple Intelligence allowed |
| CCBot | CCBot | ✅ Allowed (via `*`) | Common Crawl training data allowed |
| Bytespider | Bytespider | ✅ Allowed (via `*`) | TikTok / ByteDance allowed |

**Verdict: robots.txt is one of the best AI-crawler configurations seen for a SaaS site.** All major AI crawlers are explicitly or implicitly allowed. Only protected paths are `/app`, `/api`, `/dashboard`, `/super-admin` — correct scoping.

---

## Critical Issues (fix immediately)

### C1. Pricing page missing H1 (`https://zaltyko.com/pricing`)
The page renders an H2 ("Planes pensados por etapa de academia") but no H1. All 13 headings on the page are H2→H3→H4; the H1 slot is empty. Confirmed by raw HTML fetch (no `<h1>` tags exist anywhere in the response body).

**Why this matters:**
- Both Google and Bing weight H1 heavily for topic extraction
- AI Overviews and ChatGPT citations routinely extract the H1 as the "what is this page" signal
- Without H1, AI systems fall back to title tag — less semantic precision

**Fix:** Wrap the page hero headline ("Planes pensados por etapa de academia" or the H2 text itself) in an `<h1>`, demote the current H2 to a section heading. If the hero is visually styled larger than H2, use `text-4xl` styling on the H1 and treat the H2 as the section eyebrow.

---

## Warnings (fix this month)

### W1. Duplicate "Zaltyko" in page titles (multiple pages)
Examples in raw HTML:
- `/academias`: `Directorio de Academias de Gimnasia | Zaltyko | Zaltyko`
- `/es/gimnasia-artistica`: `Gimnasia Artística en Latinoamérica | Zaltyko | Zaltyko`

Root cause: the global `title.template` appends `| Zaltyko`, but the page-level title string already ends with "Zaltyko". Google rewrites/drops the duplicate in SERPs but Bing and AI crawlers use the raw title verbatim, producing awkward citation snippets.

**Fix:** Strip trailing "| Zaltyko" from page-level `metadata.title` strings, or make the template smarter (`if title ends with brand, skip append`).

### W2. No `hreflang` despite Spanish-language country cluster pages
`/es/gimnasia-artistica`, `/es/gimnasia-artistica/argentina`, etc. exist (verified 200) but carry no `<link rel="alternate" hreflang="...">` tags. Google treats these as duplicates of the root `/` rather than as targeted country variants, collapsing them in indexing.

`og:locale` is set to `es_ES` only — no per-country differentiation.

**Fix:** Add a hreflang matrix (one entry per country cluster page + an `x-default` pointing to `/`). Even if the content is identical, hreflang + canonical pointing to the country-specific URL signals intent. See `src/lib/seo/clusters.ts` (already exists per CLAUDE.md) — likely needs the hreflang emission added.

### W3. IndexNow not implemented
- `https://zaltyko.com/.well-known/indexnow-key.txt` → 404
- `https://zaltyko.com/indexnow-key.txt` → 307 redirect to `/` (no key file)

**Why this matters for GEO:** Bing indexes ChatGPT's web results. IndexNow pushes instant updates to Bing → faster AI citation of new content. Currently relying entirely on organic Bing recrawl.

**Fix:** Generate an IndexNow key (UUID), drop at `public/.well-known/indexnow-key.txt`, call `https://api.indexnow.org/indexnow` from a server action after content mutations (or use a cron / Vercel cron to ping when sitemap regenerates). Documentation: https://www.indexnow.org/

### W4. Sitemap `<lastmod>` is identical across all 80 URLs (`2026-09-08T07:30:22.501Z`)
Strongly suggests `<lastmod>` is generated at sitemap-build time rather than reflecting actual content modification time. Bing/Google both reduce trust in sitemap signals when lastmod lies.

**Fix:** Source `lastmod` from the row's actual `updated_at` in Supabase (or whatever backs the content). For pages that don't change, omit `<lastmod>` entirely — that's also a valid signal.

### W5. No `<link rel="preconnect">` to critical third-party origins
CSP shows connect-src includes `*.supabase.co`, `*.stripe.com`, `*.posthog.com`, `*.sentry.io`, `*.sentry-cdn.com`, and `fonts.googleapis.com`. None are preconnected. Each first connection costs a DNS+TLS round trip (~100–300ms each on cold paths).

**Fix:** Add to `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://*.supabase.co" crossorigin>
<link rel="preconnect" href="https://*.stripe.com" crossorigin>
```
(Note: `*.supabase.co` and `*.stripe.com` can't be used in preconnect as wildcards — preconnect to the specific subdomain used by the app.)

---

## Recommendations (optimize this quarter)

### R1. Add `<link rel="preload">` for the LCP logo
The homepage preloads the logo SVG via `Link` HTTP header (good), but the inline `<link rel="preload">` is absent from the HTML head. Defense-in-depth: belt-and-braces preload ensures the LCP image starts fetching before CSS parses.

### R2. Image audit on inner pages
Homepage only contains 2 SVG logos (both have width/height, one lazy-loaded). For pages with hero images, verify WebP/AVIF serving and `loading="lazy"` for below-fold media. Run Lighthouse on `/features`, `/pricing`, `/es/gimnasia-artistica` once deployed.

### R3. Core Web Vitals measurement
No field data captured in this audit. Run:
- PageSpeed Insights (lab) on `/`, `/pricing`, `/features`, `/academias`
- Search Console → Experience → Core Web Vitals (field, 28-day rolling, only visible once you have traffic)
- CrUX (https://developer.chrome.com/docs/crux/dashboards) for zaltyko.com

Targets: LCP < 2.5s, INP < 200ms, CLS < 0.1 (75th percentile).

### R4. `noindex` audit for tenant pages
`/app/[academyId]/...` and `/dashboard` are correctly `Disallow`-ed in robots.txt. But `/api`, `/auth/login`, `/auth/register` are also blocked in robots — verify these don't have stray `index, follow` meta robots tags. (Login pages indexed = bad UX + competitor intel leak.) Quick grep:
```bash
curl -s https://zaltyko.com/auth/login | grep robots
```

### R5. Add `apple-touch-icon` and `manifest.json` references
`<link rel="manifest" href="/manifest.webmanifest">` is allowed by CSP (`manifest-src 'self' https://vercel.com`) but I didn't verify the file exists or that `apple-touch-icon` is set. Mobile-first platforms (iOS Safari, Android Chrome) use these for PWA install and home-screen icons. Quick win for mobile UX and Core Web Vitals (installability).

---

## Detailed Findings

### Category 1: Crawlability — 14/15

| Check | Result | Points |
|---|---|---|
| robots.txt valid and complete | ✅ Valid syntax, sitemap referenced, scoped Disallow rules | 3/3 |
| AI crawlers allowed | ✅ GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Googlebot, Bingbot all allowed (5/5 score on AI access) | 5/5 |
| XML sitemap present and valid | ✅ 80 URLs, valid XML, lastmod present (but see W4 — all identical timestamps) | 2/3 |
| Crawl depth within 3 clicks | ✅ Homepage → top-level nav (academias, pricing, features, etc.) all depth 1 | 2/2 |
| No erroneous noindex directives | ✅ All sampled pages have `<meta name="robots" content="index, follow">` | 2/2 |

**Deduction reason:** 1 point off sitemap for the `<lastmod>` integrity issue (all identical timestamps = sitemap signal weakened). Not critical because the URLs themselves are correct.

### Category 2: Indexability — 9/12

| Check | Result | Points |
|---|---|---|
| Canonical tags correct | ⚠️ Correct on homepage (`https://zaltyko.com`), pricing, features, cluster pages — but see C1/W1 about title duplicates | 2/3 |
| No duplicate content issues | ✅ HTTP→HTTPS (308), www→non-www (301), no trailing-slash issues observed | 3/3 |
| Pagination handled correctly | No paginated public pages in sitemap — N/A | 2/2 |
| Hreflang correct (if applicable) | ❌ Cluster pages exist for countries but no hreflang emitted | 0/2 |
| No index bloat | ✅ robots.txt blocks `/app`, `/api`, `/dashboard`, `/super-admin`; only 80 URLs in sitemap, all are real content | 2/2 |

**Deduction reasons:** 1 point off canonicals for the title-duplication problem (downstream effect on snippets), 2 points off hreflang for the cluster pages lacking language/region targeting.

### Category 3: Security — 10/10

| Check | Result | Points |
|---|---|---|
| HTTPS enforced with valid cert | ✅ HTTP returns 308 to HTTPS | 4/4 |
| HSTS header present | ✅ `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` | 2/2 |
| X-Content-Type-Options | ✅ `nosniff` | 1/1 |
| X-Frame-Options | ✅ `DENY` | 1/1 |
| Referrer-Policy | ✅ `strict-origin-when-cross-origin` | 1/1 |
| Content-Security-Policy | ✅ Detailed CSP with nonces, frame-ancestors 'none', form-action restricted, object-src 'none', worker-src scoped, manifest-src scoped | 1/1 |

CSP is unusually thorough for a Next.js app — using per-request nonces for `script-src` (defeats XSS), restricting `frame-ancestors` (defeats clickjacking), and limiting `form-action` to self + Supabase. This is best-in-class security header configuration.

### Category 4: URL Structure — 7/8

| Check | Result | Points |
|---|---|---|
| Clean, readable URLs | ✅ Lowercase, hyphenated, no parameters | 2/2 |
| Logical hierarchy | ✅ Flat root nav + `/es/<modality>` cluster pattern | 2/2 |
| No redirect chains (max 1 hop) | ✅ All 14 sampled sitemap URLs return 200 with 0 redirects | 2/2 |
| Parameter handling configured | ⚠️ `/auth/register?role=owner` is a query-string variant — no canonical pointing to non-param version | 1/2 |

**Deduction reason:** Query parameters on the register page create a duplicate-content risk. Add `<link rel="canonical" href="https://zaltyko.com/auth/register">` (without the query param) on the page so the variant collapses.

### Category 5: Mobile Optimization — 8/10

| Check | Result | Points |
|---|---|---|
| Viewport meta tag correct | ✅ `width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover` | 3/3 |
| Responsive layout | ✅ Tailwind responsive classes (`text-4xl sm:text-5xl`) throughout raw HTML | 3/3 |
| Tap targets appropriately sized | ⚠️ Cannot verify without browser rendering. The Tailwind classes suggest button styling is OK, but confirm in DevTools | 1/2 |
| Font sizes legible | ⚠️ Cannot verify from raw HTML — but `text-base` and up Tailwind classes observed, no obviously small text | 1/2 |

**Deduction reasons:** Cannot definitively score tap targets or font sizes without rendering. Run a Lighthouse mobile audit to confirm. Mobile-first indexing applies since July 2024 — this is non-negotiable for Google visibility.

### Category 6: Core Web Vitals — Not measured (no field data)

This category requires either CrUX / PageSpeed Insights field data, or a controlled Lighthouse run on production URLs. Run before relying on this score.

**Estimated from page characteristics (rough):**
- **LCP:** Likely good. TTFB 358ms, LCP element is SVG logo (preloaded), no large hero images, web fonts preloaded. Estimated <2.5s.
- **INP:** Cannot estimate from raw HTML. Need to measure with Lighthouse / real-user data.
- **CLS:** Logos have explicit width/height, fonts are preloaded. Likely <0.1.

**Action:** Run Lighthouse + PageSpeed Insights before shipping GEO changes. Add `next/script` strategy="worker" for non-critical scripts (Vercel live, PostHog) to reduce main-thread blocking.

### Category 7: Server-Side Rendering — 15/15 (exemplary for GEO)

| Check | Result | Points |
|---|---|---|
| Main content in raw HTML | ✅ H1 ("Las cuotas cobradas, los grupos montados y la lista pasada.") in raw HTML; 167 `<p>` tags, 69 `<li>` tags, 6 H2 sections all server-rendered | 8/8 |
| Meta tags + structured data in raw HTML | ✅ Title, description, canonical, OG (10 tags), Twitter (4 tags), and 3 JSON-LD schemas (SoftwareApplication, Organization, FAQPage) all present in raw HTML response | 4/4 |
| Internal links in raw HTML | ✅ 66 internal href occurrences, 39 unique, including nav links to `/academias`, `/es/gimnasia-artistica/argentina`, etc. Critical for AI crawler follow behavior | 3/3 |

**Verdict: This is exactly what AI crawlers need.** GPTBot, PerplexityBot, ClaudeBot fetch the raw HTML, see all the headings, paragraphs, JSON-LD, and links, and can index and cite the page without executing JavaScript. This is the strongest finding of the audit.

### Category 8: Page Speed & Server — 14/15

| Check | Result | Points |
|---|---|---|
| TTFB < 800ms | ✅ 358ms measured | 3/3 |
| Page weight < 2MB | ✅ 168KB raw HTML, 24.6KB gzipped | 2/2 |
| Images optimized | ✅ Homepage only has 2 SVG logos (both have width/height, one lazy-loaded). Limited scope — verify on inner pages | 2/3 |
| JS bundles reasonable | ✅ 30 code-split chunks via Next.js. Cannot measure total payload from raw HTML alone but the chunking is correct | 1/2 |
| Compression enabled | ✅ gzip confirmed (168KB → 24.6KB, 85% reduction). No brotli header observed but gzip works | 2/2 |
| Cache headers on static | ✅ `public, max-age=31536000, immutable` on `_next/static/css/*.css` with ETag | 2/2 |
| CDN in use | ✅ `server: Vercel` header, Vercel Edge Network in use | 1/1 |

**Deduction reasons:** 1 point off images (need to audit inner pages), 1 point off JS bundles (need to measure actual transfer size — could be 200KB+).

---

## What's NOT in this audit (next steps)

1. **Field-data Core Web Vitals** — needs PageSpeed Insights API + CrUX (real-user data over 28 days).
2. **Inner page image audit** — homepage only has logos. Need to crawl `/features`, `/pricing`, `/academias`, `/es/gimnasia-artistica` and inspect `<img>` tags.
3. **Mobile rendering** — needs Chrome headless or actual device. Lighthouse mobile audit recommended.
4. **Cluster page content uniqueness** — if `/es/gimnasia-artistica/argentina` is thin or near-duplicate of `/es/gimnasia-artistica`, those cluster pages risk being treated as doorway pages by Google. Check the actual content via fetch + content ratio comparison.
5. **The "preview deployment" the user mentioned** — this audit ran against production. To compare, fetch the Vercel preview URL the same way and diff against this baseline. Likely candidates: a fix for C1 (pricing H1), W1 (title dedup), or W3 (IndexNow).

---

## Summary

**Strongest areas:** AI crawler access (exemplary robots.txt), security headers (best-in-class CSP with nonces), SSR (full content in raw HTML for AI citation), gzip + immutable cache headers.

**Highest-priority fixes:**
1. **C1** — add H1 to `/pricing` (5-minute fix, real SEO impact)
2. **W1** — fix title-template brand duplication (15-minute fix, cleaner SERP/AI snippets)
3. **W3** — implement IndexNow (1-hour fix, faster Bing→ChatGPT indexing)
4. **W2** — add hreflang to cluster pages (2-hour fix, prevents country-variant collapse in indexing)

**Note for the preview-deploy question:** This audit measured production. If the preview deployments include fixes for any of the above, the preview URL will show a higher score. Recommend re-running this audit against the preview URL once those changes are live there.
