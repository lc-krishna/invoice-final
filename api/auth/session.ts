import { json, requireAuth } from "../_utils";

export default async function handler(request: Request) {
  const unauthorized = await requireAuth(request);
  if (unauthorized) return unauthorized;
  return json({ ok: true });
}
