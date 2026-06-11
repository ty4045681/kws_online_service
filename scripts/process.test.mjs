import assert from "node:assert/strict";
import test from "node:test";

import { run, windowsBatchInvocation } from "./process.mjs";

test("Windows batch commands are sent through stdin instead of argv", () => {
  const invocation = windowsBatchInvocation(
    String.raw`D:\Working\kws_online_service\.toolchains\emsdk\emsdk.bat`,
    ["install", "4.0.23"],
    String.raw`C:\Windows\System32\cmd.exe`,
  );

  assert.deepEqual(invocation, {
    command: String.raw`C:\Windows\System32\cmd.exe`,
    args: ["/d", "/q"],
    input: String.raw`call "D:\Working\kws_online_service\.toolchains\emsdk\emsdk.bat" "install" "4.0.23"` +
      "\r\nexit /b %errorlevel%\r\n",
  });
});

test("run writes configured input to the child process", async () => {
  const { stdout } = await run(process.execPath, [
    "-e",
    "process.stdin.pipe(process.stdout)",
  ], {
    capture: true,
    input: "hello from stdin",
  });

  assert.equal(stdout, "hello from stdin");
});
