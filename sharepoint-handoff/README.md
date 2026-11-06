# External Payer Scorecard — Mock SharePoint Test Harness

This package preserves the approved v5.5.1 scorecard UI and adds a free local environment that simulates the SharePoint behaviors needed for product testing.

## What is simulated

- A shared document library rather than browser-only IndexedDB storage.
- Shared scorecard state rather than browser-only localStorage.
- SharePoint identity and permission behavior is represented by automatic simulated Site Owner access; the real SPFx version will inherit Microsoft 365 identity and SharePoint groups.
- Multi-client AI document routing, evidence approval, CHI recalculation, recurring-report replacement prompts, reference libraries, client summaries, and the BOB overview.
- A swappable data-provider boundary for the future SPFx/SharePoint implementation.

The test harness is not a security or deployment substitute for a real Microsoft 365 tenant. Microsoft Entra ID, SharePoint permissions, App Catalog deployment, retention, versioning, audit logs, malware scanning, and corporate AI approval remain IT implementation items.

## Windows setup — exact copy/paste

Open PowerShell in this folder and run:

```powershell
node --version

Copy-Item ".env.example" ".env" -Force
notepad ".env"
```

In `.env`:

1. Keep or change `SCORECARD_ACCESS_CODE`.
2. Set `SCORECARD_AI_WORKER_URL` to the existing Cloudflare site, for example `https://external-payer-scorecard.pages.dev`.
3. Set `SCORECARD_AI_WORKER_ACCESS_CODE` to the access code required by that deployed site.
4. Do not put an OpenAI API key in this project. The existing Cloudflare secret remains server-side.

Then run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Start-Mock-SharePoint.ps1
```

Open:

```text
http://localhost:5190
```

No separate scorecard login is shown. This mirrors the intended SharePoint experience, where Microsoft 365 sign-in and SharePoint permissions control access.

## Test from another computer on the same private network

Change this line in `.env`:

```text
SCORECARD_HOST=0.0.0.0
```

Restart the server and find the host computer's IPv4 address:

```powershell
ipconfig
```

On the second device, open `http://HOST-IP-ADDRESS:5190`. Windows Firewall may ask whether Node can accept private-network connections. Only permit this on a trusted private network.

Both devices will see the same files and scorecard state because the harness stores them under `mock-data`. This demonstrates shared behavior; it is not internet hosting.

## Test sequence

1. Open the scorecard with simulated SharePoint Site Owner access and upload a de-identified document.
2. Let AI identify the affected client or clients.
3. Approve selected evidence and confirm the CHI changes.
4. Open a second browser or device and confirm the same file, association, and new score are visible through the shared mock storage.
5. Upload a later recurring report and validate the replacement prompt.
6. Test Internal Summary, Customer-Facing Summary, and Admin Book Overview.

## Storage locations

- Shared application state: `mock-data/state.json`
- Shared uploaded files: `mock-data/files/`
- Existing dashboard: `dist/`
- Future SharePoint adapter contract: `sharepoint-adapter/`

These runtime files are excluded from Git by default.

## IT handoff mapping

| Mock capability | Corporate implementation |
|---|---|
| Local access-code session | Microsoft Entra ID / SharePoint identity |
| Role selector | SharePoint Visitors, Members, and Owners groups |
| `mock-data/files` | SharePoint document library |
| `mock-data/state.json` | SharePoint Lists or approved enterprise data service |
| Local Node endpoints | SPFx context plus SharePoint REST/Microsoft Graph |
| Cloudflare AI bridge | Corporate-approved AI API or gateway |

The UI calls a storage-provider interface. IT can replace `dist/storage-provider.js` with the real provider described in `sharepoint-adapter/SharePointDataProvider.ts` without rewriting the dashboard logic.
