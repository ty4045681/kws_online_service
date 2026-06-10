import type {
  ErrorWorkerMessage,
  KwsEngineSelection,
  KwsWorkerInboundMessage,
  WorkerMessage,
} from "../app/protocol";
import type { KwsEngine } from "../kws/KwsEngine";
import { MockKwsEngine } from "../kws/MockKwsEngine";
import { SherpaKwsEngine } from "../kws/SherpaKwsEngine";

interface WorkerScope {
  postMessage(message: WorkerMessage): void;
  onmessage: ((event: MessageEvent<KwsWorkerInboundMessage>) => void) | null;
}

const workerScope = self as unknown as WorkerScope;
let engine: KwsEngine | null = null;
let initializationStarted = false;
let initialized = false;

function emit(message: WorkerMessage): void {
  workerScope.postMessage(message);
}

function recoverableError(code: string, message: string): ErrorWorkerMessage {
  return { type: "error", recoverable: true, code, message };
}

function createEngine(selection: KwsEngineSelection): KwsEngine | ErrorWorkerMessage {
  if (selection === "mock") {
    return new MockKwsEngine();
  }
  return new SherpaKwsEngine();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function initialize(message: Extract<KwsWorkerInboundMessage, { type: "initialize" }>) {
  if (initializationStarted) {
    emit(recoverableError("ALREADY_INITIALIZED", "KWS worker can only be initialized once"));
    return;
  }

  initializationStarted = true;
  const created = createEngine(message.engine);
  if ("type" in created) {
    emit(created);
    return;
  }

  engine = created;
  try {
    await engine.initialize({
      manifest: message.manifest,
      assets: message.assets,
      emit,
    });
    initialized = true;
  } catch (error) {
    engine.destroy();
    engine = null;
    emit(recoverableError("INITIALIZATION_FAILED", errorMessage(error)));
  }
}

function requireEngine(): KwsEngine | null {
  if (!initialized || !engine) {
    emit(recoverableError("NOT_INITIALIZED", "KWS worker is not initialized"));
    return null;
  }
  return engine;
}

function stopEngine(): void {
  const activeEngine = requireEngine();
  if (!activeEngine) {
    return;
  }

  activeEngine.reset();
  activeEngine.destroy();
  engine = null;
  initialized = false;
}

async function handleMessage(message: KwsWorkerInboundMessage): Promise<void> {
  if (message.type === "initialize") {
    await initialize(message);
    return;
  }

  const activeEngine = requireEngine();
  if (!activeEngine) {
    return;
  }

  try {
    switch (message.type) {
      case "audio-frame":
        activeEngine.acceptWaveform(message.samples, message.sampleRate);
        break;
      case "rebuild-keywords":
        await activeEngine.rebuildKeywordStream(message.keywordsText);
        break;
      case "reset":
        activeEngine.reset();
        break;
      case "stop":
      case "destroy":
        stopEngine();
        break;
    }
  } catch (error) {
    const code = message.type === "rebuild-keywords"
      ? "KEYWORD_REBUILD_FAILED"
      : "ENGINE_OPERATION_FAILED";
    emit(recoverableError(code, errorMessage(error)));
  }
}

workerScope.onmessage = (event) => {
  void handleMessage(event.data);
};
