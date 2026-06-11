# Dynamic Keyword Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load strict keyword settings from each model package's `keywords.txt`, show all entries enabled in the existing settings drawer, and rebuild the KWS stream from the enabled entries and edited parameters.

**Architecture:** Add a pure `keywords.ts` boundary that owns sherpa keyword parsing, IDs, defaults, and serialization. Keep general setting validation in `settings.ts`, parse the verified keywords asset in `KwsSessionController` before Worker creation, and preserve the existing Worker protocol and settings UI controls.

**Tech Stack:** TypeScript 5.8, React 19, Vite 7, Vitest 4, sherpa-onnx WASM Worker protocol.

---

## File Structure

- Create `web/src/app/keywords.ts`: keyword data model, strict parser, stable ID generation, and enabled-keyword serializer.
- Create `web/src/app/keywords.test.ts`: parser and serializer unit tests.
- Modify `web/src/app/settings.ts`: remove hardcoded presets, import/re-export the keyword type, preserve keyword metadata while cloning, and delegate serialization.
- Create `web/src/app/settings.test.ts`: settings replacement, cloning, and validation tests.
- Modify `web/src/app/KwsSessionController.ts`: inject testable model/Worker dependencies, parse keywords before Worker initialization, and install model keywords into the settings snapshot.
- Create `web/src/app/KwsSessionController.test.ts`: model-load integration and invalid-file tests.
- Modify `web/src/components/SettingsDrawer.tsx`: describe entries as model-provided keywords while retaining enable/threshold/boost-only interaction.

### Task 1: Strict keyword parser and serializer

**Files:**
- Create: `web/src/app/keywords.ts`
- Create: `web/src/app/keywords.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create tests that define the public contract:

```typescript
import { describe, expect, test } from "vitest";
import { parseKeywordsText } from "./keywords";

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
```

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npm --prefix web test -- src/app/keywords.test.ts`

Expected: FAIL because `./keywords` does not exist.

- [ ] **Step 3: Implement the minimal parser**

Create `web/src/app/keywords.ts` with:

```typescript
export interface KeywordPreset {
  id: string;
  label: string;
  phrase: string;
  alias?: string;
  enabled: boolean;
  threshold: number;
  boost: number;
}

const defaultBoost = 1;
const defaultThreshold = 0.25;

function keywordError(lineNumber: number, reason: string): Error {
  return new Error(`Invalid keywords.txt at line ${lineNumber}: ${reason}`);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function parseKeywordsText(text: string): KeywordPreset[] {
  const keywords: KeywordPreset[] = [];
  for (const [index, rawLine] of text.split(/\r\n?|\n/).entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) continue;

    const tokens: string[] = [];
    let boost: number | undefined;
    let threshold: number | undefined;
    let alias: string | undefined;

    for (const field of line.split(/\s+/)) {
      const marker = field[0];
      if (marker === ":") {
        if (boost !== undefined) throw keywordError(lineNumber, "duplicate boost");
        const value = Number(field.slice(1));
        if (!field.slice(1) || !Number.isFinite(value)) {
          throw keywordError(lineNumber, "boost must be a finite number");
        }
        if (value < 0 || value > 10) {
          throw keywordError(lineNumber, "boost must be between 0 and 10");
        }
        boost = value;
      } else if (marker === "#") {
        if (threshold !== undefined) {
          throw keywordError(lineNumber, "duplicate threshold");
        }
        const value = Number(field.slice(1));
        if (!field.slice(1) || !Number.isFinite(value)) {
          throw keywordError(lineNumber, "threshold must be a finite number");
        }
        if (value < 0 || value > 1) {
          throw keywordError(lineNumber, "threshold must be between 0 and 1");
        }
        threshold = value;
      } else if (marker === "@") {
        if (alias !== undefined) throw keywordError(lineNumber, "duplicate alias");
        alias = field.slice(1);
        if (!alias) throw keywordError(lineNumber, "alias must not be empty");
      } else {
        tokens.push(field);
      }
    }

    if (tokens.length === 0) {
      throw keywordError(lineNumber, "at least one token is required");
    }
    const phrase = tokens.join(" ");
    keywords.push({
      id: `keyword-${lineNumber}-${stableHash(line)}`,
      label: alias ?? phrase,
      phrase,
      ...(alias === undefined ? {} : { alias }),
      enabled: true,
      boost: boost ?? defaultBoost,
      threshold: threshold ?? defaultThreshold,
    });
  }
  return keywords;
}
```

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `npm --prefix web test -- src/app/keywords.test.ts`

Expected: all parser tests pass.

