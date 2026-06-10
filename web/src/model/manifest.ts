export const modelAssetNames = [
  "encoder",
  "decoder",
  "joiner",
  "tokens",
  "keywords",
] as const;

export type ModelAssetName = (typeof modelAssetNames)[number];

export interface ModelAsset {
  url: string;
  size: number;
  sha256: string;
}

export interface ModelManifest {
  schemaVersion: 1;
  modelId: string;
  version: string;
  sampleRate: number;
  featureDim: number;
  files: Record<ModelAssetName, ModelAsset>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`Invalid ${field}`);
  }
  return Number(value);
}

function isValidModelAssetUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/models/kws/") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    /%(?:2e|2f|5c)/i.test(value)
  ) {
    return false;
  }

  const parsed = new URL(value, "https://model-assets.invalid");
  const segments = value.slice(1).split("/");
  return (
    parsed.origin === "https://model-assets.invalid" &&
    parsed.pathname === value &&
    parsed.search === "" &&
    parsed.hash === "" &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

export function parseModelManifest(input: unknown): ModelManifest {
  if (!isRecord(input)) {
    throw new Error("Invalid manifest");
  }
  if (input.schemaVersion !== 1) {
    throw new Error("Invalid schemaVersion");
  }
  if (typeof input.modelId !== "string" || input.modelId.trim().length === 0) {
    throw new Error("Invalid modelId");
  }
  if (typeof input.version !== "string" || input.version.trim().length === 0) {
    throw new Error("Invalid version");
  }
  if (!isRecord(input.files)) {
    throw new Error("Invalid files");
  }
  const fileNames = Object.keys(input.files);
  if (
    fileNames.length !== modelAssetNames.length ||
    !modelAssetNames.every((name) => fileNames.includes(name))
  ) {
    throw new Error("Invalid files: expected exactly five model assets");
  }

  const files = {} as Record<ModelAssetName, ModelAsset>;
  for (const name of modelAssetNames) {
    const file = input.files[name];
    if (!isRecord(file)) {
      throw new Error(`Invalid ${name} file`);
    }
    if (!isValidModelAssetUrl(file.url)) {
      throw new Error(`Invalid ${name} url`);
    }
    if (!Number.isInteger(file.size) || Number(file.size) <= 0) {
      throw new Error(`Invalid ${name} size`);
    }
    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error(`Invalid ${name} sha256`);
    }

    files[name] = {
      url: file.url,
      size: Number(file.size),
      sha256: file.sha256,
    };
  }

  return {
    schemaVersion: 1,
    modelId: input.modelId,
    version: input.version,
    sampleRate: parsePositiveInteger(input.sampleRate, "sampleRate"),
    featureDim: parsePositiveInteger(input.featureDim, "featureDim"),
    files,
  };
}
