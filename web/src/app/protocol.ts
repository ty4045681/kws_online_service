import type { ModelAssetName, ModelManifest } from "../model/manifest";

export type KwsEngineSelection = "mock" | "sherpa";

export interface InitializeKwsWorkerMessage {
  type: "initialize";
  manifest: ModelManifest;
  assets: Record<ModelAssetName, ArrayBuffer>;
  engine: KwsEngineSelection;
}

export interface AudioFrameKwsWorkerMessage {
  type: "audio-frame";
  samples: Float32Array;
  sampleRate: number;
}

export interface RebuildKeywordsKwsWorkerMessage {
  type: "rebuild-keywords";
  keywordsText: string;
}

export interface ResetKwsWorkerMessage {
  type: "reset";
}

export interface StopKwsWorkerMessage {
  type: "stop";
}

export interface DestroyKwsWorkerMessage {
  type: "destroy";
}

export type KwsWorkerInboundMessage =
  | InitializeKwsWorkerMessage
  | AudioFrameKwsWorkerMessage
  | RebuildKeywordsKwsWorkerMessage
  | ResetKwsWorkerMessage
  | StopKwsWorkerMessage
  | DestroyKwsWorkerMessage;

export interface EngineProgressWorkerMessage {
  type: "engine-progress";
  stage: string;
  loaded: number;
  total: number;
}

export interface EngineReadyWorkerMessage {
  type: "engine-ready";
}

export interface PartialWorkerMessage {
  type: "partial";
  keyword: string;
  tokens: string[];
  startSample: number;
  endSample: number;
  matchedTokenCount: number;
  keywordTokenCount: number;
  revision: number;
}

export interface ExpiredWorkerMessage {
  type: "expired";
  revision: number;
  startSample: number;
  endSample: number;
}

export interface PartialResetWorkerMessage {
  type: "partial-reset";
}

export interface DetectedWorkerMessage {
  type: "detected";
  keyword: string;
  tokens: string[];
  tokenTimestamps: number[];
  startTime: number;
  endTime: number;
}

export interface DiagnosticsWorkerMessage {
  type: "diagnostics";
  inferenceMs: number;
  realtimeFactor: number;
  queuedSamples: number;
  droppedSamples: number;
}

export interface ErrorWorkerMessage {
  type: "error";
  recoverable: boolean;
  code: string;
  message: string;
}

export type WorkerMessage =
  | EngineProgressWorkerMessage
  | EngineReadyWorkerMessage
  | PartialWorkerMessage
  | ExpiredWorkerMessage
  | PartialResetWorkerMessage
  | DetectedWorkerMessage
  | DiagnosticsWorkerMessage
  | ErrorWorkerMessage;
