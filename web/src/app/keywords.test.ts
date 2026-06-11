import { describe, expect, test } from "vitest";

import { parseKeywordsText, serializeEnabledKeywords } from "./keywords";

describe("parseKeywordsText", () => {
  test("parses metadata in any position and applies defaults", () => {
    const keywords = parseKeywordsText([
      "@hello-eva ▁HELLO :2.5 ▁EVA #0.4",
      "",
      "▁HEY ▁EVA",
    ].join("\n"));

    expect(keywords).toMatchObject([
      {
        label: "hello-eva",
        phrase: "▁HELLO ▁EVA",
        alias: "hello-eva",
        enabled: true,
        boost: 2.5,
        threshold: 0.4,
      },
      {
        label: "▁HEY ▁EVA",
        phrase: "▁HEY ▁EVA",
        enabled: true,
        boost: 1,
        threshold: 0.25,
      },
    ]);
  });

  test.each([
    ["#0.2", "at least one token is required"],
    ["A :1 :2", "duplicate boost"],
    ["A #0.2 #0.3", "duplicate threshold"],
    ["A @one @two", "duplicate alias"],
    ["A :", "boost must be a finite number"],
    ["A :Infinity", "boost must be a finite number"],
    ["A :10.1", "boost must be between 0 and 10"],
    ["A #NaN", "threshold must be a finite number"],
    ["A #-0.1", "threshold must be between 0 and 1"],
    ["A @", "alias must not be empty"],
  ])("rejects %s", (line, reason) => {
    expect(() => parseKeywordsText(`\n${line}`)).toThrow(
      `Invalid keywords.txt at line 2: ${reason}`,
    );
  });

  test("creates stable distinct IDs for duplicate lines", () => {
    const first = parseKeywordsText("A B\nA B");
    const second = parseKeywordsText("A B\nA B");

    expect(first.map(({ id }) => id)).toEqual(second.map(({ id }) => id));
    expect(first[0].id).not.toBe(first[1].id);
  });
});

describe("serializeEnabledKeywords", () => {
  test("serializes only enabled keywords in canonical sherpa format", () => {
    const parsed = parseKeywordsText("A B :1.4 #0.3 @alpha\nC D\nE F");
    parsed[1].enabled = false;

    expect(serializeEnabledKeywords(parsed)).toBe(
      "A B :1.40 #0.30 @alpha\nE F :1.00 #0.25\n",
    );
  });

  test("returns an empty string when every keyword is disabled", () => {
    const parsed = parseKeywordsText("A B @alpha");
    parsed[0].enabled = false;

    expect(serializeEnabledKeywords(parsed)).toBe("");
  });
});
