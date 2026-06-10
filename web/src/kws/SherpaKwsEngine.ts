import type {
  DetectedWorkerMessage,
  PartialWorkerMessage,
  WorkerMessage,
} from "../app/protocol";
import type { ModelAssetName, ModelManifest } from "../model/manifest";
import type { KwsEngine } from "./KwsEngine";

const sampleRate = 16_000;
const encoderFrameSeconds = 0.04;
const wasmDirectory = "/wasm/kws";

interface SherpaPartialResult {
  keyword: string;
  tokens: string[];
  frame_indexes: number[];
  matched_token_count: number;
  keyword_token_count: number;
  revision: number;
  is_active: boolean;
}

interface SherpaFinalResult {
  keyword: string;
  tokens: string[];
  timestamps: number[];
  start_time: number;
}

interface SherpaStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  free(): void;
}

interface SherpaKeywordSpotter {
  createStream(): SherpaStream;
  isReady(stream: SherpaStream): boolean;
  decode(stream: SherpaStream): void;
  getPartialResult(stream: SherpaStream): SherpaPartialResult | null;
  getResult(stream: SherpaStream): SherpaFinalResult;
  reset(stream: SherpaStream): void;
  free(): void;
}

interface EmscriptenFileSystem {
  mkdirTree(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
}

interface SherpaModule {
  FS: EmscriptenFileSystem;
}

interface SherpaModuleOptions {
  locateFile(path: string): string;
}

type SherpaModuleFactory = (options: SherpaModuleOptions) => Promise<SherpaModule>;
type CreateKws = (
  module: SherpaModule,
  config: Record<string, unknown>,
) => SherpaKeywordSpotter;

function secondsForSamples(samples: number): number {
  return samples / sampleRate;
}

export function partialResultToMessage(
  result: SherpaPartialResult,
  streamStartSample: number,
): PartialWorkerMessage | null {
  if (!result.is_active || result.frame_indexes.length === 0) {
    return null;
  }

  const firstFrame = result.frame_indexes[0];
  const lastFrame = result.frame_indexes[result.frame_indexes.length - 1];
  if (firstFrame === undefined || lastFrame === undefined) {
    return null;
  }

  const samplesPerFrame = sampleRate * encoderFrameSeconds;
  return {
    type: "partial",
    keyword: result.keyword || result.tokens.join(" "),
    tokens: [...result.tokens],
    startSample: streamStartSample + Math.round(firstFrame * samplesPerFrame),
    endSample: streamStartSample + Math.round((lastFrame + 1) * samplesPerFrame),
    matchedTokenCount: result.matched_token_count,
    keywordTokenCount: result.keyword_token_count,
    revision: result.revision,
  };
}

export function finalResultToMessage(
  result: SherpaFinalResult,
  streamStartSample: number,
): DetectedWorkerMessage | null {
  if (!result.keyword && result.tokens.length === 0) {
    return null;
  }

  const streamOffsetSeconds = secondsForSamples(streamStartSample);
  const tokenTimestamps = result.timestamps.map(
    (timestamp) => streamOffsetSeconds + timestamp,
  );
  const lastTimestamp = tokenTimestamps[tokenTimestamps.length - 1];
  return {
    type: "detected",
    keyword: result.keyword || result.tokens.join(" "),
    tokens: [...result.tokens],
    tokenTimestamps,
    startTime: streamOffsetSeconds + result.start_time,
    endTime:
      lastTimestamp === undefined
        ? streamOffsetSeconds + result.start_time + encoderFrameSeconds
        : lastTimestamp + encoderFrameSeconds,
  };
}

async function loadSherpaRuntime(): Promise<{
  module: SherpaModule;
  createKws: CreateKws;
}> {
  const modulePath = `${wasmDirectory}/sherpa-onnx-kws-module.js`;
  const wrapperPath = `${wasmDirectory}/sherpa-onnx-kws.js`;
  const [moduleImport, wrapperImport] = await Promise.all([
    import(/* @vite-ignore */ modulePath) as Promise<{
      default: SherpaModuleFactory;
    }>,
    import(/* @vite-ignore */ wrapperPath) as Promise<{ createKws: CreateKws }>,
  ]);
  const module = await moduleImport.default({
    locateFile: (path) => `${wasmDirectory}/${path}`,
  });
  return { module, createKws: wrapperImport.createKws };
}

function modelPath(name: ModelAssetName): string {
  const extension = name === "tokens" || name === "keywords" ? "txt" : "onnx";
  return `/kws-model/${name}.${extension}`;
}

function writeModelAssets(
  module: SherpaModule,
  assets: Record<ModelAssetName, ArrayBuffer>,
): void {
  module.FS.mkdirTree("/kws-model");
  for (const [name, bytes] of Object.entries(assets) as [
    ModelAssetName,
    ArrayBuffer,
  ][]) {
    module.FS.writeFile(modelPath(name), new Uint8Array(bytes));
  }
}

function createConfig(manifest: ModelManifest, keywords: string): Record<string, unknown> {
  return {
    featConfig: {
      samplingRate: manifest.sampleRate,
      featureDim: manifest.featureDim,
    },
    modelConfig: {
      transducer: {
        encoder: modelPath("encoder"),
        decoder: modelPath("decoder"),
        joiner: modelPath("joiner"),
      },
      tokens: modelPath("tokens"),
      provider: "cpu",
      modelType: "",
      numThreads: 1,
      debug: 0,
      modelingUnit: "",
      bpeVocab: "",
    },
    maxActivePaths: 4,
    numTrailingBlanks: 1,
    keywordsScore: 1,
    keywordsThreshold: 0.25,
    keywords,
  };
}

export class SherpaKwsEngine implements KwsEngine {
  private emit?: (message: WorkerMessage) => void;
  private module: SherpaModule | null = null;
  private createKws: CreateKws | null = null;
  private manifest: ModelManifest | null = null;
  private kws: SherpaKeywordSpotter | null = null;
  private stream: SherpaStream | null = null;
  private totalAcceptedSamples = 0;
  private streamStartSample = 0;
  private lastPartialRevision = -1;
  private activePartial: PartialWorkerMessage | null = null;
  private inferenceMs = 0;
  private samplesSinceDiagnostics = 0;
  private diagnosticsStartedAt = 0;

