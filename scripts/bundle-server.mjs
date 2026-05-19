/**
 * Pre-bundles dist/server/server.js (and all its local ./assets/* imports)
 * into a single dist/server/server-bundle.js that has no dynamic local imports.
 *
 * This is required for Vercel: when esbuild compiles api/index.ts it inlines
 * server.js, but the dynamic import("./assets/...") calls break because the
 * assets aren't present relative to the bundled function output.
 * By pre-bundling here (npm packages kept external), we collapse all local
 * asset chunks into one file before Vercel ever touches it.
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
  packages: "external",
  logLevel: "info",
});
