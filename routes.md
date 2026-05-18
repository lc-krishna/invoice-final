# Lucky Communities — Invoice Review Dashboard

Architecture reference: routes, data sources, webhooks, config, and state.

## 1. App routes (TanStack Router, file-based)

| File | URL | Purpose |
|------|-----|---------|
| `src/routes/__root.tsx` | — | HTML shell (`<html>/<head>/<body>`), global meta tags, 404 handler. |
| `src/routes/index.tsx` | `/` | The entire dashboard. Gates content behind hardcoded login, then renders the 3-panel layout (sidebar / invoice form / PDF preview). |

There is only one user-facing page. All UI lives at `/`.

### Auth gate
- Hardcoded credentials in `src/lib/auth.ts`:
  - **username:** `admin`
  - **password:** `admin@123`
- Session flag stored in `localStorage` under key `lc-auth-v1` (value `"1"`).
- This is an internal tool — not a real auth system. Anyone who can read the JS bundle can read the credentials.

## 2. Data source — Google Sheets (read-only)

Read directly from the browser using the Google Sheets API v4 (no backend).

- **Spreadsheet ID:** from env var `VITE_SHEET_ID`
- **API key:** `VITE_GOOGLE_API_KEY` (public-scope key, sheet must be shared with "anyone with the link")
- **Tab:** `Invoice Log`
- **Range read:** `Invoice Log!A2:Y10000`
- **Polling:** every **30 seconds** (also a manual Refresh button in the sidebar).
- Client lives in `src/lib/sheets.ts`; types in `src/lib/types.ts` (`InvoiceRow`).

### Invoice Log columns (A → Y)

| Col | Field | Notes |
|-----|-------|-------|
| A | S. No. | string, used for display only |
| B | Timestamp (CDT) | parsed → ISO; rows with invalid timestamps are skipped in the sidebar grouping |
| C | Community | matched against `config_communities.json` for bank pre-fill |
| D | Community Asana GID | |
| E | Task Name | |
| F | Vendor (Claude) | extracted vendor name |
| G | Invoice # | |
| H | Amount | parsed → number |
| I | Payment Method | |
| J | Status | drives `StatusBadge` color |
| K | Melio Email | |
| L | Community Folder ID | Drive folder for the community |
| M | Drive File ID (webview link) | rendered as iframe in the right panel (`/view` → `/preview`) |
| N | RM Bill ID | populated by WF2 |
| O / P | RM Bill Upload Status / Error | |
| Q / R | RM Attachment Status / Error | |
| S | Drive Vendor Folder ID | populated by WF3 |
| T | Drive Vendor File ID | populated by WF3 |
| U / V | Drive Upload Status / Error | |
| W | Asana Task GID | |
| X | Asana Task URL | |
| Y | Final Status | `"Done"` ⇒ green dot in the sidebar/tabs and form locks |

Stable per-row key: **`row-{rowNumber}`** (sheet row index, not Asana GID).

## 3. n8n webhooks (write side)

Three POST-only webhooks. Currently **not implemented in n8n yet** — buttons will fail until the workflows go live, but the dashboard itself works (read, browse, fill the form).

| Env var | URL | Triggered by | Purpose |
|---------|-----|--------------|---------|
| `VITE_N8N_WEBHOOK_DRIVE` | value set in Netlify/Vercel env | "Upload to Drive" button | WF3: copy the PDF into the chosen vendor folder in Google Drive. |
| `VITE_N8N_WEBHOOK_RM` | value set in Netlify/Vercel env | "Create RM Bill" button | WF2: create an expense bill in Rent Manager with GL lines + bank + due date. |
| `VITE_N8N_WEBHOOK_DONE` | value set in Netlify/Vercel env | "Mark as Done" button (visible only after the two above succeed) | WF4: write `Final Status = Done` and finish the Asana task. |

### Payload shapes

All requests are JSON with `Content-Type: application/json` and include an `action`, the sheet `rowNumber`, and a `timestamp` formatted as ISO with the America/Chicago offset.

