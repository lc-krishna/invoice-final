import { adapt, clearSessionCookie, json } from "../_utils.js";

async function handler() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}

export default adapt(handler);
