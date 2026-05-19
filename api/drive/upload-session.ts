import {
  adapt,
  error,
  googleFetch,
  json,
  manualUploadFolderId,
  readJson,
  requireAuth,
} from "../_utils.js";

async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const body = await readJson<{ name?: string; mimeType?: string; size?: number }>(request);
    const name = body.name?.trim() || `manual-invoice-${Date.now()}.pdf`;
    const mimeType = body.mimeType || "application/pdf";
    const url =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink";
    const res = await googleFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        ...(body.size ? { "X-Upload-Content-Length": String(body.size) } : {}),
      },
      body: JSON.stringify({
        name,
        mimeType,
        parents: [manualUploadFolderId()],
      }),
    });
    if (!res.ok) return error(await res.text(), res.status);
    const uploadUrl = res.headers.get("Location");
    if (!uploadUrl) return error("Google did not return an upload session URL", 502);
    return json({ uploadUrl });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}

export default adapt(handler);