**Drive (`action: "upload_to_drive"`):**
`rowNumber, confirmedFolderId, confirmedFolderName, community, invoiceNumber, vendor, amount, driveCommunityFolderId, driveFileId, timestamp`

**RM (`action: "create_rm_bill"`):**
`rowNumber, community, rmPropertyId, rmBankId, rmVendorId, rmVendorName, payMethod, memo, invoiceNumber, amount (= sum of billDetails), dueDate, driveFileId, billDetails: [{ glAccountId, glAccountName, amount, comment }], timestamp`

**Done (`action: "mark_done"`):**
`rowNumber, community, invoiceNumber, vendor, amount, rmBillId, driveVendorFolderId, driveVendorFileId, rmVendorId, rmVendorName, rmBankId, billDetails, payMethod, confirmedFolderId, confirmedFolderName, timestamp`

### Error handling
- HTTP 200 → success state, button locks, green badge.
- Non-200 → red error box with the response body. Buttons stay enabled for retry.
- If the RM response contains `BusinessRuleException`, an extra orange warning surfaces that text.

## 4. Static config (bundled JSON, no API)

All in `src/config/`, loaded synchronously via `src/lib/configs.ts`:

| File | Records | Used for |
|------|---------|----------|
| `communities.json` | 22 | Bank pre-fill (`rmBankId`), property ID, Melio email, default Drive folder |
| `drive_folders.json` | ~897 | Drive folder picker (auto-filtered by community, can be expanded to all) |
| `rm_vendors.json` | ~828 | RM vendor combobox |
| `rm_banks.json` | 36 | RM bank combobox |
| `gl_accounts.json` | 29 | GL/expense line combobox |

## 5. Per-invoice state (in-memory only)

Held in a `Map<string, InvoiceState>` in `src/routes/index.tsx`, keyed by `row-{rowNumber}`. Switching tabs preserves the form; reloading the page resets it (by design).

Fields on `InvoiceState` (see `src/lib/types.ts`): `driveFolderId/Name`, `driveSubmitted/Loading/Error`, `rmVendorId/Name`, `rmBankId`, `rmPayMethod`, `rmMemo`, `rmDueDate`, `billDetails[]`, `rmSubmitted/Loading/Error`, `rmBusinessRuleError`, `doneSubmitted/Loading/Error`.

## 6. Component map

| Component | Role |
|-----------|------|
| `InvoiceSidebar` | Left column. Groups invoices by date (Today / Yesterday / date), counts per community, refresh + logout. |
| `InvoiceForm` | Center column. Read-only extracted data + 3 action sections (Drive / RM / Done). |
| `PdfPreview` | Right column. Iframe of the Drive `/preview` URL from column M. |
| `SearchCombobox` | Reusable searchable dropdown used for Drive folder, RM vendor, RM bank, GL account. |
| `StatusBadge` | Colored badge for column J / Y values. |
| `LoginScreen` | Hardcoded-credentials login. |

## 7. Time handling

Everything user-visible and every webhook timestamp is rendered/sent in **America/Chicago** via `src/lib/time.ts`. Invalid timestamps from the sheet are tolerated (the row is just dropped from the sidebar grouping rather than crashing the UI).

## 8. Environment variables (`.env`)

```env
VITE_SHEET_ID=<your-sheet-id>
VITE_GOOGLE_API_KEY=<your-google-api-key>
VITE_N8N_WEBHOOK_DRIVE=<your-drive-webhook-url>
VITE_N8N_WEBHOOK_RM=<your-rm-webhook-url>
VITE_N8N_WEBHOOK_DONE=<your-done-webhook-url>
```

If any of these are missing the dashboard renders a setup screen instead of crashing.

## 9. What this app does **not** use

- No database. No Supabase / Lovable Cloud. No server functions. No backend in this repo at all.
- No user accounts, no per-user data, no roles.
- No file uploads from the browser — the PDF already lives in Drive (column M) before the user sees the row.
