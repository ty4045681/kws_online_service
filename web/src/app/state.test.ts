import { expect, test } from "vitest";

import { initialState, reduce } from "./state";

test("handles partial, ignores stale expiry, then detects", () => {
  const partial = reduce(initialState, {
    type: "partial",
    keyword: "hey eva",
    tokens: ["HEY"],
    startSample: 6720,
    endSample: 11360,
    matchedTokenCount: 1,
    keywordTokenCount: 2,
    revision: 18,
  });
  const stale = reduce(partial, {
    type: "expired",
    revision: 17,
    startSample: 6000,
    endSample: 9000,
  });

  expect(stale.match.kind).toBe("partial");

  const detected = reduce(stale, {
    type: "detected",
    keyword: "hey eva",
    tokens: ["HEY", "EVA"],
    tokenTimestamps: [0.42, 0.76],
    startTime: 0.42,
    endTime: 1.08,
  });

  expect(detected.match.kind).toBe("detected");
});
