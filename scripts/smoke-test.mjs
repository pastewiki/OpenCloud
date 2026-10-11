// Packs the library, installs the tarball into a clean temporary project, and
// verifies that it imports and type-checks as a consumer would see it.
// Run after `npm run build`: `node scripts/smoke-test.mjs`.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "inherit"],
    shell: isWindows,
  }).toString();

const work = mkdtempSync(join(tmpdir(), "roblox-sdk-smoke-"));
try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", work], root));
  const tarball = join(work, packed[0].filename);
  const files = packed[0].files.map((f) => f.path);
  console.log(`Packed ${packed[0].filename} (${files.length} files)`);
  const unexpected = files.filter(
    (f) => !/^(dist\/|README\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(f),
  );
  if (unexpected.length > 0)
    throw new Error(`Unexpected files in package: ${unexpected.join(", ")}`);

  const app = join(work, "app");
  mkdirSync(app);
  writeFileSync(
    join(app, "package.json"),
    JSON.stringify({ name: "smoke-app", private: true, type: "module" }, null, 2),
  );
  run("npm", ["install", "--no-audit", "--no-fund", tarball, `typescript@${tsVersion()}`], app);

  writeFileSync(
    join(app, "index.mjs"),
    `import { RobloxOpenCloud, RateLimitError, Paginator } from "@roblox-open-cloud/sdk";
const client = new RobloxOpenCloud({ apiKey: "smoke-test-key-not-real", fetch: async () => new Response(JSON.stringify({ path: "universes/1" }), { status: 200 }) });
const u = await client.universes.get({ universeId: 1 });
if (u.path !== "universes/1") throw new Error("unexpected response");
if (typeof RateLimitError !== "function" || typeof Paginator !== "function") throw new Error("missing exports");
console.log("ESM import OK");
`,
  );
  console.log(run("node", ["index.mjs"], app).trim());

  writeFileSync(
    join(app, "check.ts"),
    `import { RobloxOpenCloud, type DataStoreEntry, type ApiError } from "@roblox-open-cloud/sdk";
const client = new RobloxOpenCloud({ apiKey: "x".repeat(20) });
const entry: Promise<DataStoreEntry<{ coins: number }>> = client.dataStores.getEntry<{ coins: number }>({ universeId: "1", dataStoreId: "s", entryId: "k" });
export type E = ApiError["status"];
void entry;
`,
  );
  writeFileSync(
    join(app, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ["ES2023", "DOM"],
        target: "ES2022",
        types: [],
      },
      files: ["check.ts"],
    }),
  );
  run(join("node_modules", ".bin", isWindows ? "tsc.cmd" : "tsc"), ["-p", "."], app);
  console.log("TypeScript declarations OK");
} finally {
  rmSync(work, { recursive: true, force: true });
}

function tsVersion() {
  return JSON.parse(
    run("node", ["-p", "JSON.stringify(require('typescript/package.json').version)"], root),
  );
}
