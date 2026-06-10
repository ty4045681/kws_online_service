# Browser-Local KWS UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished Windows/Linux-compatible Web application that automatically downloads a versioned Zipformer KWS model package, runs sherpa-onnx locally in WebAssembly, visualizes microphone audio, exposes true partial beam matches, and dispatches wake-word events.

**Architecture:** React/Vite owns the UI and state machine. AudioWorklet writes PCM to a `SharedArrayBuffer`; an analysis Worker resamples to 16 kHz and computes waveform color data; a dedicated WASM Worker runs sherpa-onnx. A manifest-driven asset manager downloads and verifies model files without user uploads. The UI is developed against a deterministic mock engine before the real WASM adapter is connected.

**Tech Stack:** React, TypeScript, Vite, Canvas 2D, Web Audio API, AudioWorklet, Web Workers, SharedArrayBuffer, Cache Storage, Web Crypto, sherpa-onnx, Emscripten 4.0.23, Vitest, Playwright, GitHub Actions on Windows and Linux.

---

## Testing Policy

Keep tests intentionally small. Automate only the boundaries most likely to break:

1. Model manifest generation, automatic download, cache hit, and SHA-256 rejection.
2. Partial/Expired/Detected state transitions and revision handling.
3. PCM ring-buffer ordering/overflow and 48 kHz to 16 kHz streaming resampling.
4. One browser main-flow test using the mock engine.
5. A 3-to-5-file Native/WASM comparison script.
6. Windows and Linux build CI.

Do not create separate tests for every visual component, animation, settings field, or error card. Validate those in one browser review and a short manual microphone checklist.

## Repository Layout

```text
kws_online_service/
├── .github/workflows/ci.yml
├── docs/
├── model-source/kws/                  # local deployment input; ignored
├── patches/sherpa-onnx/
│   └── 0001-expose-partial-kws-result.patch
├── scripts/
│   ├── process.mjs
│   ├── fetch-sherpa-onnx.mjs
│   ├── export-sherpa-patch.mjs
│   ├── build-sherpa-wasm.mjs
│   ├── verify-kws-consistency.mjs
│   └── verify-release.mjs
├── third_party/
│   ├── sherpa-onnx/                   # generated checkout; ignored
│   └── sherpa-onnx.commit
└── web/
    ├── public/models/kws/             # generated; ignored
    ├── public/wasm/kws/               # generated; ignored
    ├── scripts/build-model-package.mjs
    ├── src/
    │   ├── app/
    │   ├── audio/
    │   ├── components/
    │   ├── kws/
    │   ├── model/
    │   ├── styles/
    │   └── workers/
    └── e2e/main-flow.spec.ts
```

Canonical commands are npm scripts or `node scripts/*.mjs`. Native Windows support must not depend on WSL, Bash, executable bits, or POSIX path syntax.

### Task 1: Initialize the Cross-Platform Project

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `package.json`
- Create: `README.md`
- Create: `scripts/process.mjs`
- Create: `web/` with the Vite React TypeScript template
- Modify: `web/package.json`
- Modify: `web/vite.config.ts`
- Create: `web/vitest.config.ts`
- Create: `web/src/test/setup.ts`
- Create: `web/playwright.config.ts`

- [ ] **Step 1: Initialize Git and create platform-safe metadata**

Run:

```text
git init -b main
```

Create `.gitignore`:

```gitignore
.DS_Store
.idea/workspace.xml
.superpowers/
.toolchains/
node_modules/
web/node_modules/
web/dist/
web/playwright-report/
web/test-results/
web/public/models/kws/
web/public/wasm/kws/
model-source/kws/*
!model-source/kws/.gitkeep
third_party/sherpa-onnx/
third_party/sherpa-onnx-build/
```

Create `.gitattributes`:

```gitattributes
* text=auto
*.mjs text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.json text eol=lf
*.txt text
*.onnx binary
*.wasm binary
*.png binary
*.wav binary
```

Create empty `model-source/kws/.gitkeep` and `third_party/.gitkeep`.

- [ ] **Step 2: Scaffold and install the frontend**

Run:

