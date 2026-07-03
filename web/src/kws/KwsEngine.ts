import type { WorkerMessage } from "../app/protocol";
import type { ModelAssetName, ModelManifest } from "../model/manifest";

export interface KwsEngine {
  initialize(input: {
    manifest: ModelManifest;
    assets: Record<ModelAssetName, ArrayBuffer>;
    maxActivePaths: number;
    emit: (message: WorkerMessage) => void;
  }): Promise<void>;
  acceptWaveform(samples: Float32Array, sampleRate: number): void;
  rebuildKeywordStream(keywordsText: string, maxActivePaths: number): Promise<void>;
  reset(): void;
  destroy(): void;
}
