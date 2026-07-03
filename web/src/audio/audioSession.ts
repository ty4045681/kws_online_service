import workletUrl from "./pcm-capture.worklet.ts?worker&url";
import {
  SharedPcmRing,
  type SharedPcmRingDescriptor,
} from "./sharedPcmRing";

const RING_DURATION_SECONDS = 2;

export interface AudioSessionInfo {
  ring: SharedPcmRingDescriptor;
  sampleRate: number;
  settings: MediaTrackSettings;
  stop(): Promise<void>;
}

export class AudioSession {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private gain: GainNode | null = null;
  private ring: SharedPcmRing | null = null;
  private starting = false;

  async start(options?: {
    deviceId?: string;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  }): Promise<AudioSessionInfo> {
    if (globalThis.crossOriginIsolated !== true) {
      throw new Error("Microphone capture requires cross-origin isolation");
    }
    if (this.starting || this.stream || this.context) {
      throw new Error("Audio session is already running");
    }

    this.starting = true;
    try {
      const audioConstraints: MediaTrackConstraints = {
        channelCount: { ideal: 1 },
        echoCancellation: options?.echoCancellation ?? false,
        noiseSuppression: options?.noiseSuppression ?? false,
        autoGainControl: options?.autoGainControl ?? false,
      };
      if (options?.deviceId) {
        audioConstraints.deviceId = { exact: options.deviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      const track = this.stream.getAudioTracks()[0];
      if (!track) {
        throw new Error("Microphone stream did not provide an audio track");
      }

      this.context = new AudioContext({ latencyHint: "interactive" });
      await this.context.audioWorklet.addModule(workletUrl);

      this.ring = SharedPcmRing.create(
        Math.ceil(this.context.sampleRate * RING_DURATION_SECONDS),
      );
      this.source = this.context.createMediaStreamSource(this.stream);
      this.worklet = new AudioWorkletNode(this.context, "pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
        processorOptions: { ring: this.ring.descriptor },
      });
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;

      this.source.connect(this.worklet);
      this.worklet.connect(this.gain);
      this.gain.connect(this.context.destination);

      return {
        ring: this.ring.descriptor,
        sampleRate: this.context.sampleRate,
        settings: track.getSettings(),
        stop: () => this.stop(),
      };
    } catch (error) {
      await this.stop().catch(() => undefined);
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    const stream = this.stream;
    const context = this.context;
    const source = this.source;
    const worklet = this.worklet;
    const gain = this.gain;
    const ring = this.ring;

    this.stream = null;
    this.context = null;
    this.source = null;
    this.worklet = null;
    this.gain = null;
    this.ring = null;

    source?.disconnect();
    worklet?.disconnect();
    gain?.disconnect();
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    ring?.close();
    if (context && context.state !== "closed") {
      await context.close();
    }
  }
}
