import { adapt, error, fetchSheetInvoices, json, requireAuth } from "./_utils.js";

async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "GET") return error("Method not allowed", 405);
  try {
    return json({ invoices: await fetchSheetInvoices() });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}

export default adapt(handler);
