import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executable, run } from "./process.mjs";

export function patchComparisonOperations(patchFile) {
  return [
    ["read-tree", "HEAD"],
    ["add", "--update"],
    ["apply", "--cached", "--reverse", patchFile],
    ["diff", "--cached", "--quiet", "HEAD"],
  ];
}

export async function checkoutMatchesPatch(checkout, patchFile) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sherpa-patch-index-"));
  const normalizedPatchFile = join(temporaryDirectory, "tracked.patch");
  const environment = {
    GIT_INDEX_FILE: join(temporaryDirectory, "index"),
  };
  const git = (args) => run(executable("git"), args, {
    capture: true,
    cwd: checkout,
    env: environment,
  });

  try {
    const patch = await readFile(patchFile, "utf8");
    await writeFile(normalizedPatchFile, patch.replaceAll("\r\n", "\n"));
    const [readHead, stageCheckout, reversePatch, compareHead] =
      patchComparisonOperations(normalizedPatchFile);
    await git(readHead);
    await git(stageCheckout);
    try {
      await git(reversePatch);
      await git(compareHead);
      return true;
    } catch {
      return false;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
