import { expect, test } from "vitest";

import { rewritePublicEsmRequest } from "../../vitePublicEsm";

test("removes Vite's import marker from generated public ESM requests", () => {
  expect(
    rewritePublicEsmRequest(
      "/wasm/kws/sherpa-onnx-kws-module.js?import&t=123",
    ),
  ).toBe("/wasm/kws/sherpa-onnx-kws-module.js?t=123");
  expect(
    rewritePublicEsmRequest("/wasm/kws/sherpa-onnx-kws.js?import"),
  ).toBe("/wasm/kws/sherpa-onnx-kws.js");
});

test("leaves unrelated public files and query parameters unchanged", () => {
  expect(rewritePublicEsmRequest("/models/kws/manifest.js?import")).toBe(
    "/models/kws/manifest.js?import",
  );
  expect(
    rewritePublicEsmRequest("/wasm/kws/sherpa-onnx-kws.js?v=1"),
  ).toBe("/wasm/kws/sherpa-onnx-kws.js?v=1");
});
