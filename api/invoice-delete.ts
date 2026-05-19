import {
  adapt,
  error,
  json,
  markInvoiceDeleted,
  readJson,
  requireAuth,
} from "./_utils.js";

async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const body = await readJson<{ rowNumber?: number }>(request);
    if (!body.rowNumber || body.rowNumber < 2) {
      return error("Missing or invalid rowNumber");
    }
    await markInvoiceDeleted(body.rowNumber);
    return json({ ok: true });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}

export default adapt(handler);
