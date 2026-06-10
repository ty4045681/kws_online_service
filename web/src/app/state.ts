import type {
  DetectedWorkerMessage,
  DiagnosticsWorkerMessage,
  EngineProgressWorkerMessage,
  ErrorWorkerMessage,
  ExpiredWorkerMessage,
  PartialWorkerMessage,
  WorkerMessage,
} from "./protocol";

export type AppPhase =
  | "boot"
  | "loading-models"
  | "ready-for-microphone"
  | "requesting-permission"
  | "listening"
  | "stopped"
  | "recoverable-error";

export interface IdleMatchState {
  kind: "idle";
}

export interface PartialMatchState
  extends Omit<PartialWorkerMessage, "type"> {
  kind: "partial";
}

export interface ExpiredMatchState
  extends Omit<ExpiredWorkerMessage, "type"> {
  kind: "expired";
}

export interface DetectedMatchState
  extends Omit<DetectedWorkerMessage, "type"> {
  kind: "detected";
}

export type MatchState =
  | IdleMatchState
  | PartialMatchState
  | ExpiredMatchState
  | DetectedMatchState;

export interface AppState {
  phase: AppPhase;
  match: MatchState;
  modelProgress: Omit<EngineProgressWorkerMessage, "type"> | null;
  diagnostics: Omit<DiagnosticsWorkerMessage, "type"> | null;
  lastError: Omit<ErrorWorkerMessage, "type"> | null;
}

export type AppAction =
  | WorkerMessage
  | { type: "phase-changed"; phase: AppPhase }
  | { type: "reset" }
  | { type: "stream-reset" };

const idleMatch: IdleMatchState = { kind: "idle" };

export const initialState: AppState = {
  phase: "boot",
  match: idleMatch,
  modelProgress: null,
  diagnostics: null,
  lastError: null,
};

export function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "phase-changed":
      return { ...state, phase: action.phase };
    case "engine-progress":
      return {
        ...state,
        modelProgress: {
          stage: action.stage,
          loaded: action.loaded,
          total: action.total,
        },
      };
    case "engine-ready":
      return state;
    case "partial":
      return {
        ...state,
        match: {
          kind: "partial",
          keyword: action.keyword,
          tokens: [...action.tokens],
          startSample: action.startSample,
          endSample: action.endSample,
          matchedTokenCount: action.matchedTokenCount,
          keywordTokenCount: action.keywordTokenCount,
          revision: action.revision,
        },
      };
    case "expired":
      if (state.match.kind !== "partial" || state.match.revision !== action.revision) {
        return state;
      }
      return {
        ...state,
        match: {
          kind: "expired",
          revision: action.revision,
          startSample: action.startSample,
          endSample: action.endSample,
        },
      };
    case "partial-reset":
    case "reset":
    case "stream-reset":
      return { ...state, match: idleMatch };
    case "detected":
      return {
        ...state,
        match: {
          kind: "detected",
          keyword: action.keyword,
          tokens: [...action.tokens],
          tokenTimestamps: [...action.tokenTimestamps],
          startTime: action.startTime,
          endTime: action.endTime,
        },
      };
    case "diagnostics":
      return {
        ...state,
        diagnostics: {
          inferenceMs: action.inferenceMs,
          realtimeFactor: action.realtimeFactor,
          queuedSamples: action.queuedSamples,
          droppedSamples: action.droppedSamples,
        },
      };
    case "error":
      return {
        ...state,
        lastError: {
          recoverable: action.recoverable,
          code: action.code,
          message: action.message,
        },
      };
  }
}
