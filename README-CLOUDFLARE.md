# External Payer Scorecard — Cloudflare static MVP

This version keeps the interface on Cloudflare but stores working application state in the user's browser. Cloudflare receives ordinary page requests but does not receive uploaded documents, scorecard evidence, or browser-local configuration.

## Important limitations

- Browser data is device- and browser-profile-specific. Clearing site data removes it.
- The MVP is not a system of record. Export/import, centralized access, audit logs, retention rules, malware scanning, SSO/RBAC, and enterprise backup belong in the IT-owned production build.
- The included client identities are fictionalized. Do not publish real client names or workforce contacts in a personal Cloudflare account.
- Do not use an unsigned Power Automate HTTP trigger URL in browser code. Treat it like a secret.
- ChatGPT Enterprise approval does not automatically approve every Power Automate connector, logging setting, data-loss-prevention policy, Cloudflare account, or browser storage location for PHI/PII.

## Local test

From the project directory:

```powershell
cd "$env:USERPROFILE\source\repos\ExternalPayerScorecard-Web"
py -m http.server 8080 --directory dist
```

Open `http://localhost:8080`.

## Deploy with Cloudflare Wrangler

Install Node.js LTS first. Then:

```powershell
cd "$env:USERPROFILE\source\repos\ExternalPayerScorecard-Web"
npm install -g wrangler
wrangler login
wrangler pages project create external-payer-scorecard
wrangler pages deploy .\dist --project-name external-payer-scorecard
```

For later updates:

```powershell
cd "$env:USERPROFILE\source\repos\ExternalPayerScorecard-Web"
wrangler pages deploy .\dist --project-name external-payer-scorecard
```

## Recommended Power Automate contract

Use a tenant-approved Entra-authenticated endpoint. It should accept JSON shaped like:

```json
{
  "operation": "client-summary",
  "summaryType": "internal",
  "client": {},
  "methodology": []
}
```

Return:

```json
{ "summary": "Approved generated narrative" }
```

Required controls should include tenant authentication, an explicit caller allowlist, CORS restricted to the scorecard hostname, DLP policy review, minimum logging, defined retention, and confirmation that the selected AI Builder or approved model action is authorized for the intended data classification.

## Recommended security boundary

Keep Cloudflare static only. Do not add D1, R2, KV, Pages Functions, or a Worker proxy for this demonstration. If leadership wants shared data or real PHI/PII, stop the MVP path and hand the requirements to IT for an enterprise-owned tenant, identity, storage, and AI integration.
