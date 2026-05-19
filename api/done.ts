import {
  adapt,
  error,
  json,
  proxyWebhook,
  readJson,
  requireAuth,
  updateInvoiceRow,
} from "./_utils.js";

async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const payload = await readJson<{
      source?: "sheet" | "manual";
      rowNumber?: number;
      sheetRow?: unknown[];
    }>(request);
    if (payload.source === "manual") {
      if (!payload.rowNumber || !Array.isArray(payload.sheetRow)) {
        return error("Manual done requires rowNumber and sheetRow");
      }
      await updateInvoiceRow(payload.rowNumber, payload.sheetRow.slice(0, 25));
      return json({ ok: true });
    }
    const res = await proxyWebhook("N8N_WEBHOOK_DONE", payload);
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "text/plain" },
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}

export default adapt(handler);
