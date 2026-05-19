/**
 * Single Drive endpoint following the drop-media pattern.
 * Client POSTs { action, ...payload } and gets back JSON.
 *
 * Actions:
 *   - listFolders      { parentId }                                    → { folders: [{id,name}] }
 *   - createFolder     { parentId, name }                              → { folder: {id,name} }
 *   - copyFile         { sourceFileId, targetFolderId, name?, rowNumber?, existingRow? }
 *                                                                     → { fileId, fileName, webViewLink }
 *   - createUploadSession { name, mimeType?, size?, parentId? }        → { uploadUrl }
 *   - completeManual   { fileId, webViewLink?, fileName? }             → { invoice }
 */
import {
  adapt,
  appendInvoiceRow,
  driveWebViewLink,
  error,
  extractDriveFileId,
  fetchSheetInvoices,
  googleFetch,
  json,
  manualUploadFolderId,
  readJson,
  requireAuth,
  updateInvoiceRow,
} from "./_utils.js";

const DRIVE_V3 = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_V3 = "https://www.googleapis.com/upload/drive/v3";

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listFolders(parentId: string) {
  const q =
    `'${escapeDriveQuery(parentId)}' in parents ` +
    `and mimeType='application/vnd.google-apps.folder' ` +
    `and trashed=false`;
  const url = new URL(`${DRIVE_V3}/files`);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("orderBy", "folder,name");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("pageSize", "1000");

  const res = await googleFetch(url.toString());
  if (!res.ok) return error(`Drive listFolders ${res.status}: ${await res.text()}`, res.status);
  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  return json({ folders: data.files ?? [] });
}

async function createFolder(parentId: string, name: string) {
  const url = `${DRIVE_V3}/files?fields=id,name&supportsAllDrives=true`;
  const res = await googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      parents: [parentId],
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!res.ok) return error(`Drive createFolder ${res.status}: ${await res.text()}`, res.status);
  return json({ folder: await res.json() });
}

async function copyFile(
  sourceFileId: string,
  targetFolderId: string,
  name: string,
  rowNumber?: number,
  existingRow?: unknown[],
) {
  const fileId = extractDriveFileId(sourceFileId);
  const url = `${DRIVE_V3}/files/${encodeURIComponent(
    fileId,
  )}/copy?fields=id,name,webViewLink&supportsAllDrives=true`;
  const res = await googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [targetFolderId] }),
  });
  if (!res.ok) return error(`Drive copyFile ${res.status}: ${await res.text()}`, res.status);
  const copied = (await res.json()) as { id: string; name: string; webViewLink?: string };

  // Mirror result into the Google Sheet row (cols S/T/U/V — index 18..21)
  if (rowNumber && Array.isArray(existingRow) && existingRow.length >= 25) {
    const row = [...existingRow];
    row[18] = targetFolderId;
    row[19] = copied.id;
    row[20] = "Uploaded";
    row[21] = "";
    await updateInvoiceRow(rowNumber, row.slice(0, 25));
  }

  return json({
    fileId: copied.id,
    fileName: copied.name,
    webViewLink: copied.webViewLink || driveWebViewLink(copied.id),
  });
}

async function createUploadSession(
  name: string,
  mimeType: string,
  size: number | undefined,
  parentId: string,
) {
  const url = `${DRIVE_UPLOAD_V3}/files?uploadType=resumable&fields=id,name,webViewLink&supportsAllDrives=true`;
  const res = await googleFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      ...(size ? { "X-Upload-Content-Length": String(size) } : {}),
    },
    body: JSON.stringify({ name, mimeType, parents: [parentId] }),
  });
  if (!res.ok)
    return error(`Drive createUploadSession ${res.status}: ${await res.text()}`, res.status);
  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) return error("Google did not return a resumable upload URL", 502);
  return json({ uploadUrl });
}

async function completeManual(fileId: string, webViewLink: string, fileName: string) {
  const rowValues = Array.from({ length: 25 }, () => "");
  rowValues[0] = `MANUAL-${Date.now()}`;
  rowValues[1] = new Date().toISOString();
  rowValues[4] = fileName || "Manual invoice";
  rowValues[9] = "Manual - fill in details";
  rowValues[12] = webViewLink;
  const rowNumber = await appendInvoiceRow(rowValues);
  const invoices = await fetchSheetInvoices();
  const invoice = rowNumber
    ? invoices.find((row) => row.rowNumber === rowNumber)
    : invoices[invoices.length - 1];
  return json({ invoice });
}

async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return error("Method not allowed", 405);

  let body: { action?: string; [k: string]: unknown };
  try {
    body = await readJson<typeof body>(request);
  } catch (e) {
    return error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const action = body.action;

  try {
    switch (action) {
      case "listFolders": {
        const parentId = String(body.parentId ?? "").trim();
        if (!parentId) return error("Missing parentId");
        return await listFolders(parentId);
      }
      case "createFolder": {
        const parentId = String(body.parentId ?? "").trim();
        const name = String(body.name ?? "").trim();
        if (!parentId || !name) return error("Missing parentId or name");
        return await createFolder(parentId, name);
      }
      case "copyFile": {
        const sourceFileId = String(body.sourceFileId ?? "").trim();
        const targetFolderId = String(body.targetFolderId ?? "").trim();
        const name = String(body.name ?? "").trim() || `invoice-${Date.now()}.pdf`;
        if (!sourceFileId) return error("Missing sourceFileId");
        if (!targetFolderId) return error("Missing targetFolderId");
        const rowNumber =
          typeof body.rowNumber === "number" ? body.rowNumber : undefined;
        const existingRow = Array.isArray(body.existingRow)
          ? (body.existingRow as unknown[])
          : undefined;
        return await copyFile(sourceFileId, targetFolderId, name, rowNumber, existingRow);
      }
      case "createUploadSession": {
        const name =
          String(body.name ?? "").trim() || `manual-invoice-${Date.now()}.pdf`;
        const mimeType = String(body.mimeType ?? "application/pdf");
        const size = typeof body.size === "number" ? body.size : undefined;
        const parentId =
          String(body.parentId ?? "").trim() || manualUploadFolderId();
        return await createUploadSession(name, mimeType, size, parentId);
      }
      case "completeManual": {
        const fileId = String(body.fileId ?? "").trim();
        const webViewLink =
          String(body.webViewLink ?? "").trim() ||
          (fileId ? driveWebViewLink(fileId) : "");
        const fileName = String(body.fileName ?? "").trim();
        if (!fileId && !webViewLink) return error("Missing uploaded Drive file");
        return await completeManual(fileId, webViewLink, fileName);
      }
      default:
        return error(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}

export default adapt(handler);
