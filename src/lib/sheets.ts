import type { InvoiceRow } from "./types";

export const SHEET_TAB = "Invoice Log";
export const SHEET_RANGE = `${SHEET_TAB}!A2:Y10000`;

function parseAmount(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseSheetTimestamp(raw: unknown): string {
  if (raw == null || raw === "") return "";
  const s = String(raw);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s;
}

function s(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).trim();
}

export function mapSheetRows(rows: unknown[][]): InvoiceRow[] {
  const out: InvoiceRow[] = [];
  rows.forEach((r, idx) => {
    if (!r || r.length === 0) return;
    const serialNo = s(r[0]);
    const status = s(r[9]);
    const isManual = status.startsWith("Manual") || serialNo.startsWith("MANUAL-");
    const community = s(r[2]);
    const invoiceNumber = s(r[6]);
    if (!community && !invoiceNumber && !serialNo && !s(r[12])) return;
    out.push({
      source: isManual ? "manual" : "sheet",
      rowNumber: idx + 2,
      serialNo,
      timestamp: parseSheetTimestamp(r[1]),
      community,
      communityAsanaGid: s(r[3]),
      taskName: s(r[4]),
      vendor: s(r[5]),
      invoiceNumber,
      amount: parseAmount(r[7]),
      paymentMethod: s(r[8]),
      status,
      melioEmail: s(r[10]),
      communityFolderId: s(r[11]),
      driveFileId: s(r[12]),
      rmBillId: s(r[13]),
      rmBillUploadStatus: s(r[14]),
      rmBillUploadError: s(r[15]),
      rmAttachmentStatus: s(r[16]),
      rmAttachmentError: s(r[17]),
      driveVendorFolderId: s(r[18]),
      driveVendorFileId: s(r[19]),
      driveUploadStatus: s(r[20]),
      driveUploadError: s(r[21]),
      asanaTaskGid: s(r[22]),
      asanaTaskUrl: s(r[23]),
      finalStatus: s(r[24]),
    });
  });
  return out;
}

export async function fetchInvoices(): Promise<InvoiceRow[]> {
  const res = await fetch("/api/invoices", { method: "GET" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Invoices API ${res.status}: ${body || res.statusText}`);
  }
  const json = (await res.json()) as { invoices?: InvoiceRow[] };
  return json.invoices ?? [];
}

/** Stable per-invoice key. Prefer rowNumber, but make it a string. */
export function invoiceKey(inv: InvoiceRow): string {
  return `row-${inv.rowNumber}`;
}
