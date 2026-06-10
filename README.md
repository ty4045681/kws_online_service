# Browser-Local Keyword Spotting

This project provides a browser application for local keyword spotting (KWS). Microphone audio and inference stay in the browser. The application will download its versioned model assets automatically; users do not upload model files.

The project targets current Windows and Linux environments and requires Node.js 22.

```text
npm --prefix web install
npm run dev
npm run test
npm run build
```

The React/Vite scaffold and cross-platform tooling are in place. The sherpa-onnx WebAssembly runtime and model integration are implemented in later tasks.

## Model package

Package the five required model files for browser delivery with:

```text
npm run model:package -- --source "web/tests/fixtures/model-source" --model-id fixture-kws --model-version v1 --sample-rate 16000 --feature-dim 80
```

The command publishes the versioned files under `web/public/models/kws/` and writes `web/public/models/kws/model-manifest.json` last. In production, the browser loads `/models/kws/model-manifest.json` and automatically downloads and verifies its model assets; there is no model upload or file-picker flow. The cache tracks one active manifest version at a time, while asset keys include the model ID, version, and asset name. The packaged fixture demonstrates asset delivery only and does not provide completed KWS inference or WebAssembly integration.
