const HEADER_LENGTH = 4;
const HEADER_BYTES = HEADER_LENGTH * Int32Array.BYTES_PER_ELEMENT;
const WRITE_INDEX = 0;
const READ_INDEX = 1;
const DROPPED_INDEX = 2;
const CLOSED_INDEX = 3;

interface RingDescriptor {
  buffer: SharedArrayBuffer;
  capacity: number;
}

interface CaptureProcessorOptions {
  processorOptions?: {
    ring?: RingDescriptor;
  };
}

declare abstract class AudioWorkletProcessor {
  constructor(options?: CaptureProcessorOptions);
  abstract process(inputs: Float32Array[][]): boolean;
}

declare function registerProcessor(
  name: string,
  processorConstructor: typeof AudioWorkletProcessor,
): void;

function distance(newer: number, older: number): number {
  return (newer - older) >>> 0;
}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  private readonly header: Int32Array;
  private readonly data: Float32Array;
  private readonly capacity: number;

  constructor(options?: CaptureProcessorOptions) {
    super(options);
    const descriptor = options?.processorOptions?.ring;
    if (!descriptor || descriptor.capacity <= 0) {
      throw new Error("pcm-capture requires a shared ring descriptor");
    }
    this.capacity = descriptor.capacity;
    this.header = new Int32Array(descriptor.buffer, 0, HEADER_LENGTH);
    this.data = new Float32Array(
      descriptor.buffer,
      HEADER_BYTES,
      descriptor.capacity,
    );
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel || Atomics.load(this.header, CLOSED_INDEX) !== 0) {
      return true;
    }

    let write = Atomics.load(this.header, WRITE_INDEX);
    for (let index = 0; index < channel.length; index += 1) {
      while (distance(write, Atomics.load(this.header, READ_INDEX)) >= this.capacity) {
        const read = Atomics.load(this.header, READ_INDEX);
        if (distance(write, read) < this.capacity) {
          break;
        }
        if (
          Atomics.compareExchange(
            this.header,
            READ_INDEX,
            read,
            (read + 1) | 0,
          ) === read
        ) {
          Atomics.add(this.header, DROPPED_INDEX, 1);
          break;
        }
      }

      this.data[(write >>> 0) % this.capacity] = channel[index];
      write = (write + 1) | 0;
      Atomics.store(this.header, WRITE_INDEX, write);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
