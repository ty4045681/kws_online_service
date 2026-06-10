import type { WorkerMessage } from "../app/protocol";
import type { KwsEngine } from "./KwsEngine";

export interface MockKwsScriptEvent {
  atSample: number;
  message: WorkerMessage;
}

const defaultScript: readonly MockKwsScriptEvent[] = [
  {
    atSample: 4000,
    message: {
      type: "partial",
      keyword: "hey eva",
      tokens: ["HEY"],
      startSample: 0,
      endSample: 4000,
      matchedTokenCount: 1,
      keywordTokenCount: 2,
      revision: 1,
    },
  },
  {
    atSample: 8000,
    message: {
      type: "expired",
      revision: 1,
      startSample: 0,
      endSample: 8000,
    },
  },
  {
    atSample: 12000,
    message: {
      type: "partial",
      keyword: "hey eva",
      tokens: ["HEY", "EVA"],
      startSample: 8000,
      endSample: 12000,
      matchedTokenCount: 2,
      keywordTokenCount: 2,
      revision: 2,
    },
  },
  {
    atSample: 16000,
    message: {
      type: "detected",
      keyword: "hey eva",
      tokens: ["HEY", "EVA"],
      tokenTimestamps: [0.5, 0.75],
      startTime: 0.5,
      endTime: 1,
    },
  },
];

function cloneMessage(message: WorkerMessage): WorkerMessage {
  switch (message.type) {
    case "partial":
      return { ...message, tokens: [...message.tokens] };
    case "detected":
      return {
        ...message,
        tokens: [...message.tokens],
        tokenTimestamps: [...message.tokenTimestamps],
      };
    default:
      return { ...message };
  }
}

export class MockKwsEngine implements KwsEngine {
  private readonly script: readonly MockKwsScriptEvent[];
  private emit?: (message: WorkerMessage) => void;
  private cumulativeSamples = 0;
  private scriptCursor = 0;
  private keywordsText = "";
  private destroyed = false;

  constructor(script: readonly MockKwsScriptEvent[] = defaultScript) {
    this.script = script.map(({ atSample, message }) => ({
      atSample,
      message: cloneMessage(message),
    }));
  }

  get activeKeywordsText(): string {
    return this.keywordsText;
  }

  async initialize(input: Parameters<KwsEngine["initialize"]>[0]): Promise<void> {
    if (this.destroyed) {
      throw new Error("Mock KWS engine has been destroyed");
    }

    this.emit = input.emit;
    this.emit({
      type: "engine-progress",
      stage: "mock-initialize",
      loaded: 1,
      total: 1,
    });
    this.emit({ type: "engine-ready" });
  }

  acceptWaveform(samples: Float32Array, sampleRate: number): void {
    void sampleRate;
    if (this.destroyed || !this.emit) {
      return;
    }

    this.cumulativeSamples += samples.length;
    while (
      this.scriptCursor < this.script.length &&
      this.script[this.scriptCursor].atSample <= this.cumulativeSamples
    ) {
      this.emit(cloneMessage(this.script[this.scriptCursor].message));
      this.scriptCursor += 1;
    }
  }

  async rebuildKeywordStream(keywordsText: string): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.keywordsText = keywordsText;
    this.restartStream();
  }

  reset(): void {
    if (this.destroyed) {
      return;
    }

    this.restartStream();
  }

  destroy(): void {
    this.destroyed = true;
    this.emit = undefined;
  }

  private restartStream(): void {
    this.cumulativeSamples = 0;
    this.scriptCursor = 0;
    this.emit?.({ type: "partial-reset" });
  }
}