- [ ] **Step 5: Write failing serializer tests**

Add tests proving disabled entries are omitted, aliases are preserved only when present, ordering is stable, values use two decimal places, and output has one trailing newline:

```typescript
test("serializes only enabled keywords in canonical sherpa format", () => {
  const parsed = parseKeywordsText("A B :1.4 #0.3 @alpha\nC D\nE F");
  parsed[1].enabled = false;
  expect(serializeEnabledKeywords(parsed)).toBe(
    "A B :1.40 #0.30 @alpha\nE F :1.00 #0.25\n",
  );
});
```

- [ ] **Step 6: Run serializer test and verify RED**

Run: `npm --prefix web test -- src/app/keywords.test.ts`

Expected: FAIL because `serializeEnabledKeywords` is not exported.

- [ ] **Step 7: Implement serializer and verify GREEN**

Add:

```typescript
export function serializeEnabledKeywords(keywords: readonly KeywordPreset[]): string {
  const lines = keywords
    .filter((keyword) => keyword.enabled)
    .map((keyword) => [
      keyword.phrase,
      `:${keyword.boost.toFixed(2)}`,
      `#${keyword.threshold.toFixed(2)}`,
      keyword.alias === undefined ? "" : `@${keyword.alias}`,
    ].filter(Boolean).join(" "));
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
```

Run: `npm --prefix web test -- src/app/keywords.test.ts`

Expected: all keyword tests pass.

- [ ] **Step 8: Commit parser and serializer**

```bash
git add web/src/app/keywords.ts web/src/app/keywords.test.ts
git commit -m "feat: parse model keyword settings"
```

### Task 2: Settings model integration

**Files:**
- Modify: `web/src/app/settings.ts`
- Create: `web/src/app/settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

Test that defaults no longer contain product-specific keywords, cloning preserves optional alias without sharing objects, model keywords replace the list while preserving non-keyword settings, and validation rejects all-disabled or out-of-range entries.

```typescript
import { expect, test } from "vitest";
import { parseKeywordsText } from "./keywords";
import {
  cloneSettings,
  defaultSettings,
  replaceSettingsKeywords,
  settingsToKeywordsText,
  validateSettings,
} from "./settings";

test("replaces keywords while preserving non-keyword settings", () => {
  const current = { ...defaultSettings, promptSound: false, maxActivePaths: 9 };
  const keywords = parseKeywordsText("A B @alpha");
  const next = replaceSettingsKeywords(current, keywords);
  expect(next).toMatchObject({ promptSound: false, maxActivePaths: 9 });
  expect(next.keywords).toEqual(keywords);
  expect(next.keywords).not.toBe(keywords);
});

test("serializes through the keyword formatter", () => {
  const settings = replaceSettingsKeywords(defaultSettings, parseKeywordsText("A B"));
  expect(settingsToKeywordsText(settings)).toBe("A B :1.00 #0.25\n");
});
```

- [ ] **Step 2: Run settings tests and verify RED**

Run: `npm --prefix web test -- src/app/settings.test.ts`

Expected: FAIL because `replaceSettingsKeywords` does not exist and defaults still contain hardcoded entries.

- [ ] **Step 3: Implement settings integration**

Move the `KeywordPreset` definition to `keywords.ts`, set `defaultSettings.keywords` to `[]`, re-export the type for existing callers, delegate `settingsToKeywordsText()` to `serializeEnabledKeywords()`, and add:

```typescript
export function replaceSettingsKeywords(
  settings: AppSettings,
  keywords: readonly KeywordPreset[],
): AppSettings {
  return {
    ...settings,
    keywords: keywords.map((keyword) => ({ ...keyword })),
  };
}
```

- [ ] **Step 4: Run settings and keyword tests and verify GREEN**

Run: `npm --prefix web test -- src/app/settings.test.ts src/app/keywords.test.ts`

Expected: all targeted tests pass.

- [ ] **Step 5: Commit settings changes**

```bash
git add web/src/app/settings.ts web/src/app/settings.test.ts
git commit -m "refactor: source settings keywords from models"
```

### Task 3: Controller model-load integration

**Files:**
- Modify: `web/src/app/KwsSessionController.ts`
- Create: `web/src/app/KwsSessionController.test.ts`

- [ ] **Step 1: Write failing controller integration tests**

Create a fake `ModelAssetManagerApi`, a fake Worker that records messages, and a valid `LoadedModelPackage`. Assert that valid keyword bytes populate settings before the Worker is created and that invalid bytes put the controller in `recoverable-error` without creating a Worker.

