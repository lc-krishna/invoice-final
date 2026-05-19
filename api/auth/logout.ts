import { clearSessionCookie, json } from "../_utils.js";

export default async function handler() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
