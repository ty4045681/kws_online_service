import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  LoadedModelPackage,
  ModelAssetManagerApi,
} from "../model/modelAssetManager";
import type { ModelAssetName, ModelManifest } from "../model/manifest";
import { KwsSessionController } from "./KwsSessionController";
import { cloneSettings } from "./settings";

const encoder = new TextEncoder();

type FakeWorkerMessageHandler = ((event: MessageEvent) => void) | null;
type FakeWorkerErrorHandler = ((event: ErrorEvent) => void) | null;

class FakeModelManager implements ModelAssetManagerApi {
  private readonly loaded: LoadedModelPackage;

  constructor(loaded: LoadedModelPackage) {
    this.loaded = loaded;
  }

  setManifestLoader(): void {}

  async load(): Promise<LoadedModelPackage> {
    return this.loaded;
  }
}

class FakeWorker {
  readonly messages: unknown[] = [];
  onmessage: FakeWorkerMessageHandler = null;
  onerror: FakeWorkerErrorHandler = null;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {}
}

class FakeAudioNode {
  connect(): FakeAudioNode {
    return this;
  }

  disconnect(): void {}
}

class FakeAudioContext {
  sampleRate = 16_000;
  state: AudioContextState = "running";
  destination = new FakeAudioNode();
  audioWorklet = { addModule: vi.fn(async () => undefined) };

  createMediaStreamSource(): FakeAudioNode {
    return new FakeAudioNode();
  }

  createGain(): FakeAudioNode & { gain: { value: number } } {
    return Object.assign(new FakeAudioNode(), { gain: { value: 1 } });
  }

  createBuffer(
    channels: number,
    frameCount: number,
    sampleRate: number,
  ): Pick<AudioBuffer, "getChannelData"> {
    void channels;
    void sampleRate;
    const data = new Float32Array(frameCount);
    return { getChannelData: () => data };
  }

  createBufferSource(): FakeAudioNode & {
    buffer: AudioBuffer | null;
    start: () => void;
  } {
    return Object.assign(new FakeAudioNode(), {
      buffer: null,
      start: vi.fn(),
    });
  }

  async resume(): Promise<void> {}

  async close(): Promise<void> {
    this.state = "closed";
  }
}

class FakeAudioWorkletNode extends FakeAudioNode {
  constructor(..._ignored: unknown[]) {
    void _ignored;
    super();
  }
}

class FakeAnalysisWorker {
  static instances: FakeAnalysisWorker[] = [];

  readonly messages: unknown[] = [];
  terminated = false;
  onmessage: FakeWorkerMessageHandler = null;
  onerror: FakeWorkerErrorHandler = null;

  constructor(..._ignored: unknown[]) {
    void _ignored;
    FakeAnalysisWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAnalysisWorker.instances = [];
});

function modelPackage(keywordsText: string): LoadedModelPackage {
  const asset = { url: "/models/kws/test/file", size: 1, sha256: "0".repeat(64) };
  const manifest: ModelManifest = {
    schemaVersion: 1,
    modelId: "test-model",
    version: "v1",
    sampleRate: 16_000,
    featureDim: 80,
    files: {
      encoder: { ...asset },
      decoder: { ...asset },
      joiner: { ...asset },
      tokens: { ...asset },
      keywords: { ...asset },
    },
  };
  const assets = Object.fromEntries(
    (Object.keys(manifest.files) as ModelAssetName[]).map((name) => [
      name,
      name === "keywords"
        ? encoder.encode(keywordsText).buffer
        : new ArrayBuffer(1),
    ]),
  ) as Record<ModelAssetName, ArrayBuffer>;

  return { manifest, assets, source: "network" };
}

