import type { DetectedWorkerMessage } from "./protocol";

export interface WakeWordDetectedDetail {
  keyword: string;
  tokens: string[];
  tokenTimestamps: number[];
  startTime: number;
  endTime: number;
  detectedAt: number;
}

declare global {
  interface WindowEventMap {
    "wakeword-detected": CustomEvent<WakeWordDetectedDetail>;
  }
}

export function dispatchWakeWordDetected(
  result: DetectedWorkerMessage,
  detectedAt = Date.now(),
): WakeWordDetectedDetail {
  const detail: WakeWordDetectedDetail = {
    keyword: result.keyword,
    tokens: [...result.tokens],
    tokenTimestamps: [...result.tokenTimestamps],
    startTime: result.startTime,
    endTime: result.endTime,
    detectedAt,
  };

  window.dispatchEvent(
    new CustomEvent<WakeWordDetectedDetail>("wakeword-detected", { detail }),
  );
  return detail;
}
