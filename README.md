# External Payer Scorecard — Cloudflare v5.5.1

This version preserves the approved dashboard design and replaces the fictional Client A–J seed records with 16 approved de-identified Health Plan records from the two supplied workbooks.

## Source mapping

- Client profile: funding, LOB, states, UM region, CM model, carved services, platform, and account roles come from **De-identified Client list by LOB.xlsx**.
- Health review: annual/ACR band, renewal, membership, CAP/risk status, referenceability, and concise health/value/operations/relationship/growth statements come from **Deidentified_Payer_Client_Review 5 (1).xlsx**.
- The review workbook labels Health Plan 1 and Health Plan 2 were normalized to Health Plan 3 and Health Plan 4 to match the client-list workbook.
- The long-form Updates column is intentionally excluded from the website build.
- Leading Green/Yellow/Red review labels are converted to 85/65/35 for the relevant established CHI category. Unspecified/TBD values remain neutral at 70.

## Runtime design

- `dist/` is the browser application.
- `functions/api/ai.js` is the server-side Cloudflare Pages Function.
- `OPENAI_API_KEY` is a Cloudflare encrypted secret and is never delivered to the browser.
- The Function calls the OpenAI Responses API with `store: false` and schema-constrained JSON.
- v5.1 increases the model output allowance and uses low reasoning so structured summaries reliably reach a completed answer.
- v5.2 formats internal summaries as a candid account brief and customer summaries as a constructive, partnership-oriented action plan.
- v5.3 adds a server-side access-code gate, signed 12-hour `HttpOnly` sessions, route protection for the dashboard and AI endpoint, and sign-out.
- v5.3.1 supports Cloudflare Pages' clean `/login` URL and prevents a login redirect loop.
- v5.4 sends approved de-identified uploads through the protected AI bridge, slices documents into discrete evidence findings, distinguishes confirmed facts from potential events, and applies only user-approved score changes.
- v5.5 lets AI identify and visibly highlight every affected client in multi-client reports, detects likely newer editions of recurring documents and asks whether they replace the prior file, and restores the five-category lateral CHI weight editor.
- v5.5.1 gives every expanded sub-metric its full column width and moves the percentage control to a separate row, eliminating narrow stacked text and unused white space.
- Original uploaded reference files continue to use browser IndexedDB. When AI review is selected, a temporary copy is sent through the protected Worker to OpenAI with `store: false`; the file is not added to shared Cloudflare storage.
- Deterministic summaries remain available if AI is disabled or unavailable.

See `DEPLOY-WINDOWS.md` for complete copy/paste commands.
