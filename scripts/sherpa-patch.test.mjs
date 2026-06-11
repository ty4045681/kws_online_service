import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  checkoutMatchesPatch,
  patchComparisonOperations,
} from "./sherpa-patch.mjs";

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8" });
}

test("patch comparison reverses the patch from the current checkout", () => {
  assert.deepEqual(patchComparisonOperations("tracked.patch"), [
    ["read-tree", "HEAD"],
    ["add", "--update"],
    ["apply", "--cached", "--reverse", "tracked.patch"],
    ["diff", "--cached", "--quiet", "HEAD"],
  ]);
});

test("patch matching ignores diff presentation config but rejects extra changes", async () => {
  const checkout = await mkdtemp(join(tmpdir(), "sherpa-patch-test-"));
  const patchFile = join(checkout, "tracked.patch");
  const sourceFile = join(checkout, "source.txt");

  try {
    await git(checkout, ["init"]);
    await git(checkout, ["config", "user.email", "test@example.com"]);
    await git(checkout, ["config", "user.name", "Test User"]);
    await writeFile(sourceFile, "before\n");
    await git(checkout, ["add", "source.txt"]);
    await git(checkout, ["commit", "-m", "initial"]);

    await writeFile(sourceFile, "after\n");
    const { stdout: trackedPatch } = await git(checkout, ["diff", "--binary"]);
    await writeFile(patchFile, trackedPatch);
    await git(checkout, ["config", "diff.noprefix", "true"]);

    const { stdout: configuredDiff } = await git(checkout, ["diff", "--binary"]);
    assert.notEqual(configuredDiff, trackedPatch);
    assert.equal(await checkoutMatchesPatch(checkout, patchFile), true);

    await writeFile(sourceFile, "after\nextra\n");
    assert.equal(await checkoutMatchesPatch(checkout, patchFile), false);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test("patch matching accepts a CRLF patch applied to an autocrlf checkout", async () => {
  const checkout = await mkdtemp(join(tmpdir(), "sherpa-patch-crlf-test-"));
  const patchFile = join(checkout, "tracked.patch");
  const sourceFile = join(checkout, "source.txt");

  try {
    await git(checkout, ["init"]);
    await git(checkout, ["config", "user.email", "test@example.com"]);
    await git(checkout, ["config", "user.name", "Test User"]);
    await git(checkout, ["config", "core.autocrlf", "true"]);
    await writeFile(sourceFile, "before\n");
    await git(checkout, ["add", "source.txt"]);
    await git(checkout, ["commit", "-m", "initial"]);

    await writeFile(sourceFile, "after\n");
    const { stdout: trackedPatch } = await git(checkout, ["diff", "--binary"]);
    await git(checkout, ["checkout", "--", "source.txt"]);
    await writeFile(patchFile, trackedPatch.replaceAll("\n", "\r\n"));
    await git(checkout, ["apply", patchFile]);

    assert.equal(await checkoutMatchesPatch(checkout, patchFile), true);
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});