  async initialize(input: Parameters<KwsEngine["initialize"]>[0]): Promise<void> {
    if (input.manifest.sampleRate !== sampleRate) {
      throw new Error(
        `Sherpa KWS expects a 16000 Hz model, received ${input.manifest.sampleRate} Hz`,
      );
    }

    this.emit = input.emit;
    this.emit({ type: "engine-progress", stage: "wasm-runtime", loaded: 0, total: 3 });
    const { module, createKws } = await loadSherpaRuntime();
    this.module = module;
    this.createKws = createKws;
    this.manifest = input.manifest;
    this.emit({ type: "engine-progress", stage: "wasm-runtime", loaded: 1, total: 3 });

    writeModelAssets(module, input.assets);
    this.emit({ type: "engine-progress", stage: "model-files", loaded: 2, total: 3 });

    const keywords = new TextDecoder().decode(input.assets.keywords).trim();
    if (!keywords) {
      throw new Error("keywords.txt is empty");
    }
    this.replaceKeywordSpotter(keywords);
    this.diagnosticsStartedAt = performance.now();
    this.emit({ type: "engine-progress", stage: "ready", loaded: 3, total: 3 });
    this.emit({ type: "engine-ready" });
  }

  acceptWaveform(samples: Float32Array, inputSampleRate: number): void {
    if (!this.kws || !this.stream) {
      throw new Error("Sherpa KWS engine is not initialized");
    }
    if (inputSampleRate !== sampleRate) {
      throw new Error(`Expected 16000 Hz PCM, received ${inputSampleRate} Hz`);
    }

    this.stream.acceptWaveform(inputSampleRate, samples);
    this.totalAcceptedSamples += samples.length;
    this.samplesSinceDiagnostics += samples.length;
    const startedAt = performance.now();
    while (this.kws.isReady(this.stream)) {
      this.kws.decode(this.stream);
      this.handlePartial(this.kws.getPartialResult(this.stream));
      const detected = finalResultToMessage(
        this.kws.getResult(this.stream),
        this.streamStartSample,
      );
      if (detected) {
        this.emit?.(detected);
        this.kws.reset(this.stream);
        this.streamStartSample = this.totalAcceptedSamples;
        this.clearPartialTracking();
      }
    }
    this.inferenceMs += performance.now() - startedAt;
    this.maybeEmitDiagnostics();
  }

