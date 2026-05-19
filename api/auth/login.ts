import { clearSessionCookie, createSessionCookie, error, json, readJson } from "../_utils.js";

export default async function handler(request: Request) {
  if (request.method !== "POST") return error("Method not allowed", 405);
  const body = await readJson<{ username?: string; password?: string }>(request);
  const expectedUser = process.env.APP_USERNAME ?? "admin";
  const expectedPassword = process.env.APP_PASSWORD ?? "admin@123";
  if (body.username !== expectedUser || body.password !== expectedPassword) {
    return json(
      { error: "Invalid username or password" },
      { status: 401, headers: { "Set-Cookie": clearSessionCookie() } },
    );
  }
  return json(
    { ok: true },
    { headers: { "Set-Cookie": await createSessionCookie(body.username) } },
  );
}
