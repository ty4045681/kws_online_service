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

function parseNumber(
  field: string,
  lineNumber: number,
  name: "boost" | "threshold",
  maximum: number,
): number {
  const rawValue = field.slice(1);
  const value = Number(rawValue);
  if (!rawValue || !Number.isFinite(value)) {
    throw keywordError(lineNumber, `${name} must be a finite number`);
  }
  if (value < 0 || value > maximum) {
    throw keywordError(lineNumber, `${name} must be between 0 and ${maximum}`);
  }
  return value;
}

export function parseKeywordsText(text: string): KeywordPreset[] {
  const keywords: KeywordPreset[] = [];

  for (const [index, rawLine] of text.split(/\r\n?|\n/).entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const tokens: string[] = [];
    let boost: number | undefined;
    let threshold: number | undefined;
    let alias: string | undefined;

    for (const field of line.split(/\s+/)) {
      const marker = field[0];
      if (marker === ":") {
        if (boost !== undefined) {
          throw keywordError(lineNumber, "duplicate boost");
        }
        boost = parseNumber(field, lineNumber, "boost", 10);
      } else if (marker === "#") {
        if (threshold !== undefined) {
          throw keywordError(lineNumber, "duplicate threshold");
        }
        threshold = parseNumber(field, lineNumber, "threshold", 1);
      } else if (marker === "@") {
        if (alias !== undefined) {
          throw keywordError(lineNumber, "duplicate alias");
        }
        alias = field.slice(1);
        if (!alias) {
          throw keywordError(lineNumber, "alias must not be empty");
        }
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

export function serializeEnabledKeywords(
  keywords: readonly KeywordPreset[],
): string {
  const lines = keywords
    .filter((keyword) => keyword.enabled)
    .map((keyword) =>
      [
        keyword.phrase,
        `:${keyword.boost.toFixed(2)}`,
        `#${keyword.threshold.toFixed(2)}`,
        keyword.alias === undefined ? "" : `@${keyword.alias}`,
      ]
        .filter(Boolean)
        .join(" "),
    );

  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
