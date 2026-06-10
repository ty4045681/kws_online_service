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