```text
npm create vite@7 web -- --template react-ts
npm --prefix web install
npm --prefix web install -D vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

Expected: `web/package-lock.json` exists and commands exit with code 0.

- [ ] **Step 3: Add root-level cross-platform commands**

Create root `package.json`:

```json
{
  "name": "kws-online-service",
  "private": true,
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "dev": "npm --prefix web run dev",
    "test": "npm --prefix web test",
    "build": "npm --prefix web run build",
    "test:e2e": "npm --prefix web run test:e2e",
    "model:package": "npm --prefix web run model:package --",
    "sherpa:fetch": "node scripts/fetch-sherpa-onnx.mjs",
    "sherpa:build": "node scripts/build-sherpa-wasm.mjs",
    "verify:kws": "node scripts/verify-kws-consistency.mjs",
    "verify:release": "node scripts/verify-release.mjs"
  }
}
```

Update `web/package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run --passWithNoTests",
    "test:e2e": "playwright test",
    "model:package": "node scripts/build-model-package.mjs"
  }
}
```

- [ ] **Step 4: Add a shell-free process runner**

Create `scripts/process.mjs`:

```javascript
import { spawn } from "node:child_process";

export function executable(name) {
  return process.platform === "win32" && !name.endsWith(".exe")
    ? `${name}.exe`
    : name;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}\n${stderr}`));
    });
  });
}

export function runWindowsBatch(file, args, options = {}) {
  if (process.platform !== "win32") return run(file, args, options);
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const commandLine = ["call", quote(file), ...args.map(quote)].join(" ");
  return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], options);
}
```

- [ ] **Step 5: Configure tests and cross-origin isolation**

Create `web/vitest.config.ts` and `web/src/test/setup.ts`:

```typescript
// web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"] },
});
```

