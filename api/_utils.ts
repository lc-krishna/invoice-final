import { SHEET_RANGE, SHEET_TAB, mapSheetRows } from "../src/lib/sheets.js";

const SESSION_COOKIE = "lc-session";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

let cachedGoogleToken: { token: string; expiresAt: number } | null = null;

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function error(message: string, status = 400) {
  return json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function optionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? (fallback ? process.env[fallback] : undefined);
}

function base64Url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const buf = new ArrayBuffer(binary.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

async function hmacKey() {
  const secret =
    process.env.SESSION_SECRET ??
    process.env.APP_PASSWORD ??
    "lc-default-session-secret-please-set-SESSION_SECRET";
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionCookie(username: string): Promise<string> {
  const payload = base64Url(
    JSON.stringify({
      sub: username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    }),
  );
  const signature = base64Url(
    await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload)),
  );
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function requireAuth(request: Request): Promise<Response | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return error("Unauthorized", 401);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return error("Unauthorized", 401);
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    fromBase64Url(signature),
    new TextEncoder().encode(payload),
  );
  if (!valid) return error("Unauthorized", 401);
  const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { exp?: number };
  if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return error("Unauthorized", 401);
  return null;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  return fromBase64Url(b64.replace(/\+/g, "-").replace(/\//g, "_")).buffer;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
}

let cachedServiceAccount: ServiceAccount | null = null;

function getServiceAccount(): ServiceAccount {
  if (cachedServiceAccount) return cachedServiceAccount;

  // Preferred: full base64-encoded service account JSON in one env var
  const b64 = process.env.SA_JSON_B64 ?? process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (b64) {
    try {
      const raw = Buffer.from(b64, "base64").toString("utf8");
      cachedServiceAccount = JSON.parse(raw) as ServiceAccount;
      return cachedServiceAccount;
    } catch (e) {
      throw new Error(`SA_JSON_B64 is not valid base64-encoded JSON: ${e}`);
    }
  }

  // Fallback: separate env vars (legacy)
  cachedServiceAccount = {
    client_email: env("GOOGLE_CLIENT_EMAIL"),
    private_key: env("GOOGLE_PRIVATE_KEY"),
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  };
  return cachedServiceAccount;
}

async function googleJwt(): Promise<string> {
  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      ...(sa.private_key_id ? { kid: sa.private_key_id } : {}),
    }),
  );
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: GOOGLE_SCOPES,
      aud: sa.token_uri ?? TOKEN_AUDIENCE,
      exp: now + 3600,
      iat: now,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const unsigned = `${header}.${claim}`;
  const signature = base64Url(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  return `${unsigned}.${signature}`;
}

export async function googleAccessToken(): Promise<string> {
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > Date.now() + 60_000) {
    return cachedGoogleToken.token;
  }
  const assertion = await googleJwt();
  const res = await fetch(TOKEN_AUDIENCE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedGoogleToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

export async function googleFetch(url: string, init: RequestInit = {}) {
  const token = await googleAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export function sheetId(): string {
  return env("GOOGLE_SHEET_ID", "VITE_SHEET_ID");
}

export function manualUploadFolderId(): string {
  return optionalEnv("MANUAL_UPLOAD_FOLDER_ID") ?? "1MEHOdYOeIxlYZa0kXnwP23GxK_xbxWFB";
}

export async function fetchSheetInvoices() {
  const encodedRange = SHEET_RANGE.replace(/ /g, "%20");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId(),
  )}/values/${encodedRange}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await googleFetch(url);
  if (!res.ok) throw sheetsError("read", res.status, await res.text());
  const body = (await res.json()) as { values?: unknown[][] };
  return mapSheetRows(body.values ?? []);
}

function sheetsError(action: string, status: number, body: string): Error {
  if (status === 403 && /PERMISSION_DENIED/i.test(body)) {
    const sa = getServiceAccount().client_email;
    return new Error(
      `Google Sheets denied ${action}. Share the Invoice Log sheet (id ${sheetId()}) with ${sa} as Editor.`,
    );
  }
  return new Error(`Sheets ${action} ${status}: ${body}`);
}

