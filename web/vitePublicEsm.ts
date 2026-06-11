import type { Plugin } from "vite";

const publicEsmPaths = new Set([
  "/wasm/kws/sherpa-onnx-kws-module.js",
  "/wasm/kws/sherpa-onnx-kws.js",
]);

export function rewritePublicEsmRequest(requestUrl: string): string {
  const queryStart = requestUrl.indexOf("?");
  if (queryStart === -1) {
    return requestUrl;
  }

  const pathname = requestUrl.slice(0, queryStart);
  if (!publicEsmPaths.has(pathname)) {
    return requestUrl;
  }

  const parameters = requestUrl.slice(queryStart + 1).split("&");
  const filtered = parameters.filter(
    (parameter) => parameter.split("=", 1)[0] !== "import",
  );
  if (filtered.length === parameters.length) {
    return requestUrl;
  }
  return `${pathname}${filtered.length > 0 ? `?${filtered.join("&")}` : ""}`;
}

export function publicEsmPlugin(): Plugin {
  return {
    name: "kws-public-esm",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const requestWithUrl = request as { url?: string };
        if (requestWithUrl.url) {
          requestWithUrl.url = rewritePublicEsmRequest(requestWithUrl.url);
        }
        next();
      });
    },
  };
}