```typescript
// web/src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

Replace `web/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: { headers },
  preview: { headers },
  worker: { format: "es" },
});
```

- [ ] **Step 6: Verify the empty scaffold builds**

Run:

```text
npm run test
npm run build
```

Expected: Vitest exits successfully with no tests and Vite builds.

- [ ] **Step 7: Commit**

```text
git add .
git commit -m "chore: scaffold cross-platform kws web app"
```

### Task 2: Implement Automatic Model Packaging and Loading

**Files:**
- Create: `web/src/model/manifest.ts`
- Create: `web/src/model/modelAssetManager.ts`
- Create: `web/src/model/modelAssets.test.ts`
- Create: `web/scripts/build-model-package.mjs`
- Create: `web/tests/fixtures/model-source/*`
- Modify: `README.md`

- [ ] **Step 1: Write one focused model-assets test file**

Create `web/src/model/modelAssets.test.ts` with three tests. The manager accepts injected manifest/asset loaders and a small cache interface so the tests do not need a mock-server dependency:

```typescript
import { describe, expect, test } from "vitest";
import { modelAssetNames, parseModelManifest, type ModelAssetName, type ModelManifest } from "./manifest";
import { ModelAssetManager, type ModelCache } from "./modelAssetManager";

const encoder = new TextEncoder();

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fixture(): Promise<{
  manifest: ModelManifest;
  bytes: Record<ModelAssetName, ArrayBuffer>;
}> {
  const bytes = Object.fromEntries(
    modelAssetNames.map((name) => [name, encoder.encode(name).buffer]),
  ) as Record<ModelAssetName, ArrayBuffer>;
  const files = Object.fromEntries(await Promise.all(modelAssetNames.map(async (name) => [
    name,
    {
      url: `/models/kws/eva/v1/${name}.${name === "tokens" || name === "keywords" ? "txt" : "onnx"}`,
      size: bytes[name].byteLength,
      sha256: await sha256(bytes[name]),
    },
  ]))) as ModelManifest["files"];
  return {
    manifest: { schemaVersion: 1, modelId: "eva", version: "v1", sampleRate: 16000, featureDim: 80, files },
    bytes,
  };
}

class MemoryCache implements ModelCache {
  active?: string;
  values = new Map<string, ArrayBuffer>();
  async read(key: string) { return this.values.get(key)?.slice(0); }
  async write(key: string, value: ArrayBuffer) { this.values.set(key, value.slice(0)); }
  async activate(version: string) { this.active = version; }
  async activeVersion() { return this.active; }
  async removeVersionsExcept() {}
}

describe("model assets", () => {
  test("rejects a non-SHA256 hash", async () => {
    const { manifest } = await fixture();
    manifest.files.encoder.sha256 = "bad";
    expect(() => parseModelManifest(manifest)).toThrow(/sha256/i);
  });

  test("downloads once, then uses the active cache", async () => {
    const { manifest, bytes } = await fixture();
    const cache = new MemoryCache();
    let assetReads = 0;
    const manager = new ModelAssetManager({
      loadManifest: async () => manifest,
      loadAsset: async (name) => { assetReads += 1; return bytes[name].slice(0); },
      cache,
      digest: sha256,
    });
    const first = await manager.load();
    const second = await manager.load();
    expect(first.source).toBe("network");
    expect(second.source).toBe("cache");
    expect(assetReads).toBe(5);
  });

  test("rejects a hash mismatch and keeps the prior active version", async () => {
    const { manifest, bytes } = await fixture();
    const cache = new MemoryCache();
    const manager = new ModelAssetManager({
      loadManifest: async () => manifest,
      loadAsset: async (name) => bytes[name].slice(0),
      cache,
      digest: sha256,
    });
    const result = await manager.load();
    expect(result.source).toBe("network");
    const v2 = structuredClone(manifest);
    v2.version = "v2";
    v2.files.encoder.sha256 = "0".repeat(64);
    manager.setManifestLoader(async () => v2);
    await expect(manager.load()).rejects.toMatchObject({ code: "ASSET_HASH_MISMATCH" });
    expect(await cache.activeVersion()).toBe("v1");
  });
});
```

The test helper can use a small in-memory `CacheStorage` fake and tiny text fixture files; do not add a general mock-server framework.

- [ ] **Step 2: Run the test to verify failure**

```text
npm --prefix web exec -- vitest run src/model/modelAssets.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the manifest contract**

Create `web/src/model/manifest.ts`:

```typescript
export const modelAssetNames = ["encoder", "decoder", "joiner", "tokens", "keywords"] as const;
export type ModelAssetName = (typeof modelAssetNames)[number];

export interface ModelAsset {
  url: string;
  size: number;
  sha256: string;
}

export interface ModelManifest {
  schemaVersion: 1;
  modelId: string;
  version: string;
  sampleRate: number;
  featureDim: number;
  files: Record<ModelAssetName, ModelAsset>;
}

export function parseModelManifest(input: unknown): ModelManifest {
  if (!input || typeof input !== "object") throw new Error("Invalid manifest");
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1) throw new Error("Invalid schemaVersion");
  if (typeof value.modelId !== "string" || typeof value.version !== "string") throw new Error("Invalid model identity");
  if (!Number.isInteger(value.sampleRate) || !Number.isInteger(value.featureDim)) throw new Error("Invalid model dimensions");
  const files = value.files as Record<string, Record<string, unknown>>;
  for (const name of modelAssetNames) {
    const file = files?.[name];
    if (!file || typeof file.url !== "string" || !file.url.startsWith("/models/kws/")) throw new Error(`Invalid ${name} url`);
    if (!Number.isInteger(file.size) || Number(file.size) <= 0) throw new Error(`Invalid ${name} size`);
    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid ${name} sha256`);
  }
  return input as ModelManifest;
}
```

- [ ] **Step 4: Implement the cross-platform package generator**

Create `web/scripts/build-model-package.mjs`. It must accept:

```text
--source <directory>
--model-id <id>
--model-version <version>
--sample-rate <number>
--feature-dim <number>
```

Use `node:path.resolve`, `node:fs/promises`, `createReadStream`, `pipeline`, and `createHash("sha256")`. Require the five expected files, copy into a temporary version directory, compute size/hash, rename into `public/models/kws/<id>/<version>`, then write `/public/models/kws/model-manifest.json` last.

Fixture command:

```text
npm run model:package -- --source "web/tests/fixtures/model-source" --model-id fixture-kws --model-version v1 --sample-rate 16000 --feature-dim 80
```

This command must work when the source path contains spaces and when text fixtures use CRLF.

- [ ] **Step 5: Implement the asset manager**

Create `web/src/model/modelAssetManager.ts` with:

```typescript
export interface ModelCache {
  read(key: string): Promise<ArrayBuffer | undefined>;
  write(key: string, value: ArrayBuffer): Promise<void>;
  activate(version: string): Promise<void>;
  activeVersion(): Promise<string | undefined>;
  removeVersionsExcept(version: string): Promise<void>;
}

export interface ModelAssetManagerDependencies {
  loadManifest: () => Promise<unknown>;
  loadAsset: (name: ModelAssetName, asset: ModelAsset) => Promise<ArrayBuffer>;
  cache: ModelCache;
  digest: (bytes: ArrayBuffer) => Promise<string>;
}

export interface LoadedModelPackage {
  manifest: ModelManifest;
  assets: Record<ModelAssetName, ArrayBuffer>;
  source: "network" | "cache" | "mixed";
}

export interface ModelAssetManagerApi {
  setManifestLoader(loader: () => Promise<unknown>): void;
  load(onProgress?: (event: {
    asset: ModelAssetName;
    phase: "download" | "verify";
    loaded: number;
    total: number;
  }) => void): Promise<LoadedModelPackage>;
}
```

Export a concrete `ModelAssetManager` class implementing this API and accepting `ModelAssetManagerDependencies` in its constructor. Provide browser-default dependencies that fetch `/models/kws/model-manifest.json` with `cache: "no-store"`, use Cache Storage, and calculate SHA-256 with Web Crypto. Download at most two files concurrently. Verify byte length and hash before writing. Activate the version only after all five files pass. Keep the old active version if any new file fails. Never expose an upload or file-picker API.

- [ ] **Step 6: Run the focused tests and package fixture**

```text
npm --prefix web exec -- vitest run src/model/modelAssets.test.ts
npm run model:package -- --source "web/tests/fixtures/model-source" --model-id fixture-kws --model-version v1 --sample-rate 16000 --feature-dim 80
```

Expected: four tests pass and a valid manifest is generated.

- [ ] **Step 7: Commit**

```text
git add README.md web/src/model web/scripts web/tests
git commit -m "feat: package and load kws model assets automatically"
```

### Task 3: Implement Runtime State and the Mock KWS Boundary

**Files:**
- Create: `web/src/app/protocol.ts`
- Create: `web/src/app/state.ts`
- Create: `web/src/app/state.test.ts`
- Create: `web/src/kws/KwsEngine.ts`
- Create: `web/src/kws/MockKwsEngine.ts`
- Create: `web/src/workers/kws.worker.ts`

- [ ] **Step 1: Write one state-transition test**

Create `web/src/app/state.test.ts`:

```typescript
import { expect, test } from "vitest";
import { initialState, reduce } from "./state";

test("handles partial, ignores stale expiry, then detects", () => {
  const partial = reduce(initialState, {
    type: "partial",
    keyword: "hey eva",
    tokens: ["HEY"],
    startSample: 6720,
    endSample: 11360,
    matchedTokenCount: 1,
    keywordTokenCount: 2,
    revision: 18,
  });
  const stale = reduce(partial, { type: "expired", revision: 17, startSample: 6000, endSample: 9000 });
  expect(stale.match.kind).toBe("partial");
  const detected = reduce(stale, {
    type: "detected",
    keyword: "hey eva",
    tokens: ["HEY", "EVA"],
    tokenTimestamps: [0.42, 0.76],
    startTime: 0.42,
    endTime: 1.08,
  });
  expect(detected.match.kind).toBe("detected");
});
```

- [ ] **Step 2: Define the Worker protocol**

Create the discriminated union from the approved specification, including `engine-progress`, `engine-ready`, `audio-frame`, `partial`, `expired`, `partial-reset`, `detected`, `diagnostics`, and `error`.

- [ ] **Step 3: Implement the reducer**

Use phase values:

```typescript
export type AppPhase =
  | "boot"
  | "loading-models"
  | "ready-for-microphone"
  | "requesting-permission"
  | "listening"
  | "stopped"
  | "recoverable-error";
```

Keep `match` separate from `phase`. Only expire the active matching revision. `partial-reset` clears match state. `detected` replaces any prior partial/expired state.

- [ ] **Step 4: Add the engine interface and deterministic mock**

Create `web/src/kws/KwsEngine.ts`:

```typescript
export interface KwsEngine {
  initialize(input: {
    manifest: ModelManifest;
    assets: Record<ModelAssetName, ArrayBuffer>;
    emit: (message: WorkerMessage) => void;
  }): Promise<void>;
  acceptWaveform(samples: Float32Array, sampleRate: number): void;
  rebuildKeywordStream(keywordsText: string): Promise<void>;
  reset(): void;
  destroy(): void;
}
```

`MockKwsEngine` emits scripted events by cumulative sample count. Use it for local UI development and Playwright. The production build selects sherpa; no query parameter may enable mock mode.

- [ ] **Step 5: Implement the Worker wrapper**

`web/src/workers/kws.worker.ts` receives model assets, PCM chunks, settings updates, reset, and stop. It constructs the selected engine and forwards only typed `WorkerMessage` values.

- [ ] **Step 6: Run the single state test**

```text
npm --prefix web exec -- vitest run src/app/state.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```text
git add web/src/app web/src/kws web/src/workers/kws.worker.ts
git commit -m "feat: add kws runtime state and mock engine"
```

### Task 4: Implement the Microphone Audio Pipeline

**Files:**
- Create: `web/src/audio/sharedPcmRing.ts`
- Create: `web/src/audio/streamingResampler.ts`
- Create: `web/src/audio/audioCore.test.ts`
- Create: `web/src/audio/pcm-capture.worklet.ts`
- Create: `web/src/audio/audioSession.ts`
- Create: `web/src/audio/spectralCentroid.ts`
- Create: `web/src/workers/audio-analysis.worker.ts`

- [ ] **Step 1: Write two audio-core tests**

Create `web/src/audio/audioCore.test.ts`:

```typescript
import { expect, test } from "vitest";
import { SharedPcmRing } from "./sharedPcmRing";
import { StreamingResampler } from "./streamingResampler";

test("ring keeps newest samples after overflow", () => {
  const ring = SharedPcmRing.create(4);
  ring.write(Float32Array.of(1, 2, 3, 4, 5));
  const output = new Float32Array(4);
  expect(ring.readInto(output)).toBe(4);
  expect([...output]).toEqual([2, 3, 4, 5]);
  expect(ring.droppedSamples).toBe(1);
});

test("streaming 48 kHz to 16 kHz keeps chunk continuity", () => {
  const source = Float32Array.from({ length: 9600 }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / 48000));
  const resampler = new StreamingResampler(48000, 16000);
  const first = resampler.process(source.subarray(0, 3101));
  const second = resampler.process(source.subarray(3101));
  expect(first.length + second.length).toBeGreaterThanOrEqual(3190);
  expect(first.length + second.length).toBeLessThanOrEqual(3210);
});
```

- [ ] **Step 2: Implement the shared ring buffer**

Use one `SharedArrayBuffer` with a four-integer header (`write`, `read`, `dropped`, `closed`) followed by a `Float32Array` data region. `write()` advances the read index when full so the newest audio is retained. `readInto()` performs no allocation.

- [ ] **Step 3: Implement the streaming resampler**

Use a stateful 32-tap Hann-windowed sinc kernel with 256 fractional phases. Preserve source position and the previous 32 source samples across calls. Expose:

```typescript
export class StreamingResampler {
  constructor(readonly inputRate: number, readonly outputRate: number);
  process(input: Float32Array): Float32Array;
  reset(): void;
}
```

- [ ] **Step 4: Implement AudioWorklet and AudioSession**

The worklet writes the first input channel to the ring and never posts PCM through `MessagePort`. `AudioSession.start()`:

1. Rejects when `crossOriginIsolated` is false.
2. Calls `getUserMedia()` only after the user clicks Start.
3. Creates `MediaStreamSource -> AudioWorkletNode -> zero-gain node -> destination`.
4. Returns the ring descriptor, actual sample rate, browser audio settings, and an idempotent `stop()`.

- [ ] **Step 5: Implement the analysis Worker**

Read the ring into reusable buffers, compute RMS for every display slice, compute spectral centroid at 15 Hz, resample to 16 kHz, and send 320-sample chunks to the KWS Worker through a `MessageChannel`. Emit diagnostics once per second.

- [ ] **Step 6: Run the two audio tests**

```text
npm --prefix web exec -- vitest run src/audio/audioCore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```text
git add web/src/audio web/src/workers/audio-analysis.worker.ts
git commit -m "feat: capture and resample microphone audio"
```

### Task 5: Build the Confirmed UI, Waveform, Settings, and Controller

**Files:**
- Create: `web/src/assets/professional-monitoring-microphone.png`
- Create: `web/src/styles/tokens.css`
- Create: `web/src/styles/global.css`
- Create: `web/src/app/KwsSessionController.ts`
- Create: `web/src/app/AppShell.tsx`
- Create: `web/src/components/TopBar.tsx`
- Create: `web/src/components/ModelLoadingStage.tsx`
- Create: `web/src/components/MicrophoneReadyStage.tsx`
- Create: `web/src/components/WaveformCanvas.tsx`
- Create: `web/src/components/SettingsDrawer.tsx`
- Create: `web/src/components/MetricsBar.tsx`
- Create: `web/src/components/DetectionHistory.tsx`
- Create: `web/src/components/RecoverableErrorStage.tsx`
- Create: `web/src/audio/waveHistory.ts`
- Create: `web/src/app/settings.ts`
- Create: `web/src/app/wakeWordEvent.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Copy the approved transparent microphone asset**

Run from the repository root:

```text
node -e "require('node:fs').copyFileSync('.superpowers/brainstorm/91459-1781060591/content/professional-monitoring-microphone-transparent-cropped.png','web/src/assets/professional-monitoring-microphone.png')"
```

Verify it remains RGBA with transparent corners before committing.

- [ ] **Step 2: Implement the visual system**

Define the approved soft-glass tokens:

```css
:root {
  color-scheme: dark;
  --bg-0: #081021;
  --bg-1: #14233d;
  --glass: rgb(255 255 255 / 8%);
  --glass-border: rgb(220 234 255 / 16%);
  --text-primary: #f1f7ff;
  --text-secondary: #8d9bb2;
  --violet: #806df2;
  --cyan: #55d2df;
  --mint: #61e1b7;
  --radius-panel: 24px;
}
```

Add `prefers-reduced-motion` rules that reduce animations to 1 ms.

- [ ] **Step 3: Implement the main states and controller**

`KwsSessionController` immediately starts `ModelAssetManager.load()`, creates Workers after verification, and exposes `startListening()`, `stopListening()`, `applySettings()`, and `dispose()`. It requests the microphone only from `startListening()` and always releases MediaStream tracks, AudioContext, ports, and Workers.

The shell renders:

- automatic model loading with per-file download/verify progress,
- transparent professional microphone and Start button,
- Listening/Partial/Expired/Detected states,
- latency, uptime, count, and history,
- recoverable error cards without any upload control.

- [ ] **Step 4: Implement the rainbow waveform**

Keep 12 seconds in a fixed ring. Each slice stores sample range, RMS, centroid, state, revision, and state-change time. Use these visual values:

```typescript
const visuals = {
  idle: { alpha: 0.38, saturation: 0.72, glow: 0 },
  partial: { alpha: 1, saturation: 1.1, glow: 10 },
  expired: { alpha: 0.13, saturation: 0.1, glow: 0 },
  detected: { alpha: 1, saturation: 1.18, glow: 16 },
} as const;
```

Expired fades over 450 ms and remains dim for about 1.5 seconds. Detected overrides partial/expired in the final token range and runs one white-cyan sweep.

- [ ] **Step 5: Implement settings and browser event**

The drawer has Keywords, Audio Input, Model, and Diagnostics tabs. Validate at least one enabled keyword, threshold `[0,1]`, boost `[0,10]`, max paths `[1,16]`. Applying keyword settings rebuilds only the stream.

Dispatch:

```typescript
window.dispatchEvent(new CustomEvent("wakeword-detected", {
  detail: {
    keyword: result.keyword,
    tokens: result.tokens,
    tokenTimestamps: result.tokenTimestamps,
    startTime: result.startTime,
    endTime: result.endTime,
    detectedAt: Date.now(),
  },
}));
```

Play one predecoded short prompt sound when enabled.

- [ ] **Step 6: Build and manually inspect with the mock engine**

Run:

```text
npm run build
npm run dev
```

In the in-app Browser verify at 1440x900: loading, microphone-ready image, rainbow waveform, Partial/Expired/Detected contrast, settings drawer, reduced motion, and no file upload UI.

- [ ] **Step 7: Commit**

```text
git add web/src
git commit -m "feat: build polished browser kws interface"
```

### Task 6: Add the sherpa-onnx Partial API and WASM Bridge

**Files:**
- Create: `scripts/fetch-sherpa-onnx.mjs`
- Create: `scripts/export-sherpa-patch.mjs`
- Create: `scripts/build-sherpa-wasm.mjs`
- Create: `third_party/sherpa-onnx.commit`
- Create: `patches/sherpa-onnx/0001-expose-partial-kws-result.patch`
- Modify in generated checkout: `sherpa-onnx/csrc/transducer-keyword-decoder.*`
- Modify in generated checkout: `sherpa-onnx/csrc/keyword-spotter-transducer-impl.h`
- Modify in generated checkout: `sherpa-onnx/c-api/c-api.*`
- Create via patch: `sherpa-onnx/wasm/kws/kws-app-bridge.cc`
- Modify via patch: `sherpa-onnx/wasm/kws/CMakeLists.txt`
- Create: `web/src/kws/SherpaKwsEngine.ts`

- [ ] **Step 1: Create the reproducible source fetcher**

`fetch-sherpa-onnx.mjs` clones the official repository, writes the exact source SHA to `third_party/sherpa-onnx.commit` on first use, checks out that SHA thereafter, refuses a dirty generated checkout, and applies the tracked patch. Use `scripts/process.mjs`; all paths must work with spaces on Windows and Linux.

- [ ] **Step 2: Add the internal read-only partial snapshot**

Add:

```cpp
struct PartialKeywordResult {
  std::string keyword;
  std::vector<std::string> tokens;
  std::vector<int32_t> frame_indexes;
  int32_t matched_token_count = 0;
  int32_t keyword_token_count = 0;
  uint64_t revision = 0;
  bool is_active = false;
};
```

Update it from the decoder's best hypothesis after each decode step. Revision changes only when candidate keyword, token IDs, or frame indexes change. Mark the previous revision inactive when its prefix is pruned. Do not change matching scores, thresholds, trailing blank logic, or final detection.

- [ ] **Step 3: Add the owned C API**

```cpp
typedef struct SherpaOnnxPartialKeywordResult {
  const char *keyword;
  const char *const *tokens_arr;
  const int32_t *frame_indexes;
  int32_t matched_token_count;
  int32_t keyword_token_count;
  uint64_t revision;
  int32_t is_active;
} SherpaOnnxPartialKeywordResult;

const SherpaOnnxPartialKeywordResult *SherpaOnnxGetPartialKeywordResult(
    const SherpaOnnxKeywordSpotter *spotter,
    const SherpaOnnxOnlineStream *stream);

void SherpaOnnxDestroyPartialKeywordResult(
    const SherpaOnnxPartialKeywordResult *result);
```

Deep-copy strings and arrays into the returned owner object.

- [ ] **Step 4: Add a narrow one-session WASM bridge**

Export:

```cpp
extern "C" {
int32_t KwsCreate(const char *config_json);
void KwsAcceptWaveform(int32_t sample_rate, const float *samples, int32_t n);
void KwsDecodeReadyFrames();
const char *KwsGetPartialResultJson();
const char *KwsGetFinalResultJson();
int32_t KwsRebuildKeywordStream(const char *keywords_text);
void KwsReset();
void KwsDestroy();
}
```

Use an ES-module Emscripten output, SIMD, memory growth, Worker environment, and filesystem. Do not enable pthreads in the first release.

- [ ] **Step 5: Build cross-platform with Node orchestration**

`build-sherpa-wasm.mjs` installs/reuses Emscripten 4.0.23 under `.toolchains/emsdk`, runs `emsdk` on Linux or `emsdk.bat` through `runWindowsBatch()` on Windows, configures with `emcmake cmake`, builds with `cmake --build`, copies JS/WASM to `web/public/wasm/kws`, and writes `build.json` with source SHA, patch SHA, Emscripten version, OS, and architecture.

- [ ] **Step 6: Implement the real TypeScript adapter**

`SherpaKwsEngine` writes verified assets into the WASM filesystem, wraps the seven bridge functions once with `cwrap`, sends PCM through `HEAPF32`, emits partial only on revision change, emits expired once when active becomes false, emits final result, and rebuilds keywords without recreating the module.

Convert frame indexes using `frameIndex * 0.04` seconds for the approved Zipformer configuration and assert manifest sample rate 16000.

- [ ] **Step 7: Compile and perform one native smoke check**

Run:

```text
npm run sherpa:fetch
npm run sherpa:build
```

Expected: JS, WASM, and `build.json` exist. Feed one known positive WAV through native and WASM runners and confirm both detect the same keyword before exporting the patch.

- [ ] **Step 8: Export and commit the patch**

`export-sherpa-patch.mjs` captures `git diff --binary` from the generated checkout and writes the patch without shell redirection.

```text
node scripts/export-sherpa-patch.mjs
git add scripts third_party/sherpa-onnx.commit patches/sherpa-onnx web/src/kws/SherpaKwsEngine.ts
git commit -m "feat: integrate sherpa onnx wasm with partial results"
```

### Task 7: Add One Main-Flow Test and a Small Native/WASM Corpus

**Files:**
- Create: `web/e2e/main-flow.spec.ts`
- Modify: `web/playwright.config.ts`
- Create: `tests/kws-regression/manifest.json`
- Create: `tests/kws-regression/run-native.mjs`
- Create: `tests/kws-regression/run-wasm.mjs`
- Create: `tests/kws-regression/compare-results.mjs`
- Create: `scripts/verify-kws-consistency.mjs`

- [ ] **Step 1: Add one browser test**

Use `VITE_KWS_ENGINE=mock` only at build time. The test verifies:

1. Model loading starts without user action.
2. No file input, upload button, or drag/drop model area exists.
3. Start Listening appears after readiness.
4. The scripted mock sequence shows Partial, then Expired, then Detected.
5. One `wakeword-detected` event is dispatched.
6. Applying a keyword threshold rebuilds the stream without fetching model files again.

Do not split this into separate visual, settings, accessibility, and recovery test files.

- [ ] **Step 2: Configure Windows/Linux browser projects**

Keep bundled Chromium for local use. Add Chrome on Linux and Edge on Windows projects. The CI job selects the project matching its OS. Use fake microphone media and the mock engine.

- [ ] **Step 3: Define a 3-to-5-file regression corpus**

Commit only metadata, not private WAVs:

```json
{
  "sampleRate": 16000,
  "cases": [
    { "id": "positive", "file": "positive.wav", "expect": "hey eva" },
    { "id": "partial", "file": "partial.wav", "expect": null },
    { "id": "near-miss", "file": "near-miss.wav", "expect": null },
    { "id": "noisy-positive", "file": "noisy-positive.wav", "expect": "hey eva" }
  ]
}
```

- [ ] **Step 4: Implement the comparison command**

Both runners emit JSON Lines:

```json
{"id":"positive","keyword":"hey eva","startTime":0.42,"endTime":1.08}
```

`verify-kws-consistency.mjs` fails only when trigger/non-trigger differs or timing differs by more than one decode chunk. It uses argument arrays and works when model/corpus paths contain spaces.

- [ ] **Step 5: Run the minimal automated checks**

```text
npm run test
npm run test:e2e
npm run verify:kws
```

Expected: core unit tests, the single browser flow, and the small corpus comparison pass.

- [ ] **Step 6: Commit**

```text
git add web/e2e web/playwright.config.ts tests/kws-regression scripts/verify-kws-consistency.mjs
git commit -m "test: add minimal browser and kws regression checks"
```

### Task 8: Add Windows/Linux CI, Deployment Configs, and Final Verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/deployment.md`
- Create: `deploy/nginx.conf`
- Create: `deploy/Caddyfile`
- Create: `deploy/web.config`
- Create: `scripts/verify-release.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add a small Windows/Linux CI matrix**

Use `windows-latest` and `ubuntu-latest`, Node 22, then run:

```text
npm ci --prefix web
npm run test
npm run model:package -- --source "web/tests/fixtures/model-source" --model-id fixture-kws --model-version ci --sample-rate 16000 --feature-dim 80
npm run build
npm run test:e2e -- --project=<matching-os-project>
```

On Windows set `core.autocrlf=true` before checkout validation. A separate manual/nightly job runs `npm run sherpa:build` on both OSes because Emscripten/ONNX compilation is too heavy for every UI change.

- [ ] **Step 2: Add static-server examples**

Provide Linux Nginx/Caddy and Windows IIS configuration with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Content-Type: application/wasm
```

Use `no-cache` for HTML and `model-manifest.json`; use one-year immutable caching for versioned model/WASM files.

- [ ] **Step 3: Implement the concise release verifier**

`verify-release.mjs` runs core tests and build, validates manifest schema, size, and SHA-256 for every generated model file, verifies JS/WASM/build metadata exist, and scans built HTML for file-upload inputs or a production mock-engine flag.

- [ ] **Step 4: Perform the manual compatibility checklist**

Record these minimum rows:

| OS | Browser | Device |
|---|---|---|
| Windows 11 | Chrome stable | built-in or USB mic |
| Windows 11 | Edge stable | built-in or USB mic |
| Linux x86_64 | Chrome stable | built-in or USB mic |

For each row record actual sample rate, dropped samples, detection result, and average inference time. Bluetooth is only required when target hardware uses it.

- [ ] **Step 5: Run final verification**

```text
npm run verify:release
git status --short
```

Expected: verification exits 0 and Git status is clean.

- [ ] **Step 6: Commit**

```text
git add .github README.md docs/deployment.md deploy scripts/verify-release.mjs
git commit -m "docs: add windows and linux deployment verification"
```

## Final Acceptance

The project is complete when:

- Windows 11 and Linux can build the frontend with the same npm commands.
- Windows and Linux can build the sherpa WASM bundle without WSL.
- The page automatically downloads or restores the model package and never asks the user to upload ONNX files.
- Microphone audio stays in the browser.
- Partial highlighting uses the real active sherpa keyword prefix.
- Expired is visibly dimmer than Partial and Detected.
- Detected plays one prompt sound and dispatches one `wakeword-detected` event.
- The small Native/WASM corpus agrees.
- The single browser main-flow test passes.
