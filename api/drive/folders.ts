import { adapt, error, googleFetch, json, readJson, requireAuth } from "../_utils.js";

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  try {
    if (request.method === "GET") {
      const parentId = new URL(request.url).searchParams.get("parentId");
      if (!parentId) return error("Missing parentId");
      const q = `'${escapeDriveQuery(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("q", q);
      url.searchParams.set("fields", "files(id,name)");
      url.searchParams.set("orderBy", "folder,name");
      const res = await googleFetch(url.toString());
      if (!res.ok) return error(await res.text(), res.status);
      const body = (await res.json()) as { files?: { id: string; name: string }[] };
      return json({ folders: body.files ?? [] });
    }
    if (request.method === "POST") {
      const body = await readJson<{ parentId?: string; name?: string }>(request);
      const parentId = body.parentId?.trim();
      const name = body.name?.trim();
      if (!parentId || !name) return error("Missing parentId or name");
      const res = await googleFetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parents: [parentId],
          mimeType: "application/vnd.google-apps.folder",
        }),
      });
      if (!res.ok) return error(await res.text(), res.status);
      return json({ folder: await res.json() });
    }
    return error("Method not allowed", 405);
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}

export default adapt(handler);