export async function appendInvoiceRow(values: unknown[]) {
  const encodedRange = `${SHEET_TAB}!A:Y`.replace(/ /g, "%20");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId(),
  )}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await googleFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw sheetsError("append", res.status, await res.text());
  const body = (await res.json()) as { updates?: { updatedRange?: string } };
  const match = body.updates?.updatedRange?.match(/!A(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function updateInvoiceRow(rowNumber: number, values: unknown[]) {
  const range = `${SHEET_TAB}!A${rowNumber}:Y${rowNumber}`;
  const encodedRange = range.replace(/ /g, "%20");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId(),
  )}/values/${encodedRange}?valueInputOption=USER_ENTERED`;
  const res = await googleFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw sheetsError("update", res.status, await res.text());
}

/**
 * Marks an invoice row as Deleted by writing "Deleted" to column J (status).
 * The row stays in the sheet — the frontend filters Deleted rows out of the
 * dashboard. Uses a targeted single-cell update so n8n-written columns (Asana
 * GID, final status, etc.) are never disturbed.
 */
export async function markInvoiceDeleted(rowNumber: number) {
  const range = `${SHEET_TAB}!J${rowNumber}`;
  const encodedRange = range.replace(/ /g, "%20");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    sheetId(),
  )}/values/${encodedRange}?valueInputOption=USER_ENTERED`;
  const res = await googleFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [["Deleted"]] }),
  });
  if (!res.ok) throw sheetsError("delete", res.status, await res.text());
}

export async function proxyWebhook(envName: string, payload: unknown) {
  const target = optionalEnv(envName, `VITE_${envName}`);
  if (!target) throw new Error(`Missing environment variable ${envName}`);
  return fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function extractDriveFileId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const fileMatch = trimmed.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) return fileMatch[1];
  const idMatch = trimmed.match(/[?&]id=([^&]+)/);
  if (idMatch) return idMatch[1];
  return trimmed;
}

export function driveWebViewLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Bridges Vercel's Node.js function runtime (req, res) with Web-Standard
 * handlers that take a `Request` and return a `Response`. Vercel's Node
 * runtime passes IncomingMessage-style objects with no `.json()` method,
 * so we build a proper Web `Request` from it, call the handler, then
 * stream the `Response` back through `res`.
 */
type WebHandler = (request: Request) => Promise<Response>;

export function adapt(handler: WebHandler) {
  return async (req: any, res?: any) => {
    // If Vercel actually invoked us Web-Standard style, pass through.
    if (res === undefined && typeof req?.json === "function") {
      return handler(req as Request);
    }

    try {
      const host = (req.headers?.host as string) ?? "localhost";
      const proto =
        (req.headers?.["x-forwarded-proto"] as string | undefined) ?? "https";
      const url = `${proto}://${host}${req.url ?? "/"}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers ?? {})) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, String(v));
        } else {
          headers.set(key, String(value));
        }
      }

      const method = (req.method ?? "GET").toUpperCase();
      let body: BodyInit | undefined = undefined;
      if (method !== "GET" && method !== "HEAD") {
        if (req.body !== undefined && req.body !== null) {
          // Vercel pre-parsed the body (object or string)
          body =
            typeof req.body === "string" ? req.body : JSON.stringify(req.body);
          if (typeof req.body !== "string" && !headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }
        } else if (typeof req[Symbol.asyncIterator] === "function") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          if (chunks.length) body = Buffer.concat(chunks);
        }
      }

      const webRequest = new Request(url, {
        method,
        headers,
        body: body as BodyInit | undefined,
        // @ts-ignore — duplex is required by Node when a body is present
        duplex: body !== undefined ? "half" : undefined,
      });

      const response = await handler(webRequest);

      res.statusCode = response.status;
      response.headers.forEach((value: string, key: string) => {
        if (key.toLowerCase() === "set-cookie") {
          const existing = res.getHeader("set-cookie");
          if (Array.isArray(existing)) {
            res.setHeader("set-cookie", [...existing, value]);
          } else if (typeof existing === "string") {
            res.setHeader("set-cookie", [existing, value]);
          } else {
            res.setHeader("set-cookie", value);
          }
        } else {
          res.setHeader(key, value);
        }
      });

      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    } catch (err) {
      console.error("Handler error:", err);
      try {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } catch {
        // res already closed
      }
    }
  };
}
