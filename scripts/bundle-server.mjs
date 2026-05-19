/**
 * Produces a fully self-contained dist/server/server-bundle.js.
 *
 * Bundles dist/server/server.js together with:
 *   - all local ./assets/* chunks (dynamic imports inlined)
 *   - all npm packages (react, h3-v2, @tanstack/*, etc.)
 *
 * Only Node.js built-ins (node:*) remain external — they are always
 * present in any Node.js runtime, including Vercel's Lambda.
 *
 * This avoids runtime failures caused by transitive npm packages
 * (h3-v2, seroval, @tanstack/router-core, etc.) not being resolvable
 * from the Lambda function root when marked as external.
 */
import { build } from "esbuild";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [resolve(root, "dist/server/server.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: resolve(root, "dist/server/server-bundle.js"),
  // Only keep Node.js built-ins external — everything else (npm + local) is inlined
  external: ["node:*"],
  logLevel: "info",
});
