import { expect, test } from "vitest";

import { parseKeywordsText } from "./keywords";
import {
  cloneSettings,
  defaultSettings,
  replaceSettingsKeywords,
  settingsToKeywordsText,
  validateSettings,
} from "./settings";

test("default settings wait for keywords from the model package", () => {
  expect(defaultSettings.keywords).toEqual([]);
});

test("replaces keywords while preserving non-keyword settings", () => {
  const current = {
    ...defaultSettings,
    promptSound: false,
    maxActivePaths: 9,
  };
  const keywords = parseKeywordsText("A B @alpha");

  const next = replaceSettingsKeywords(current, keywords);

  expect(next).toMatchObject({ promptSound: false, maxActivePaths: 9 });
  expect(next.keywords).toEqual(keywords);
  expect(next.keywords).not.toBe(keywords);
  expect(next.keywords[0]).not.toBe(keywords[0]);
});

test("clones keyword metadata without sharing keyword objects", () => {
  const settings = replaceSettingsKeywords(
    defaultSettings,
    parseKeywordsText("A B @alpha"),
  );

  const clone = cloneSettings(settings);
  clone.keywords[0].alias = "changed";

  expect(settings.keywords[0].alias).toBe("alpha");
});

test("serializes settings through the canonical keyword formatter", () => {
  const settings = replaceSettingsKeywords(
    defaultSettings,
    parseKeywordsText("A B"),
  );

  expect(settingsToKeywordsText(settings)).toBe("A B :1.00 #0.25\n");
});

test("validates enabled keywords and parameter ranges", () => {
  const settings = replaceSettingsKeywords(
    defaultSettings,
    parseKeywordsText("A B"),
  );
  settings.keywords[0].enabled = false;
  settings.keywords[0].boost = 11;
  settings.keywords[0].threshold = -0.1;

  expect(validateSettings(settings)).toEqual([
    "请至少启用一个关键词",
    "A B 的阈值必须大于 0 且不超过 1",
    "A B 的增强值必须大于 0 且不超过 10",
  ]);
});

test("rejects zero threshold and boost", () => {
  const settings = replaceSettingsKeywords(
    defaultSettings,
    parseKeywordsText("A B"),
  );
  settings.keywords[0].threshold = 0;
  settings.keywords[0].boost = 0;

  expect(validateSettings(settings)).toEqual([
    "A B 的阈值必须大于 0 且不超过 1",
    "A B 的增强值必须大于 0 且不超过 10",
  ]);
});
