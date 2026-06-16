import { AudioSession } from "../audio/audioSession";
import {
  WaveHistory,
  type AnalysisFrame,
  type WaveHistorySnapshot,
} from "../audio/waveHistory";
import {
  ModelAssetManager,
  createBrowserModelAssetDependencies,
  type LoadedModelPackage,
  type ModelAssetManagerApi,
  type ModelLoadProgress,
} from "../model/modelAssetManager";
import { modelAssetNames, type ModelAssetName } from "../model/manifest";
import type {
  DetectedWorkerMessage,
  KwsEngineSelection,
  KwsWorkerInboundMessage,
  WorkerMessage,
} from "./protocol";
import { initialState, reduce, type AppState } from "./state";
import { parseKeywordsText } from "./keywords";
import {
  cloneSettings,
  defaultSettings,
  replaceSettingsKeywords,
  settingsToKeywordsText,
  validateSettings,
  type AppSettings,
} from "./settings";
import { dispatchWakeWordDetected } from "./wakeWordEvent";

export interface ModelFileProgress extends ModelLoadProgress {
  complete: boolean;
}

export interface AudioDiagnostics {
  inputSampleRate: number | null;
  outputSampleRate: number;
  droppedSamples: number;
  queuedSamples: number;
  framesPerSecond: number | null;
}

export interface DetectionRecord {
  id: number;
  keyword: string;
  tokens: readonly string[];
  detectedAt: number;
  startTime: number;
  endTime: number;
}

export interface KwsSessionSnapshot {
  app: AppState;
  modelFiles: Readonly<Record<ModelAssetName, ModelFileProgress>>;
  modelId: string | null;
  modelVersion: string | null;
  modelSource: LoadedModelPackage["source"] | null;
  modelSampleRate: number;
  engine: KwsEngineSelection;
  settings: AppSettings;
  waveHistory: WaveHistorySnapshot;
  audioSettings: MediaTrackSettings | null;
  audioDiagnostics: AudioDiagnostics;
  detectionHistory: readonly DetectionRecord[];
  detectionCount: number;
  uptimeMs: number;
  isSettingsOpen: boolean;
}

type Listener = () => void;

export interface KwsSessionControllerDependencies {
  modelManager: ModelAssetManagerApi;
  createKwsWorker: () => Worker;
}

interface AnalysisWorkerMessage {
  type: "analysis-frame" | "audio-frame" | "audio-diagnostics";
  frame?: AnalysisFrame;
  startSample?: number;
  endSample?: number;
  rms?: number;
  amplitude?: number;
  centroid?: number;
  centroidHz?: number;
  samples?: Float32Array;
  sampleRate?: number;
  droppedSamples?: number;
  queuedSamples?: number;
  framesPerSecond?: number;
}

const engineSelection: KwsEngineSelection =
  import.meta.env.VITE_KWS_ENGINE === "mock" ? "mock" : "sherpa";

function emptyModelProgress(): Record<ModelAssetName, ModelFileProgress> {
  return Object.fromEntries(
    modelAssetNames.map((asset) => [
      asset,
      { asset, phase: "download", loaded: 0, total: 0, complete: false },
    ]),
  ) as Record<ModelAssetName, ModelFileProgress>;
}

function errorText(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "麦克风权限被拒绝。请在浏览器站点设置中允许访问后重试。";
  }
  return error instanceof Error ? error.message : String(error);
}

export class KwsSessionController {
  private readonly listeners = new Set<Listener>();
  private readonly modelManager: ModelAssetManagerApi;
  private readonly createKwsWorker: () => Worker;
  private readonly waveHistory = new WaveHistory();
  private snapshot: KwsSessionSnapshot;
  private modelPackage: LoadedModelPackage | null = null;
  private kwsWorker: Worker | null = null;
  private analysisWorker: Worker | null = null;
  private audioStop: (() => void | Promise<void>) | null = null;
  private chimeContext: AudioContext | null = null;
  private chimeBuffer: AudioBuffer | null = null;
  private uptimeTimer: number | null = null;
  private matchFeedbackTimer: number | null = null;
  private listeningStartedAt: number | null = null;
  // The analysis worker restarts its frame cursor for each microphone session,
  // while the KWS worker reports ranges on the accepted-audio timeline.
  private analysisSampleOffset = 0;
  private forwardedAudioSampleCount = 0;
  private loadGeneration = 0;
  private detectionRevision = 10_000;
  private disposed = false;

