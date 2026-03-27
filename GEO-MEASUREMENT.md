# GEO Week 4: Measurement & Baseline Documentation

## Post-Deployment Verification Checklist

After deploying to production, run through these checks:

### 1. Technical Verification

```bash
# Verify robots.txt has AI crawlers
curl https://zaltyko.com/robots.txt

# Verify llms.txt exists
curl https://zaltyko.com/llms.txt

# Verify sitemap.xml
curl https://zaltyko.com/sitemap.xml | grep -c "<loc>"

# Check cluster pages have schema
curl -s https://zaltyko.com/es/gimnasia-artistica/espana | grep -o "BreadcrumbList" | head -1
```

### 2. Google Rich Results Test

1. Go to: https://search.google.com/test/rich-results
2. Test these URLs:
   - [ ] https://zaltyko.com (homepage - SoftwareApplication + FAQ)
   - [ ] https://zaltyko.com/es/gimnasia-artistica/espana (cluster + BreadcrumbList)
   - [ ] https://zaltyko.com/pricing (if FAQ exists)

### 3. AI Citability Tests

#### ChatGPT Test
Ask ChatGPT:
```
"What software do you recommend for managing a gymnastics academy in Spain?"
```
Check if Zaltyko appears in the response.

#### Claude Test
Ask Claude:
```
"I'm looking for a tool to manage my gymnastics club - handles athletes, competitions, billing. Any recommendations?"
```
Check if Zaltyko appears.

#### Perplexity Test
Ask Perplexity:
```
"Best gymnastics academy management software for Spanish clubs"
```
Check results include Zaltyko.

### 4. Brand Search Volume

Track these metrics monthly:

| Metric | Tool | URL |
|--------|------|-----|
| Brand search volume | Google Trends | https://trends.google.com |
| Brand mentions | Google Alerts | https://alerts.google.com |
| Social mentions | Mention.net | https://mention.net |

Set up Google Alerts for:
- "Zaltyko"
- "Zaltyko gymnastics"
- "software gimnasia"

### 5. GEO Score Tracking

#### Microsoft Copilot Scan (if available)
Check if Microsoft Copilot indexes your pages.

#### GPTBot Access Log
If you have access to server logs, check for GPTBot visits:
```bash
grep "GPTBot" /var/log/nginx/access.log | wc -l
grep "ClaudeBot" /var/log/nginx/access.log | wc -l
```

---

## Baseline Metrics to Document

Before starting GEO work, document these for comparison:

### Current State (March 2026)

| Metric | Current Value | Target (6 months) |
|--------|---------------|------------------|
| Brand mentions (monthly) | TBD | +50% |
| AI citability score | 55/100 | 70/100 |
| Brand authority score | 35/100 | 55/100 |
| Wikipedia presence | No | Yes |
| Reddit mentions | 0 | 5+ |
| Cluster pages indexed | 0 (not deployed) | 48+ |

### Monthly Review Questions

1. Did Zaltyko appear in any AI responses this month?
2. Were there any new Wikipedia citations?
3. Did any gymnastics forums mention Zaltyko?
4. What new backlinks were acquired?
5. Did organic traffic change?

---

## Competitive GEO Analysis

Track these competitors for comparison:

| Competitor | Website | AI Visibility | Wikipedia | Reddit Presence |
|------------|---------|---------------|-----------|----------------|
| [Competitor 1] | | | | |
| [Competitor 2] | | | | |
| [Competitor 3] | | | | |

Tools to use:
- **SimilarWeb**: Competitive analysis
- **Semrush**: SEO/GEO tracking
- **Ahrefs**: Backlink analysis

---

## Next Audit Schedule

| Audit | Frequency | Focus |
|-------|-----------|-------|
| Quick review | Monthly | Rank tracking, mentions |
| Full GEO audit | Quarterly | All categories |
| Technical check | After each deploy | Schema, meta tags |

---

## Quick Wins Verification

Verify these are implemented:

- [ ] AI crawlers in robots.txt (GPTBot, ClaudeBot, PerplexityBot)
- [ ] llms.txt accessible at /llms.txt
- [ ] BreadcrumbList schema on cluster pages
- [ ] Organization schema with address/geo on homepage
- [ ] FAQPage schema validated
- [ ] HowTo schema on homepage
- [ ] dateModified on cluster pages

---

## Local Testing Commands

To test before deployment:

```bash
# Start local server
npm run dev

# Test robots.txt
curl http://localhost:3000/robots.txt

# Test llms.txt
curl http://localhost:3000/llms.txt

# Test sitemap
curl http://localhost:3000/sitemap.xml | grep -o "<loc>" | wc -l

# Should output: 86+ URLs
```

---

## Post-Deploy Action Items

After deploying, document:

1. **Date of deploy**: ___________
2. **Version deployed**: ___________
3. **Any issues encountered**: ___________
4. **Initial AI citability test results**: ___________
5. **Monitor for 2 weeks, then review**
