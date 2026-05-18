import {
  driveWebViewLink,
  error,
  extractDriveFileId,
  googleFetch,
  json,
  readJson,
  requireAuth,
  updateInvoiceRow,
} from "../_utils";

export default async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const body = await readJson<{
      rowNumber?: number;
      driveFileId?: string;
      targetFolderId?: string;
      targetFolderName?: string;
      fileName?: string;
      existingRow?: unknown[];
    }>(request);
    if (!body.rowNumber) return error("Missing rowNumber");
    if (!body.driveFileId) return error("Missing driveFileId");
    if (!body.targetFolderId) return error("Missing targetFolderId");
    const sourceFileId = extractDriveFileId(body.driveFileId);
    const name = body.fileName?.trim() || `invoice-${Date.now()}.pdf`;
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      sourceFileId,
    )}/copy?fields=id,name,webViewLink`;
    const res = await googleFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        parents: [body.targetFolderId],
      }),
    });
    if (!res.ok) return error(await res.text(), res.status);
    const copied = (await res.json()) as { id: string; name: string; webViewLink?: string };
    if (Array.isArray(body.existingRow) && body.existingRow.length >= 25) {
      const row = [...body.existingRow];
      row[18] = body.targetFolderId;
      row[19] = copied.id;
      row[20] = "Uploaded";
      row[21] = "";
      await updateInvoiceRow(body.rowNumber, row.slice(0, 25));
    }
    return json({
      fileId: copied.id,
      fileName: copied.name,
      webViewLink: copied.webViewLink || driveWebViewLink(copied.id),
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}