  constructor(dependencies: Partial<KwsSessionControllerDependencies> = {}) {
    this.modelManager = dependencies.modelManager ?? new ModelAssetManager(
      createBrowserModelAssetDependencies(),
    );
    this.createKwsWorker = dependencies.createKwsWorker ?? (() =>
      new Worker(new URL("../workers/kws.worker.ts", import.meta.url), {
        type: "module",
      }));
    this.snapshot = {
      app: initialState,
      modelFiles: emptyModelProgress(),
      modelId: null,
      modelVersion: null,
      modelSource: null,
      modelSampleRate: 16_000,
      engine: engineSelection,
      settings: cloneSettings(defaultSettings),
      waveHistory: this.waveHistory.getSnapshot(),
      audioSettings: null,
      audioDiagnostics: {
        inputSampleRate: null,
        outputSampleRate: 16_000,
        droppedSamples: 0,
        queuedSamples: 0,
        framesPerSecond: null,
      },
      detectionHistory: [],
      detectionCount: 0,
      uptimeMs: 0,
      isSettingsOpen: false,
    };
    void this.loadModels();
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): KwsSessionSnapshot => this.snapshot;

  setSettingsOpen(isSettingsOpen: boolean): void {
    this.update({ isSettingsOpen });
  }

  async retry(): Promise<void> {
    if (this.modelPackage && this.kwsWorker) {
      this.setApp({
        ...this.snapshot.app,
        phase: "ready-for-microphone",
        lastError: null,
      });
      return;
    }
    await this.loadModels();
  }

