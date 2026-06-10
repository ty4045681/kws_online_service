const POSITION_EPSILON = 1e-10;

function normalizePosition(position: number): number {
  const nearestInteger = Math.round(position);
  return Math.abs(position - nearestInteger) < POSITION_EPSILON
    ? nearestInteger
    : position;
}

export class StreamingResampler {
  readonly inputRate: number;
  readonly outputRate: number;

  private readonly sourceStep: number;
  private totalInputSamples = 0;
  private nextSourcePosition = 0;
  private previousSample = 0;
  private hasPreviousSample = false;

  constructor(inputRate: number, outputRate: number) {
    if (!Number.isFinite(inputRate) || inputRate <= 0) {
      throw new RangeError("Input sample rate must be positive");
    }
    if (!Number.isFinite(outputRate) || outputRate <= 0) {
      throw new RangeError("Output sample rate must be positive");
    }
    this.inputRate = inputRate;
    this.outputRate = outputRate;
    this.sourceStep = inputRate / outputRate;
  }

  process(input: Float32Array): Float32Array {
    if (input.length === 0) {
      return new Float32Array(0);
    }

    const chunkStart = this.totalInputSamples;
    const chunkEnd = chunkStart + input.length;
    let position = this.nextSourcePosition;
    let outputLength = 0;

    while (this.canInterpolate(position, chunkStart, chunkEnd)) {
      outputLength += 1;
      position = normalizePosition(position + this.sourceStep);
    }

    const output = new Float32Array(outputLength);
    position = this.nextSourcePosition;
    for (let index = 0; index < output.length; index += 1) {
      const normalized = normalizePosition(position);
      const baseIndex = Math.floor(normalized);
      const fraction = normalized - baseIndex;
      const first = this.sampleAt(baseIndex, chunkStart, input);
      if (fraction < POSITION_EPSILON) {
        output[index] = first;
      } else {
        const second = this.sampleAt(baseIndex + 1, chunkStart, input);
        output[index] = first + (second - first) * fraction;
      }
      position = normalizePosition(normalized + this.sourceStep);
    }

    this.nextSourcePosition = position;
    this.totalInputSamples = chunkEnd;
    this.previousSample = input[input.length - 1];
    this.hasPreviousSample = true;
    return output;
  }

  reset(): void {
    this.totalInputSamples = 0;
    this.nextSourcePosition = 0;
    this.previousSample = 0;
    this.hasPreviousSample = false;
  }

  private canInterpolate(
    position: number,
    chunkStart: number,
    chunkEnd: number,
  ): boolean {
    const normalized = normalizePosition(position);
    const baseIndex = Math.floor(normalized);
    if (baseIndex < chunkStart - 1 || baseIndex >= chunkEnd) {
      return false;
    }
    if (baseIndex === chunkStart - 1 && !this.hasPreviousSample) {
      return false;
    }
    const fraction = normalized - baseIndex;
    return fraction < POSITION_EPSILON || baseIndex + 1 < chunkEnd;
  }

  private sampleAt(
    sourceIndex: number,
    chunkStart: number,
    input: Float32Array,
  ): number {
    if (sourceIndex === chunkStart - 1) {
      return this.previousSample;
    }
    return input[sourceIndex - chunkStart];
  }
}
