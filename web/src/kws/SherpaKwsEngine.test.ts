import { expect, test } from "vitest";

import {
  finalResultToMessage,
  partialResultToMessage,
} from "./SherpaKwsEngine";

test("converts sherpa frame indexes to absolute 16 kHz sample ranges", () => {
  expect(
    partialResultToMessage(
      {
        keyword: "hey eva",
        tokens: ["HEY"],
        frame_indexes: [3, 5],
        matched_token_count: 1,
        keyword_token_count: 2,
        revision: 7,
        is_active: true,
      },
      16_000,
    ),
  ).toEqual({
    type: "partial",
    keyword: "hey eva",
    tokens: ["HEY"],
    startSample: 17_920,
    endSample: 19_840,
    matchedTokenCount: 1,
    keywordTokenCount: 2,
    revision: 7,
  });
});

test("converts final timestamps to absolute session time", () => {
  expect(
    finalResultToMessage(
      {
        keyword: "hey eva",
        tokens: ["HEY", "EVA"],
        timestamps: [0.12, 0.36],
        start_time: 0.12,
      },
      32_000,
    ),
  ).toEqual({
    type: "detected",
    keyword: "hey eva",
    tokens: ["HEY", "EVA"],
    tokenTimestamps: [2.12, 2.36],
    startTime: 2.12,
    endTime: 2.4,
  });
});

test("keeps a final detection when the keyword alias is omitted", () => {
  expect(
    finalResultToMessage(
      {
        keyword: "",
        tokens: ["HEY", "EVA"],
        timestamps: [0.12, 0.36],
        start_time: 0.12,
      },
      0,
    )?.keyword,
  ).toBe("HEY EVA");
});