  async startListening(): Promise<void> {
    if (
      this.disposed ||
      !this.kwsWorker ||
      (this.snapshot.app.phase !== "ready-for-microphone" &&
        this.snapshot.app.phase !== "stopped")
    ) {
      return;
    }

    this.setApp(reduce(this.snapshot.app, {
      type: "phase-changed",
      phase: "requesting-permission",
    }));

    try {
      const audioSession = new AudioSession();
      const started = await audioSession.start();
      if (this.disposed) {
        await started.stop();
        return;
      }

      this.audioStop = started.stop;
      this.waveHistory.setSampleRate(this.snapshot.modelSampleRate);
      this.analysisSampleOffset = this.forwardedAudioSampleCount;
      this.prepareChime();

      const analysisWorker = new Worker(
        new URL("../workers/audio-analysis.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.analysisWorker = analysisWorker;
      analysisWorker.onmessage = (event: MessageEvent<AnalysisWorkerMessage>) => {
        this.handleAnalysisMessage(event.data);
      };
      analysisWorker.onerror = (event) => {
        this.fail("AUDIO_ANALYSIS_FAILED", event.message || "音频分析线程异常");
      };
      analysisWorker.postMessage({
        type: "start",
        ring: started.ring,
        inputRate: started.sampleRate,
        inputSampleRate: started.sampleRate,
        outputRate: this.snapshot.modelSampleRate,
        outputSampleRate: this.snapshot.modelSampleRate,
      });

      this.listeningStartedAt = performance.now();
      this.startUptimeTimer();
      this.snapshot = {
        ...this.snapshot,
        app: reduce(this.snapshot.app, {
          type: "phase-changed",
          phase: "listening",
        }),
        audioSettings: started.settings,
        audioDiagnostics: {
          ...this.snapshot.audioDiagnostics,
          inputSampleRate: started.sampleRate,
          outputSampleRate: this.snapshot.modelSampleRate,
        },
        waveHistory: this.waveHistory.getSnapshot(),
        uptimeMs: 0,
      };
      this.emit();
    } catch (error) {
      await this.stopAudioResources();
      this.fail("MICROPHONE_START_FAILED", errorText(error));
    }
  }

  async stopListening(): Promise<void> {
    await this.stopAudioResources();
    this.kwsWorker?.postMessage({ type: "reset" } satisfies KwsWorkerInboundMessage);
    this.waveHistory.expireActivePartial();
    this.snapshot = {
      ...this.snapshot,
      app: reduce(
        reduce(this.snapshot.app, { type: "stream-reset" }),
        { type: "phase-changed", phase: "stopped" },
      ),
      waveHistory: this.waveHistory.getSnapshot(),
    };
    this.emit();
  }

  applySettings(settings: AppSettings): string[] {
    const errors = validateSettings(settings);
    if (errors.length > 0) {
      return errors;
    }

    const nextSettings = cloneSettings(settings);
    this.kwsWorker?.postMessage({
      type: "rebuild-keywords",
      keywordsText: settingsToKeywordsText(nextSettings),
    } satisfies KwsWorkerInboundMessage);
    this.snapshot = {
      ...this.snapshot,
      settings: nextSettings,
      app: reduce(this.snapshot.app, { type: "stream-reset" }),
    };
    this.waveHistory.expireActivePartial();
    this.snapshot = { ...this.snapshot, waveHistory: this.waveHistory.getSnapshot() };
    this.emit();
    return [];
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.loadGeneration += 1;
    if (this.matchFeedbackTimer !== null) {
      window.clearTimeout(this.matchFeedbackTimer);
      this.matchFeedbackTimer = null;
    }
    void this.stopAudioResources();
    if (this.kwsWorker) {
      this.kwsWorker.postMessage({ type: "destroy" } satisfies KwsWorkerInboundMessage);
      this.kwsWorker.terminate();
      this.kwsWorker = null;
    }
    if (this.chimeContext) {
      void this.chimeContext.close();
      this.chimeContext = null;
      this.chimeBuffer = null;
    }
    this.listeners.clear();
  }

  private async loadModels(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.disposeKwsWorker();
    this.modelPackage = null;
    this.analysisSampleOffset = 0;
    this.forwardedAudioSampleCount = 0;
    this.waveHistory.clear();
    this.snapshot = {
      ...this.snapshot,
      app: { ...initialState, phase: "loading-models" },
      modelFiles: emptyModelProgress(),
      modelId: null,
      modelVersion: null,
      modelSource: null,
      waveHistory: this.waveHistory.getSnapshot(),
    };
    this.emit();

    try {
      const loaded = await this.modelManager.load((progress) => {
        if (generation !== this.loadGeneration || this.disposed) {
          return;
        }
        this.updateModelProgress(progress);
      });
      if (generation !== this.loadGeneration || this.disposed) {
        return;
      }

      const keywords = parseKeywordsText(
        new TextDecoder().decode(loaded.assets.keywords),
      );
      this.modelPackage = loaded;
      this.waveHistory.setSampleRate(loaded.manifest.sampleRate);
      this.snapshot = {
        ...this.snapshot,
        modelId: loaded.manifest.modelId,
        modelVersion: loaded.manifest.version,
        modelSource: loaded.source,
        modelSampleRate: loaded.manifest.sampleRate,
        settings: replaceSettingsKeywords(this.snapshot.settings, keywords),
        audioDiagnostics: {
          ...this.snapshot.audioDiagnostics,
          outputSampleRate: loaded.manifest.sampleRate,
        },
        waveHistory: this.waveHistory.getSnapshot(),
      };
      this.initializeKwsWorker(loaded);
      this.emit();
    } catch (error) {
      if (generation === this.loadGeneration && !this.disposed) {
        this.fail("MODEL_LOAD_FAILED", errorText(error));
      }
    }
  }

  private initializeKwsWorker(modelPackage: LoadedModelPackage): void {
    const worker = this.createKwsWorker();
    this.kwsWorker = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.handleKwsMessage(event.data);
    };
    worker.onerror = (event) => {
      this.fail("KWS_WORKER_FAILED", event.message || "唤醒词线程异常");
    };
    worker.postMessage({
      type: "initialize",
      manifest: modelPackage.manifest,
      assets: modelPackage.assets,
      engine: engineSelection,
    } satisfies KwsWorkerInboundMessage);
  }

  private handleKwsMessage(message: WorkerMessage): void {
    if (this.disposed) {
      return;
    }

    let app = reduce(this.snapshot.app, message);
    if (message.type === "engine-ready") {
      app = reduce(app, { type: "phase-changed", phase: "ready-for-microphone" });
    } else if (message.type === "partial") {
      this.waveHistory.markMatchingRange(
        message.startSample,
        message.endSample,
        "partial",
        message.revision,
      );
    } else if (message.type === "expired") {
      this.waveHistory.markMatchingRange(
        message.startSample,
        message.endSample,
        "expired",
        message.revision,
      );
    } else if (message.type === "partial-reset") {
      this.waveHistory.expireActivePartial();
    } else if (message.type === "detected") {
      this.handleDetection(message);
    } else if (message.type === "error") {
      app = reduce(app, { type: "phase-changed", phase: "recoverable-error" });
    }

    this.snapshot = {
      ...this.snapshot,
      app,
      waveHistory: this.waveHistory.getSnapshot(),
    };
    this.emit();
  }

  private handleDetection(message: DetectedWorkerMessage): void {
    const detectedAt = Date.now();
    const revision = ++this.detectionRevision;
    this.waveHistory.markMatchingRange(
      Math.max(0, Math.round(message.startTime * this.snapshot.modelSampleRate)),
      Math.max(1, Math.round(message.endTime * this.snapshot.modelSampleRate)),
      "detected",
      revision,
    );
    const record: DetectionRecord = {
      id: detectedAt + revision,
      keyword: message.keyword,
      tokens: [...message.tokens],
      detectedAt,
      startTime: message.startTime,
      endTime: message.endTime,
    };
    this.snapshot = {
      ...this.snapshot,
      detectionCount: this.snapshot.detectionCount + 1,
      detectionHistory: [record, ...this.snapshot.detectionHistory].slice(0, 8),
      waveHistory: this.waveHistory.getSnapshot(),
    };
    if (this.snapshot.settings.promptSound) {
      this.playChime();
    }
    dispatchWakeWordDetected(message, detectedAt);
    if (this.matchFeedbackTimer !== null) {
      window.clearTimeout(this.matchFeedbackTimer);
    }
    this.matchFeedbackTimer = window.setTimeout(() => {
      this.matchFeedbackTimer = null;
      if (this.snapshot.app.match.kind === "detected") {
        this.update({ app: reduce(this.snapshot.app, { type: "stream-reset" }) });
      }
    }, 900);
  }

  private handleAnalysisMessage(message: AnalysisWorkerMessage): void {
    if (this.disposed) {
      return;
    }
    if (message.type === "audio-frame") {
      if (message.samples && this.kwsWorker) {
        const samples = message.samples;
        const sampleCount = samples.length;
        this.kwsWorker.postMessage(
          {
            type: "audio-frame",
            samples,
            sampleRate: message.sampleRate ?? this.snapshot.modelSampleRate,
          } satisfies KwsWorkerInboundMessage,
          [samples.buffer],
        );
        this.forwardedAudioSampleCount += sampleCount;
      }
      return;
    }

    if (message.type === "analysis-frame") {
      const rawFrame = message.frame ?? {
        startSample: message.startSample ?? 0,
        endSample: message.endSample ?? 0,
        rms: message.rms ?? message.amplitude ?? 0,
        centroid: message.centroid ?? message.centroidHz ?? 0,
      };
      const inputRate = this.snapshot.audioDiagnostics.inputSampleRate
        ?? this.snapshot.modelSampleRate;
      const sampleScale = this.snapshot.modelSampleRate / inputRate;
      const frame: AnalysisFrame = {
        ...rawFrame,
        startSample:
          this.analysisSampleOffset + Math.round(rawFrame.startSample * sampleScale),
        endSample:
          this.analysisSampleOffset + Math.round(rawFrame.endSample * sampleScale),
      };
      this.waveHistory.addAnalysisFrame(frame);
      this.update({ waveHistory: this.waveHistory.getSnapshot() });
      return;
    }

    this.update({
      audioDiagnostics: {
        ...this.snapshot.audioDiagnostics,
        droppedSamples: message.droppedSamples ?? this.snapshot.audioDiagnostics.droppedSamples,
        queuedSamples: message.queuedSamples ?? this.snapshot.audioDiagnostics.queuedSamples,
        framesPerSecond:
          message.framesPerSecond ?? this.snapshot.audioDiagnostics.framesPerSecond,
      },
    });
  }

  private updateModelProgress(progress: ModelLoadProgress): void {
    const previous = this.snapshot.modelFiles[progress.asset];
    const file: ModelFileProgress = {
      ...progress,
      complete:
        progress.phase === "verify" && progress.total > 0 && progress.loaded >= progress.total,
    };
    this.snapshot = {
      ...this.snapshot,
      app: reduce(this.snapshot.app, {
        type: "engine-progress",
        stage: `${progress.asset}:${progress.phase}`,
        loaded: progress.loaded,
        total: progress.total,
      }),
      modelFiles: {
        ...this.snapshot.modelFiles,
        [progress.asset]: {
          ...previous,
          ...file,
        },
      },
    };
    this.emit();
  }

  private prepareChime(): void {
    if (this.chimeContext) {
      void this.chimeContext.resume();
      return;
    }
    const context = new AudioContext();
    const duration = 0.16;
    const frameCount = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const time = index / context.sampleRate;
      const envelope = Math.sin(Math.PI * (index / frameCount)) ** 2;
      data[index] =
        envelope *
        (Math.sin(2 * Math.PI * 740 * time) * 0.16 +
          Math.sin(2 * Math.PI * 1110 * time) * 0.08);
    }
    this.chimeContext = context;
    this.chimeBuffer = buffer;
    void context.resume();
  }

