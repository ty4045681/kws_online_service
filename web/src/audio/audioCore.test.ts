import { expect, test } from "vitest";
import { SharedPcmRing } from "./sharedPcmRing";
import { StreamingResampler } from "./streamingResampler";

test("ring keeps newest samples after overflow", () => {
  const ring = SharedPcmRing.create(4);
  ring.write(Float32Array.of(1, 2, 3, 4, 5));
  const output = new Float32Array(4);
  expect(ring.readInto(output)).toBe(4);
  expect([...output]).toEqual([2, 3, 4, 5]);
  expect(ring.droppedSamples).toBe(1);
});

test("streaming 48 kHz to 16 kHz keeps chunk continuity", () => {
  const source = Float32Array.from(
    { length: 9600 },
    (_, index) => Math.sin((2 * Math.PI * 1000 * index) / 48000),
  );
  const resampler = new StreamingResampler(48000, 16000);
  const first = resampler.process(source.subarray(0, 3101));
  const second = resampler.process(source.subarray(3101));
  expect(first.length + second.length).toBeGreaterThanOrEqual(3190);
  expect(first.length + second.length).toBeLessThanOrEqual(3210);
});
