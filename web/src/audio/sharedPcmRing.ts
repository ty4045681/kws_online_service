const HEADER_LENGTH = 4;
const HEADER_BYTES = HEADER_LENGTH * Int32Array.BYTES_PER_ELEMENT;
const WRITE_INDEX = 0;
const READ_INDEX = 1;
const DROPPED_INDEX = 2;
const CLOSED_INDEX = 3;

export interface SharedPcmRingDescriptor {
  buffer: SharedArrayBuffer;
  capacity: number;
}

function nextCounter(value: number, amount = 1): number {
  return (value + amount) | 0;
}

function counterDistance(newer: number, older: number): number {
  return (newer - older) >>> 0;
}

function validateCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new RangeError("Shared PCM ring capacity must be a positive integer");
  }
}

export class SharedPcmRing {
  readonly descriptor: SharedPcmRingDescriptor;

  private readonly header: Int32Array;
  private readonly data: Float32Array;

  private constructor(descriptor: SharedPcmRingDescriptor) {
    validateCapacity(descriptor.capacity);
    const requiredBytes = HEADER_BYTES
      + descriptor.capacity * Float32Array.BYTES_PER_ELEMENT;
    if (descriptor.buffer.byteLength < requiredBytes) {
      throw new RangeError("Shared PCM ring buffer is smaller than its capacity");
    }

    this.descriptor = descriptor;
    this.header = new Int32Array(descriptor.buffer, 0, HEADER_LENGTH);
    this.data = new Float32Array(
      descriptor.buffer,
      HEADER_BYTES,
      descriptor.capacity,
    );
  }

  static create(capacity: number): SharedPcmRing {
    validateCapacity(capacity);
    const buffer = new SharedArrayBuffer(
      HEADER_BYTES + capacity * Float32Array.BYTES_PER_ELEMENT,
    );
    return new SharedPcmRing({ buffer, capacity });
  }

  static fromDescriptor(descriptor: SharedPcmRingDescriptor): SharedPcmRing {
    return new SharedPcmRing(descriptor);
  }

  get droppedSamples(): number {
    return Atomics.load(this.header, DROPPED_INDEX) >>> 0;
  }

  write(input: Float32Array): number {
    if (Atomics.load(this.header, CLOSED_INDEX) !== 0) {
      return 0;
    }

    const capacity = this.descriptor.capacity;
    let write = Atomics.load(this.header, WRITE_INDEX);

    for (let index = 0; index < input.length; index += 1) {
      while (counterDistance(write, Atomics.load(this.header, READ_INDEX)) >= capacity) {
        const read = Atomics.load(this.header, READ_INDEX);
        if (counterDistance(write, read) < capacity) {
          break;
        }
        if (
          Atomics.compareExchange(
            this.header,
            READ_INDEX,
            read,
            nextCounter(read),
          ) === read
        ) {
          Atomics.add(this.header, DROPPED_INDEX, 1);
          break;
        }
      }

      this.data[(write >>> 0) % capacity] = input[index];
      write = nextCounter(write);
      Atomics.store(this.header, WRITE_INDEX, write);
    }

    return input.length;
  }

  readInto(output: Float32Array): number {
    if (output.length === 0) {
      return 0;
    }

    const capacity = this.descriptor.capacity;
    while (true) {
      const read = Atomics.load(this.header, READ_INDEX);
      const write = Atomics.load(this.header, WRITE_INDEX);
      const available = Math.min(counterDistance(write, read), capacity);
      const count = Math.min(output.length, available);
      if (count === 0) {
        return 0;
      }

      for (let index = 0; index < count; index += 1) {
        output[index] = this.data[((read >>> 0) + index) % capacity];
      }

      if (
        Atomics.compareExchange(
          this.header,
          READ_INDEX,
          read,
          nextCounter(read, count),
        ) === read
      ) {
        return count;
      }
    }
  }

  close(): void {
    Atomics.store(this.header, CLOSED_INDEX, 1);
    Atomics.notify(this.header, CLOSED_INDEX);
  }
}