describe("KwsSessionController model keywords", () => {
  test("loads model keywords before initializing the Worker", async () => {
    const loaded = modelPackage("A B @alpha\nC D");
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const controller = new KwsSessionController({
      modelManager: new FakeModelManager(loaded),
      createKwsWorker: createWorker,
    });

    await vi.waitFor(() => expect(createWorker).toHaveBeenCalledOnce());

    expect(controller.getSnapshot().settings.keywords).toMatchObject([
      { label: "alpha", phrase: "A B", alias: "alpha", enabled: true },
      { label: "C D", phrase: "C D", enabled: true },
    ]);
    expect(worker.messages[0]).toMatchObject({
      type: "initialize",
      assets: { keywords: loaded.assets.keywords },
    });

    const edited = cloneSettings(controller.getSnapshot().settings);
    edited.keywords[0].boost = 1.5;
    edited.keywords[0].threshold = 0.35;
    edited.keywords[1].enabled = false;

    expect(controller.applySettings(edited)).toEqual([]);
    expect(worker.messages[1]).toEqual({
      type: "rebuild-keywords",
      keywordsText: "A B :1.50 #0.35 @alpha\n",
      maxActivePaths: 4,
    });
    controller.dispose();
  });

  test("rejects malformed model keywords before Worker creation", async () => {
    const createWorker = vi.fn();
    const controller = new KwsSessionController({
      modelManager: new FakeModelManager(modelPackage("A B #2")),
      createKwsWorker: createWorker,
    });

    await vi.waitFor(() => {
      expect(controller.getSnapshot().app.phase).toBe("recoverable-error");
    });

    expect(controller.getSnapshot().app.lastError?.message).toContain(
      "Invalid keywords.txt at line 1: threshold must be between 0 and 1",
    );
    expect(createWorker).not.toHaveBeenCalled();
    controller.dispose();
  });
});

describe("KwsSessionController waveform timeline", () => {
  test("continues analysis sample positions after stopping and resuming listening", async () => {
    vi.stubGlobal("crossOriginIsolated", true);
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
    vi.stubGlobal("Worker", FakeAnalysisWorker);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          const track = {
            getSettings: () => ({ sampleRate: 16_000 }),
            stop: vi.fn(),
          };
          return {
            getAudioTracks: () => [track],
            getTracks: () => [track],
          };
        }),
      },
    });

    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker as unknown as Worker);
    const controller = new KwsSessionController({
      modelManager: new FakeModelManager(modelPackage("A B")),
      createKwsWorker: createWorker,
    });

    await vi.waitFor(() => expect(createWorker).toHaveBeenCalledOnce());
    worker.onmessage?.({ data: { type: "engine-ready" } } as MessageEvent);
    await vi.waitFor(() => {
      expect(controller.getSnapshot().app.phase).toBe("ready-for-microphone");
    });

    await controller.startListening();
    const firstAnalysisWorker = FakeAnalysisWorker.instances[0];
    expect(firstAnalysisWorker).toBeDefined();
    firstAnalysisWorker?.onmessage?.({
      data: {
        type: "analysis-frame",
        startSample: 0,
        endSample: 1_600,
        rms: 0.1,
        centroid: 400,
      },
    } as MessageEvent);
    firstAnalysisWorker?.onmessage?.({
      data: {
        type: "audio-frame",
        samples: new Float32Array(1_600),
        sampleRate: 16_000,
      },
    } as MessageEvent);

    await controller.stopListening();
    await controller.startListening();
    const secondAnalysisWorker = FakeAnalysisWorker.instances[1];
    expect(secondAnalysisWorker).toBeDefined();

    secondAnalysisWorker?.onmessage?.({
      data: {
        type: "analysis-frame",
        startSample: 0,
        endSample: 400,
        rms: 0.2,
        centroid: 800,
      },
    } as MessageEvent);

    const resumedSlice = controller
      .getSnapshot()
      .waveHistory.slices.find((slice) => slice.rms === 0.2);
    expect(resumedSlice).toMatchObject({
      startSample: 1_600,
      endSample: 2_000,
    });
    controller.dispose();
  });
});