  async rebuildKeywordStream(keywordsText: string): Promise<void> {
    if (!this.module || !this.createKws || !this.manifest) {
      throw new Error("Sherpa KWS engine is not initialized");
    }
    const keywords = keywordsText.trim();
    if (!keywords) {
      throw new Error("At least one keyword is required");
    }

    this.replaceKeywordSpotter(keywords);
    this.streamStartSample = this.totalAcceptedSamples;
    this.clearPartialTracking();
    this.emit?.({ type: "partial-reset" });
  }

  reset(): void {
    if (!this.kws || !this.stream) {
      return;
    }
    this.kws.reset(this.stream);
    this.streamStartSample = this.totalAcceptedSamples;
    this.clearPartialTracking();
    this.emit?.({ type: "partial-reset" });
  }

  destroy(): void {
    this.stream?.free();
    this.kws?.free();
    this.stream = null;
    this.kws = null;
    this.module = null;
    this.createKws = null;
    this.manifest = null;
    this.emit = undefined;
    this.clearPartialTracking();
  }

  private handlePartial(result: SherpaPartialResult | null): void {
    if (!result || result.revision === this.lastPartialRevision) {
      return;
    }
    this.lastPartialRevision = result.revision;
    const partial = partialResultToMessage(result, this.streamStartSample);
    if (partial) {
      this.activePartial = partial;
      this.emit?.(partial);
      return;
    }
    if (!result.is_active && this.activePartial) {
      this.emit?.({
        type: "expired",
        revision: this.activePartial.revision,
        startSample: this.activePartial.startSample,
        endSample: this.activePartial.endSample,
      });
      this.activePartial = null;
    }
  }

  private replaceKeywordSpotter(keywords: string): void {
    if (!this.module || !this.createKws || !this.manifest) {
      throw new Error("Sherpa KWS runtime is not initialized");
    }
    const previousStream = this.stream;
    const previousKws = this.kws;
    this.stream = null;
    this.kws = null;
    previousStream?.free();
    previousKws?.free();
    this.kws = this.createKws(
      this.module,
      createConfig(this.manifest, keywords),
    );
    this.stream = this.kws.createStream();
  }

  private clearPartialTracking(): void {
    this.lastPartialRevision = -1;
    this.activePartial = null;
  }

  private maybeEmitDiagnostics(): void {
    const now = performance.now();
    const elapsedMs = now - this.diagnosticsStartedAt;
    if (elapsedMs < 1_000) {
      return;
    }
    const audioMs = (this.samplesSinceDiagnostics / sampleRate) * 1_000;
    this.emit?.({
      type: "diagnostics",
      inferenceMs: this.inferenceMs,
      realtimeFactor: audioMs > 0 ? this.inferenceMs / audioMs : 0,
      queuedSamples: 0,
      droppedSamples: 0,
    });
    this.inferenceMs = 0;
    this.samplesSinceDiagnostics = 0;
    this.diagnosticsStartedAt = now;
  }
}
