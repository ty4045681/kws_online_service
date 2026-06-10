import type { WorkerMessage } from "../app/protocol";
import type { ModelAssetName, ModelManifest } from "../model/manifest";

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
