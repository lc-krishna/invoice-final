import server from "../dist/server/server-bundle.js";

export default async function handler(request: Request) {
  return server.fetch(request);
}
