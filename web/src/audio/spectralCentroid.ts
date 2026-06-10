const MAX_DFT_SIZE = 512;

export function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples.length);
}

export function calculateSpectralCentroid(
  samples: Float32Array,
  sampleRate: number,
): number {
  if (samples.length < 2 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return 0;
  }

  const size = Math.min(samples.length, MAX_DFT_SIZE);
  const offset = samples.length - size;
  let mean = 0;
  for (let index = 0; index < size; index += 1) {
    mean += samples[offset + index];
  }
  mean /= size;

  let magnitudeSum = 0;
  let weightedFrequencySum = 0;
  const highestBin = Math.floor(size / 2);

  for (let bin = 1; bin <= highestBin; bin += 1) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < size; index += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
      const sample = (samples[offset + index] - mean) * window;
      const phase = (2 * Math.PI * bin * index) / size;
      real += sample * Math.cos(phase);
      imaginary -= sample * Math.sin(phase);
    }

    const magnitude = Math.hypot(real, imaginary);
    const frequency = (bin * sampleRate) / size;
    magnitudeSum += magnitude;
    weightedFrequencySum += frequency * magnitude;
  }

  return magnitudeSum > 0 ? weightedFrequencySum / magnitudeSum : 0;
}
