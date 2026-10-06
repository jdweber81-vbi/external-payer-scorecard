# External Payer Scorecard v5 — Windows deployment

This project deploys the static dashboard and the AI bridge together as one Cloudflare Pages project. The file `functions/api/ai.js` runs in Cloudflare's server-side Worker runtime. The OpenAI key is stored as an encrypted Pages secret and is never included in `dist`, browser storage, or JavaScript sent to users.

## 1. Open PowerShell in the extracted folder

```powershell
Set-Location "$env:USERPROFILE\Downloads\ExternalPayerScorecard-Web-Cloudflare-v5"
```

## 2. Confirm Node and use the current Wrangler

Node 20.18.1 or newer is recommended. Your earlier Node 20.17.0 warning came from the `undici` dependency.

```powershell
node --version
npm --version
npm install -g wrangler@latest
wrangler --version
```

If Node is older than 20.18.1 and your company permits winget:

```powershell
winget upgrade OpenJS.NodeJS.LTS
```

Close and reopen PowerShell after the Node upgrade.

## 3. Sign in to Cloudflare

```powershell
wrangler logout
wrangler login
wrangler whoami
```

Complete the browser authorization, leave the success tab open until PowerShell reports success, then run `wrangler whoami`.

## 4. Store the API key as a Cloudflare secret

Paste the command below. Wrangler will ask for the value securely. Paste the API key at the prompt; do not put the key into the command or any project file.

```powershell
wrangler pages secret put OPENAI_API_KEY --project-name external-payer-scorecard
```

Store the demonstration access code as a second secret:

```powershell
wrangler pages secret put SCORECARD_ACCESS_CODE --project-name external-payer-scorecard
```

When Wrangler privately prompts for the value, enter the approved demonstration code. Never place the code in `index.html`, `login.html`, or browser JavaScript.

## 5. Deploy the site and Function

Run this command from the project root—not from inside `dist`—so Wrangler includes the sibling `functions` folder.

```powershell
wrangler pages deploy .\dist --project-name external-payer-scorecard --branch main
```

Open the production address shown by Wrangler, normally:

```text
https://external-payer-scorecard.pages.dev
```

## 6. Test the bridge

```powershell
Invoke-RestMethod -Method Get -Uri "https://external-payer-scorecard.pages.dev/api/ai"
```

Then open the dashboard, click **AI connection**, keep AI enabled, and click either client-summary button. The Admin Book overview's **Refresh overview** button also uses live AI.

For client evidence, select one or more clients, leave **Analyze and slice this evidence with AI** enabled, and upload a supported file up to 8 MB. Review each proposed connection and score before approving it. The original file remains in that browser's IndexedDB.

## 7. View live server logs

```powershell
wrangler pages deployment tail --project-name external-payer-scorecard
```

Press `Ctrl+C` to stop viewing logs.

## Repeat deployment after future edits

```powershell
Set-Location "$env:USERPROFILE\Downloads\ExternalPayerScorecard-Web-Cloudflare-v5"
wrangler pages deploy .\dist --project-name external-payer-scorecard --branch main
```

## Remove the API key if needed

```powershell
wrangler pages secret delete OPENAI_API_KEY --project-name external-payer-scorecard
```

## Access protection

For a leadership demo, put Cloudflare Access in front of the Pages site and restrict it to approved email addresses or your company identity provider. A custom username/password form inside static JavaScript would only look protected; it would not securely protect the files or API endpoint.
