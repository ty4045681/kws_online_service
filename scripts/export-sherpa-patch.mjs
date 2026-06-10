import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executable, run } from "./process.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkout = resolve(root, "third_party/sherpa-onnx");
const output = resolve(
  root,
  "patches/sherpa-onnx/0001-expose-partial-kws-result.patch",
);

const { stdout } = await run(executable("git"), ["diff", "--binary"], {
  cwd: checkout,
  capture: true,
});
if (!stdout.trim()) {
  throw new Error("The generated sherpa-onnx checkout has no changes to export");
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, stdout.replaceAll("\r\n", "\n"));
const sha256 = createHash("sha256").update(stdout).digest("hex");
console.log(`Wrote ${output}`);
console.log(`Patch SHA-256: ${sha256}`);
