
# Lucky Communities — Invoice Review Dashboard

A production-ready 3-panel dashboard for the finance team to review invoices arriving in a Google Sheet, then submit them to Google Drive and Rent Manager via n8n webhooks. Open internal tool (no auth), in-memory submission state, client-side Sheets API.

## Layout

Three resizable panels filling the viewport:
- **Left sidebar (200px)** — date-grouped invoice navigation
- **Center (460px)** — invoice review form with tabs
- **Right (flex-1)** — PDF preview iframe

## Config Loading

All 5 JSON files (`config_drive_folders.json`, `config_rm_vendors.json`, `config_rm_banks.json`, `config_gl_accounts.json`, `config_communities.json`) imported as static modules from `src/config/`. Strongly typed with TS interfaces.

## Left Sidebar — Invoice Navigation

- Polls Google Sheets `Invoice Log` tab every 30s using `VITE_SHEET_ID` + `VITE_GOOGLE_API_KEY` (Sheets v4 `values:batchGet`).
- Parses all 18 columns into typed `InvoiceRow` objects keyed by `asanaTaskGid`.
- Groups by date (Today / Yesterday / "Apr 18") in **America/Chicago** timezone using `Intl.DateTimeFormat`.
- Within each date, lists communities with invoice count badges.
- Active selection has a left-border accent.
- Manual refresh button + last-updated timestamp.
- Loading skeleton on first fetch; toast on fetch failure.

## Center Panel

### Top tabs
- One tab per invoice for selected community+date.
- Label: `{Vendor (truncated 14 ch)} #{Invoice #}`.
- Green dot when both Drive ✅ + RM ✅ submitted in this session.

### Section 1 — Extracted Data (read-only)
Card with: Community, Invoice #, Amount ($X,XXX.XX), Vendor, Payment Method, Received from, Email subject, Date received (CDT), Status (colored badge using spec color map).

### Section 2 — Upload to Google Drive (blue button)
- **Drive Folder Search**: Combobox (shadcn Command) over `config_drive_folders.json`, auto-filtered to the invoice's community on load with a "Show all communities" toggle to clear the filter. Each row shows `folderName` with muted `fullPath` underneath.
- **Upload to Drive ↑** button: POSTs spec payload to `VITE_N8N_WEBHOOK_DRIVE`. Spinner while inflight. On 200 → green ✅ "Uploaded to Drive", button locked grey, `driveSubmitted=true`. On non-200 → red ❌ with full response body text, button stays enabled.

### Section 3 — Create Bill in Rent Manager (purple button)
- **RM Vendor Search**: Combobox over `config_rm_vendors.json`, no filter, shows `name` + muted `#vendorId`.
- **GL Account / Expense Lines**: Repeatable rows, each with GL combobox (`{name} ({reference})`) + amount input + remove (×, hidden when only 1). "+ Add expense line" below. Live total vs invoice amount with orange warning when mismatched (non-blocking).
- **Default Bank**: Combobox over `config_rm_banks.json`, **pre-filled** from `config_communities.json` → `rmBankId` matched by community label; user can override.
- **Payment Method**: Select (ACH default / Check / CreditCard / Petty Cash).
- **RM Memo**: Optional text, 200 char max with counter.
- **Create RM Bill ↑**: POSTs spec payload (with `billDetails[]`, `rmPropertyId` from community config) to `VITE_N8N_WEBHOOK_RM`. Same loading/lock/retry behavior. On error containing `BusinessRuleException` → render in a distinct **orange warning box** above the generic error.

### Section 4 — Mark as Done (green button)
- Visible only when both `driveSubmitted` and `rmSubmitted` are true.
- POSTs spec payload to `VITE_N8N_WEBHOOK_DONE`. On 200 → success toast, tab gets green dot, button disabled.

## Right Panel — PDF Preview
- Header: `Invoice Preview — {Vendor} #{Invoice #}` + "Open in Drive ↑" link (new tab).
- Iframe pointing to the row's `Drive Link`.
- Empty state: "PDF will appear here once uploaded to Drive" when no link.

## State Management
- Per-invoice state stored in a `Map<asanaTaskGid, InvoiceState>` (React state) so switching tabs preserves form selections, submission flags, and errors. In-memory only — refresh resets, but the sheet's Status column will reflect downstream changes on the next 30s poll.

## Environment Variables (required)
`VITE_SHEET_ID`, `VITE_GOOGLE_API_KEY`, `VITE_N8N_WEBHOOK_DRIVE`, `VITE_N8N_WEBHOOK_RM`, `VITE_N8N_WEBHOOK_DONE`. Dashboard shows a clear setup screen if any are missing.

## Quality
- Full TypeScript types for sheet rows, configs, webhook payloads, and per-invoice state.
- Loading/disabled/error states on every async action.
- All timestamps in webhooks formatted as ISO representing America/Chicago.
- shadcn/ui throughout (Command, Combobox, Tabs, Card, Badge, Button, Sonner toasts).
- No `console.log` calls; errors surface in UI + toasts.
- Replaces the existing placeholder `index.tsx` with the dashboard route.
