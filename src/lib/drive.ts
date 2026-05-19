/**
 * Client wrapper around POST /api/drive. Mirrors drop-media's pattern:
 * every Drive call goes through one server endpoint, server holds the
 * service-account credentials, no Google keys ever reach the browser.
 */
export interface DriveFolder {
  id: string;
  name: string;
}

async function driveApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/drive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok || !data) {
    throw new Error(data?.error ?? `Drive API ${res.status}`);
  }
  return data;
}

export async function listFolders(parentId: string): Promise<DriveFolder[]> {
  const data = await driveApi<{ folders: DriveFolder[] }>({
    action: "listFolders",
    parentId,
  });
  return data.folders;
}

export async function createFolder(
  parentId: string,
  name: string,
): Promise<DriveFolder> {
  const data = await driveApi<{ folder: DriveFolder }>({
    action: "createFolder",
    parentId,
    name,
  });
  return data.folder;
}

export interface CopiedFile {
  fileId: string;
  fileName: string;
  webViewLink: string;
}

export async function copyFile(opts: {
  sourceFileId: string;
  targetFolderId: string;
  name: string;
  rowNumber?: number;
  existingRow?: unknown[];
}): Promise<CopiedFile> {
  return driveApi<CopiedFile>({ action: "copyFile", ...opts });
}

export async function createUploadSession(opts: {
  name: string;
  mimeType?: string;
  size?: number;
  parentId?: string;
}): Promise<{ uploadUrl: string }> {
  return driveApi<{ uploadUrl: string }>({
    action: "createUploadSession",
    ...opts,
  });
}

export async function completeManual(opts: {
  fileId: string;
  webViewLink?: string;
  fileName?: string;
}): Promise<{ invoice: unknown }> {
  return driveApi<{ invoice: unknown }>({
    action: "completeManual",
    ...opts,
  });
}

/**
 * Find a child folder whose name matches `pattern`. Used to auto-locate
 * the "Vendors" folder under a community root, mirroring drop-media's
 * findPhotosVideosFolder helper.
 */
export async function findChildByPattern(
  parentId: string,
  pattern: RegExp,
): Promise<DriveFolder | null> {
  const folders = await listFolders(parentId);
  return folders.find((f) => pattern.test(f.name)) ?? null;
}
