# Browser-Local Keyword Spotting

This project provides a browser application for local keyword spotting (KWS). Microphone audio and inference stay in the browser. The application will download its versioned model assets automatically; users do not upload model files.

The project targets current Windows and Linux environments and requires Node.js 22.

Install dependencies once, then use the deterministic mock engine for immediate
UI development:

```text
npm --prefix web install
npm run dev:mock
```

The production path uses a dedicated Worker, sherpa-onnx WebAssembly, and the
automatically downloaded model package. Build its pinned runtime with:

```text
npm run sherpa:build
npm run dev
```

`sherpa:build` downloads/reuses Emscripten 4.0.23, checks out the pinned
sherpa-onnx revision, applies the tracked partial-result patch, and publishes
the generated JS/WASM files under `web/public/wasm/kws/`. The Node orchestration
uses native process APIs and supports current Windows and Linux environments
without WSL.

The runtime uses WebAssembly threads because the upstream ONNX Runtime WASM
static library is built with pthread/atomics support. Production hosting must
send `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`; the included Vite development and
preview servers already send both headers.

## Model package

Put `encoder.onnx`, `decoder.onnx`, `joiner.onnx`, `tokens.txt`, and
`keywords.txt` in one source directory, then package them for browser delivery:

```text
npm run model:package -- --source "model-source/kws" --model-id eva-kws --model-version v1 --sample-rate 16000 --feature-dim 80
```

The command publishes versioned files under `web/public/models/kws/` and writes
`web/public/models/kws/model-manifest.json` last. The browser loads that manifest,
downloads and SHA-256 verifies every asset, and caches the active version. There
is no model upload or file-picker flow.

`keywords.txt` must use sherpa-onnx KWS token syntax for the supplied
`tokens.txt`. The production engine uses this file unchanged at startup. Applying
keyword changes in the settings panel rebuilds the keyword spotter in the
existing WASM module.

## Verification

```text
npm test
npm run build
npm --prefix web run lint
```
