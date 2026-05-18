import { readFileSync, existsSync } from "node:fs";

function parseDotEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFileIfPresent() {
  const envPath = ".env";
  if (!existsSync(envPath)) return {};
  try {
    const content = readFileSync(envPath, "utf8");
    return parseDotEnv(content);
  } catch {
    return {};
  }
}

const fileEnv = loadEnvFileIfPresent();
const sheetId = process.env.VITE_SHEET_ID || fileEnv.VITE_SHEET_ID;
const apiKey = process.env.VITE_GOOGLE_API_KEY || fileEnv.VITE_GOOGLE_API_KEY;
const tab = process.env.SHEET_TAB || "Invoice Log";

if (!sheetId || !apiKey) {
  console.error(
    "Missing VITE_SHEET_ID or VITE_GOOGLE_API_KEY. Set env vars or add them in .env.",
  );
  process.exit(2);
}

const expectedHeaders = [
  ["S. No."],
  ["Timestamp (CDT)"],
  ["Community"],
  ["Community Asana GID"],
  ["Task Name"],
  ["Vendor (Claude)"],
  ["Invoice #"],
  ["Amount"],
  ["Payment Method"],
  ["Status"],
  ["Melio Email"],
  ["Community Folder ID"],
  ["Drive File ID (webview link)"],
  ["RM Bill ID"],
  ["RM Bill Upload Status"],
  ["RM Bill Upload Error"],
  ["RM Attachment Status"],
  ["RM Attachment Error"],
  ["Drive Vendor Folder ID (confirmed subfolder)", "Drive Vendor Folder ID"],
  ["Drive Vendor File ID (after move)", "Drive Vendor File ID"],
  ["Drive Upload Status"],
  ["Drive Upload Error"],
  ["Asana Task GID"],
  ["Asana Task URL"],
  ["Final Status"],
];

const range = `${tab}!A1:Y1`;
const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
  sheetId,
)}/values/${range}?key=${encodeURIComponent(apiKey)}&majorDimension=ROWS`;

const response = await fetch(url);
if (!response.ok) {
  const body = await response.text().catch(() => "");
  console.error(`Sheets API ${response.status}: ${body || response.statusText}`);
  process.exit(3);
}

const payload = await response.json();
const actualHeaders = payload?.values?.[0] ?? [];

const mismatches = expectedHeaders
  .map((accepted, idx) => ({
    column: String.fromCharCode(65 + idx),
    expected: accepted.join(" | "),
    actual: actualHeaders[idx] ?? "",
  }))
  .filter((row, idx) => !expectedHeaders[idx].includes(row.actual));

if (mismatches.length > 0) {
  console.error(`Header mismatch found in ${mismatches.length} column(s):`);
  console.table(mismatches);
  process.exit(1);
}

console.log("Headers match expected schema (A:Y).");
