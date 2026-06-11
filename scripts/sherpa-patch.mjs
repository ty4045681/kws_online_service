import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executable, run } from "./process.mjs";

export async function checkoutMatchesPatch(checkout, patchFile) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sherpa-patch-index-"));
  const environment = {
    GIT_INDEX_FILE: join(temporaryDirectory, "index"),
  };
  const git = (args) => run(executable("git"), args, {
    cwd: checkout,
    env: environment,
  });

  try {
    await git(["read-tree", "HEAD"]);
    await git(["apply", "--cached", patchFile]);
    try {
      await git(["diff", "--quiet"]);
      return true;
    } catch {
      return false;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
