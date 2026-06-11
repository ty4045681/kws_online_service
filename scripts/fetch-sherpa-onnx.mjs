import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executable, run } from "./process.mjs";
import { checkoutMatchesPatch } from "./sherpa-patch.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkout = resolve(root, "third_party/sherpa-onnx");
const pinFile = resolve(root, "third_party/sherpa-onnx.commit");
const patchFile = resolve(
  root,
  "patches/sherpa-onnx/0001-expose-partial-kws-result.patch",
);
const repository = "https://github.com/k2-fsa/sherpa-onnx.git";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function git(args, options = {}) {
  return run(executable("git"), args, { ...options, cwd: checkout });
}

async function main() {
  const sourceSha = (await readFile(pinFile, "utf8")).trim();
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error(`Invalid sherpa-onnx source SHA in ${pinFile}`);
  }
  if (!(await exists(patchFile))) {
    throw new Error(`Missing tracked sherpa-onnx patch: ${patchFile}`);
  }

  if (!(await exists(resolve(checkout, ".git")))) {
    await run(executable("git"), ["clone", "--no-checkout", repository, checkout], {
      cwd: root,
    });
    await git(["checkout", "--detach", sourceSha]);
  }

  const head = (await git(["rev-parse", "HEAD"], { capture: true })).stdout.trim();
  if (head !== sourceSha) {
    throw new Error(
      `Generated sherpa-onnx checkout is at ${head}; expected ${sourceSha}. ` +
        "Remove third_party/sherpa-onnx and run this command again.",
    );
  }

  const currentDiff = (await git(["diff", "--binary"], { capture: true })).stdout;
  if (currentDiff.trim()) {
    if (!(await checkoutMatchesPatch(checkout, patchFile))) {
      throw new Error(
        "Generated sherpa-onnx checkout has changes that do not match the tracked patch",
      );
    }
    console.log(`sherpa-onnx ${sourceSha} is ready`);
    return;
  }

  await git(["apply", "--check", patchFile]);
  await git(["apply", patchFile]);
  console.log(`Fetched and patched sherpa-onnx ${sourceSha}`);
}

await main();
