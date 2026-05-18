import server from "../dist/server/server.js";

export default async function handler(request: Request) {
  return server.fetch(request);
}