  private playChime(): void {
    if (!this.chimeContext || !this.chimeBuffer) {
      this.prepareChime();
    }
    const context = this.chimeContext;
    const buffer = this.chimeBuffer;
    if (!context || !buffer) {
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = 0.55;
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    source.start();
  }

  private startUptimeTimer(): void {
    if (this.uptimeTimer !== null) {
      window.clearInterval(this.uptimeTimer);
    }
    this.uptimeTimer = window.setInterval(() => {
      if (this.listeningStartedAt !== null) {
        this.update({ uptimeMs: performance.now() - this.listeningStartedAt });
      }
    }, 1000);
  }

  private async stopAudioResources(): Promise<void> {
    if (this.uptimeTimer !== null) {
      window.clearInterval(this.uptimeTimer);
      this.uptimeTimer = null;
    }
    this.listeningStartedAt = null;
    if (this.analysisWorker) {
      this.analysisWorker.postMessage({ type: "stop" });
      this.analysisWorker.terminate();
      this.analysisWorker = null;
    }
    const stop = this.audioStop;
    this.audioStop = null;
    if (stop) {
      await stop();
    }
    if (this.chimeContext) {
      await this.chimeContext.close();
      this.chimeContext = null;
      this.chimeBuffer = null;
    }
  }

  private disposeKwsWorker(): void {
    if (!this.kwsWorker) {
      return;
    }
    this.kwsWorker.postMessage({ type: "destroy" } satisfies KwsWorkerInboundMessage);
    this.kwsWorker.terminate();
    this.kwsWorker = null;
  }

  private fail(code: string, message: string): void {
    const app = reduce(
      reduce(this.snapshot.app, {
        type: "error",
        recoverable: true,
        code,
        message,
      }),
      { type: "phase-changed", phase: "recoverable-error" },
    );
    this.setApp(app);
  }

  private setApp(app: AppState): void {
    this.update({ app });
  }

  private update(patch: Partial<KwsSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
