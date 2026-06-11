import assert from "node:assert/strict";
import test from "node:test";

import { windowsBatchInvocation } from "./process.mjs";

test("Windows batch commands preserve cmd.exe quoting", () => {
  const invocation = windowsBatchInvocation(
    String.raw`D:\Working\kws_online_service\.toolchains\emsdk\emsdk.bat`,
    ["install", "4.0.23"],
    String.raw`C:\Windows\System32\cmd.exe`,
  );

  assert.deepEqual(invocation, {
    command: String.raw`C:\Windows\System32\cmd.exe`,
    args: [
      "/d",
      "/s",
      "/c",
      String.raw`call "D:\Working\kws_online_service\.toolchains\emsdk\emsdk.bat" "install" "4.0.23"`,
    ],
    windowsVerbatimArguments: true,
  });
});
