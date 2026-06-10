import {
  SharedPcmRing,
  type SharedPcmRingDescriptor,
} from "../audio/sharedPcmRing";
import { StreamingResampler } from "../audio/streamingResampler";
import {
  calculateRms,
  calculateSpectralCentroid,
} from "../audio/spectralCentroid";

const OUTPUT_SAMPLE_RATE = 16000;
const AUDIO_FRAME_SAMPLES = 320;
const ANALYSIS_FRAMES_PER_SECOND = 15;
const POLL_INTERVAL_MS = 12;
const DIAGNOSTICS_INTERVAL_MS = 1000;
const HEADER_WRITE_INDEX = 0;
const HEADER_READ_INDEX = 1;

interface StartMessage {
  type: "start";
  ring: SharedPcmRingDescriptor;
  inputSampleRate: number;
}

interface StopMessage {
  type: "stop";
}

type AudioAnalysisInboundMessage = StartMessage | StopMessage;

interface AnalysisFrameMessage {
  type: "analysis-frame";
  rms: number;
  centroid: number;
  startSample: number;
  endSample: number;
}

interface AudioFrameMessage {
  type: "audio-frame";
  samples: Float32Array;
  sampleRate: 16000;
}

interface AudioDiagnosticsMessage {
  type: "audio-diagnostics";
  queuedSamples: number;
  droppedSamples: number;
}

type AudioAnalysisOutboundMessage =
  | AnalysisFrameMessage
  | AudioFrameMessage
  | AudioDiagnosticsMessage;

interface AudioWorkerScope {
  onmessage: ((event: MessageEvent<AudioAnalysisInboundMessage>) => void) | null;
  postMessage(message: AudioAnalysisOutboundMessage, transfer?: Transferable[]): void;
}

interface AnalysisState {
  ring: SharedPcmRing;
  descriptor: SharedPcmRingDescriptor;
  inputSampleRate: number;
  resampler: StreamingResampler;
  readBuffer: Float32Array;
  analysisBuffer: Float32Array;
  analysisLength: number;
  analysisStartSample: number;
  inputSampleCursor: number;
  audioFrame: Float32Array;
  audioFrameLength: number;
  lastDiagnosticsAt: number;
  timer: number | null;
}

const workerScope = self as unknown as AudioWorkerScope;
let state: AnalysisState | null = null;

function queuedSamples(descriptor: SharedPcmRingDescriptor): number {
  const header = new Int32Array(descriptor.buffer, 0, 4);
  const write = Atomics.load(header, HEADER_WRITE_INDEX);
  const read = Atomics.load(header, HEADER_READ_INDEX);
  return Math.min((write - read) >>> 0, descriptor.capacity);
}

function emitAudioSamples(active: AnalysisState, samples: Float32Array): void {
  let sourceOffset = 0;
  while (sourceOffset < samples.length) {
    const copyCount = Math.min(
      samples.length - sourceOffset,
      AUDIO_FRAME_SAMPLES - active.audioFrameLength,
    );
    active.audioFrame.set(
      samples.subarray(sourceOffset, sourceOffset + copyCount),
      active.audioFrameLength,
    );
    active.audioFrameLength += copyCount;
    sourceOffset += copyCount;

    if (active.audioFrameLength === AUDIO_FRAME_SAMPLES) {
      const completedFrame = active.audioFrame;
      workerScope.postMessage(
        {
          type: "audio-frame",
          samples: completedFrame,
          sampleRate: OUTPUT_SAMPLE_RATE,
        },
        [completedFrame.buffer],
      );
      active.audioFrame = new Float32Array(AUDIO_FRAME_SAMPLES);
      active.audioFrameLength = 0;
    }
  }
}

function emitAnalysis(active: AnalysisState, samples: Float32Array): void {
  let sourceOffset = 0;
  while (sourceOffset < samples.length) {
    if (active.analysisLength === 0) {
      active.analysisStartSample = active.inputSampleCursor + sourceOffset;
    }
    const copyCount = Math.min(
      samples.length - sourceOffset,
      active.analysisBuffer.length - active.analysisLength,
    );
    active.analysisBuffer.set(
      samples.subarray(sourceOffset, sourceOffset + copyCount),
      active.analysisLength,
    );
    active.analysisLength += copyCount;
    sourceOffset += copyCount;

    if (active.analysisLength === active.analysisBuffer.length) {
      workerScope.postMessage({
        type: "analysis-frame",
        rms: calculateRms(active.analysisBuffer),
        centroid: calculateSpectralCentroid(
          active.analysisBuffer,
          active.inputSampleRate,
        ),
        startSample: active.analysisStartSample,
        endSample: active.analysisStartSample + active.analysisLength,
      });
      active.analysisLength = 0;
    }
  }
}

function poll(): void {
  const active = state;
  if (!active) {
    return;
  }

  const readCount = active.ring.readInto(active.readBuffer);
  if (readCount > 0) {
    const input = active.readBuffer.subarray(0, readCount);
    emitAnalysis(active, input);
    emitAudioSamples(active, active.resampler.process(input));
    active.inputSampleCursor += readCount;
  }

  const now = performance.now();
  if (now - active.lastDiagnosticsAt >= DIAGNOSTICS_INTERVAL_MS) {
    workerScope.postMessage({
      type: "audio-diagnostics",
      queuedSamples: queuedSamples(active.descriptor),
      droppedSamples: active.ring.droppedSamples,
    });
    active.lastDiagnosticsAt = now;
  }

  active.timer = setTimeout(poll, POLL_INTERVAL_MS);
}

function stop(): void {
  if (state?.timer !== null && state?.timer !== undefined) {
    clearTimeout(state.timer);
  }
  state = null;
}

function start(message: StartMessage): void {
  stop();
  if (!Number.isFinite(message.inputSampleRate) || message.inputSampleRate <= 0) {
    return;
  }

  const analysisSampleCount = Math.max(
    1,
    Math.round(message.inputSampleRate / ANALYSIS_FRAMES_PER_SECOND),
  );
  state = {
    ring: SharedPcmRing.fromDescriptor(message.ring),
    descriptor: message.ring,
    inputSampleRate: message.inputSampleRate,
    resampler: new StreamingResampler(
      message.inputSampleRate,
      OUTPUT_SAMPLE_RATE,
    ),
    readBuffer: new Float32Array(Math.min(message.ring.capacity, 4096)),
    analysisBuffer: new Float32Array(analysisSampleCount),
    analysisLength: 0,
    analysisStartSample: 0,
    inputSampleCursor: 0,
    audioFrame: new Float32Array(AUDIO_FRAME_SAMPLES),
    audioFrameLength: 0,
    lastDiagnosticsAt: performance.now(),
    timer: null,
  };
  poll();
}

workerScope.onmessage = (event) => {
  if (event.data.type === "start") {
    start(event.data);
  } else {
    stop();
  }
};
