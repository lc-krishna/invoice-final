import { adapt, json, requireAuth } from "../_utils.js";

async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  return json({ ok: true });
}

export default adapt(handler);
