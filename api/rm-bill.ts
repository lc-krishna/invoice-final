import { error, json, proxyWebhook, readJson, requireAuth } from "./_utils";

export default async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  if (request.method !== "POST") return error("Method not allowed", 405);
  try {
    const payload = await readJson<unknown>(request);
    const res = await proxyWebhook("N8N_WEBHOOK_RM", payload);
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "text/plain" },
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
}
