import { expect, test } from "vitest";
import { SharedPcmRing } from "./sharedPcmRing";

test("ring keeps newest samples after overflow", () => {
  const ring = SharedPcmRing.create(4);
  ring.write(Float32Array.of(1, 2, 3, 4, 5));
  const output = new Float32Array(4);
  expect(ring.readInto(output)).toBe(4);
  expect([...output]).toEqual([2, 3, 4, 5]);
  expect(ring.droppedSamples).toBe(1);
});
