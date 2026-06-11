import { describe, expect, test, vi } from "vitest";

import type {
  LoadedModelPackage,
  ModelAssetManagerApi,
} from "../model/modelAssetManager";
import type { ModelAssetName, ModelManifest } from "../model/manifest";
import { KwsSessionController } from "./KwsSessionController";
import { cloneSettings } from "./settings";

const encoder = new TextEncoder();

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
  onmessage: Worker["onmessage"] = null;
  onerror: Worker["onerror"] = null;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {}
}

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