```typescript
test("loads model keywords before initializing the Worker", async () => {
  const worker = new FakeWorker();
  const createWorker = vi.fn(() => worker as unknown as Worker);
  const controller = new KwsSessionController({
    modelManager: new FakeModelManager(modelPackage("A B @alpha\nC D")),
    createKwsWorker: createWorker,
  });

  await vi.waitFor(() => expect(createWorker).toHaveBeenCalledOnce());
  expect(controller.getSnapshot().settings.keywords).toMatchObject([
    { label: "alpha", phrase: "A B", enabled: true },
    { label: "C D", phrase: "C D", enabled: true },
  ]);
  expect(worker.messages[0]).toMatchObject({ type: "initialize" });
  controller.dispose();
});

test("rejects malformed model keywords before Worker creation", async () => {
  const createWorker = vi.fn();
  const controller = new KwsSessionController({
    modelManager: new FakeModelManager(modelPackage("A B #2")),
    createKwsWorker: createWorker,
  });

  await vi.waitFor(() => {
    expect(controller.getSnapshot().app.phase).toBe("recoverable-error");
  });
  expect(controller.getSnapshot().app.lastError?.message).toContain(
    "Invalid keywords.txt at line 1",
  );
  expect(createWorker).not.toHaveBeenCalled();
  controller.dispose();
});
```

- [ ] **Step 2: Run controller tests and verify RED**

Run: `npm --prefix web test -- src/app/KwsSessionController.test.ts`

Expected: FAIL because the constructor does not accept dependencies and model keywords are not parsed.

- [ ] **Step 3: Add dependency injection and keyword parsing**

Add a small dependency interface:

```typescript
export interface KwsSessionControllerDependencies {
  modelManager: ModelAssetManagerApi;
  createKwsWorker: () => Worker;
}
```

Initialize defaults in the constructor, decode and parse `loaded.assets.keywords` immediately after `modelManager.load()`, and install them with `replaceSettingsKeywords()` before assigning `modelPackage` or calling `initializeKwsWorker()`. Change `initializeKwsWorker()` to call the injected factory.

- [ ] **Step 4: Run controller tests and verify GREEN**

Run: `npm --prefix web test -- src/app/KwsSessionController.test.ts`

Expected: all controller tests pass and malformed keyword files create no Worker.

- [ ] **Step 5: Add apply-settings message coverage**

Extend the valid-load test by calling `applySettings()` with one entry disabled and edited numeric parameters. Assert the fake Worker receives:

```typescript
{
  type: "rebuild-keywords",
  keywordsText: "A B :1.50 #0.35 @alpha\n",
}
```

- [ ] **Step 6: Run controller tests and verify GREEN**

Run: `npm --prefix web test -- src/app/KwsSessionController.test.ts`

Expected: all controller integration tests pass.

- [ ] **Step 7: Commit controller changes**

```bash
git add web/src/app/KwsSessionController.ts web/src/app/KwsSessionController.test.ts
git commit -m "feat: load keyword settings from model packages"
```

### Task 4: Settings drawer copy and full regression

**Files:**
- Modify: `web/src/components/SettingsDrawer.tsx`

- [ ] **Step 1: Update the UI copy without adding editing controls**

Change the keyword section heading from `预置唤醒词` to `模型唤醒词`, and change the description to `关键词来自当前模型包。可启用需要检测的词，并调整阈值和路径增强。`. Keep the existing checkbox and sliders as the only per-keyword controls.

- [ ] **Step 2: Run focused frontend tests**

Run: `npm --prefix web test -- src/app/keywords.test.ts src/app/settings.test.ts src/app/KwsSessionController.test.ts`

Expected: all targeted tests pass.

- [ ] **Step 3: Run full verification**

Run each command independently:

```bash
npm test
npm --prefix web run lint
npm run build
git diff --check
```

Expected: every command exits with code 0; all tests pass; lint reports no errors; TypeScript/Vite production build succeeds; diff check produces no output.

- [ ] **Step 4: Review the implementation against the approved spec**

Confirm all requirements are represented: strict line-numbered parsing, defaults, alias handling, stable duplicate IDs, all enabled, no UI add/delete/edit, original asset still sent to Worker, invalid files block Worker creation, canonical enabled-only rebuild text, and no WASM changes.

- [ ] **Step 5: Commit UI and final integration**

```bash
git add web/src/components/SettingsDrawer.tsx
git commit -m "ui: describe model-provided keywords"
```

- [ ] **Step 6: Push the feature branch**

```bash
git push origin feature/browser-kws-ui
```
