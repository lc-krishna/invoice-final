import {
  appendInvoiceRow,
  driveWebViewLink,
  error,
  fetchSheetInvoices,
  json,
  readJson,
  requireAuth,
} from "../_utils";

export default async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const body = await readJson<{ fileId?: string; webViewLink?: string; fileName?: string }>(request);
    if (!body.fileId && !body.webViewLink) return error("Missing uploaded Drive file");
    const fileId = body.fileId ?? "";
    const webViewLink = body.webViewLink || driveWebViewLink(fileId);
    const rowValues = Array.from({ length: 25 }, () => "");
    rowValues[0] = `MANUAL-${Date.now()}`;
    rowValues[1] = new Date().toISOString();
    rowValues[4] = body.fileName || "Manual invoice";
    rowValues[9] = "Manual - fill in details";
    rowValues[12] = webViewLink;
    const rowNumber = await appendInvoiceRow(rowValues);
    const invoices = await fetchSheetInvoices();
    const invoice = rowNumber
      ? invoices.find((row) => row.rowNumber === rowNumber)
      : invoices[invoices.length - 1];
    return json({ invoice });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}
