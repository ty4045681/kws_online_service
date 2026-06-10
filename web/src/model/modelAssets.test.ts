import { describe, expect, test } from "vitest";

import {
  modelAssetNames,
  parseModelManifest,
  type ModelAssetName,
  type ModelManifest,
} from "./manifest";
import { ModelAssetManager, type ModelCache } from "./modelAssetManager";

const encoder = new TextEncoder();

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function fixture(version = "v1"): Promise<{
  manifest: ModelManifest;
  bytes: Record<ModelAssetName, ArrayBuffer>;
}> {
  const bytes = Object.fromEntries(
    modelAssetNames.map((name) => [name, encoder.encode(`${version}-${name}`).buffer]),
  ) as Record<ModelAssetName, ArrayBuffer>;
  const files = Object.fromEntries(
    await Promise.all(
      modelAssetNames.map(async (name) => [
        name,
        {
          url: `/models/kws/eva/${version}/${name}.${
            name === "tokens" || name === "keywords" ? "txt" : "onnx"
          }`,
          size: bytes[name].byteLength,
          sha256: await sha256(bytes[name]),
        },
      ]),
    ),
  ) as ModelManifest["files"];

  return {
    manifest: {
      schemaVersion: 1,
      modelId: "eva",
      version,
      sampleRate: 16000,
      featureDim: 80,
      files,
    },
    bytes,
  };
}

class MemoryCache implements ModelCache {
  active?: string;
  values = new Map<string, ArrayBuffer>();

  async read(key: string): Promise<ArrayBuffer | undefined> {
    return this.values.get(key)?.slice(0);
  }

  async write(key: string, value: ArrayBuffer): Promise<void> {
    this.values.set(key, value.slice(0));
  }

  async activate(version: string): Promise<void> {
    this.active = version;
  }

  async activeVersion(): Promise<string | undefined> {
    return this.active;
  }

  async removeVersionsExcept(): Promise<void> {}
}

describe("model assets", () => {
  test("parse rejects invalid files, URLs, and SHA256 values", async () => {
    const { manifest } = await fixture();

    const withUnexpectedFile = structuredClone(manifest) as ModelManifest & {
      files: ModelManifest["files"] & { unexpected: ModelManifest["files"]["encoder"] };
    };
    withUnexpectedFile.files.unexpected = structuredClone(
      withUnexpectedFile.files.encoder,
    );
    expect(() => parseModelManifest(withUnexpectedFile)).toThrow(/files/i);

    const withTraversalUrl = structuredClone(manifest);
    withTraversalUrl.files.encoder.url = "/models/kws/../admin.json";
    expect(() => parseModelManifest(withTraversalUrl)).toThrow(/url/i);

    for (const invalidHash of ["bad", "A".repeat(64), "g".repeat(64)]) {
      const invalid = structuredClone(manifest);
      invalid.files.encoder.sha256 = invalidHash;
      expect(() => parseModelManifest(invalid)).toThrow(/sha256/i);
    }
  });

  test("first load downloads all 5, second same active version uses cache", async () => {
    const { manifest, bytes } = await fixture();
    const cache = new MemoryCache();
    const assetReads: ModelAssetName[] = [];
    const manager = new ModelAssetManager({
      loadManifest: async () => manifest,
      loadAsset: async (name) => {
        assetReads.push(name);
        return bytes[name].slice(0);
      },
      cache,
      digest: sha256,
    });

    const first = await manager.load();
    const second = await manager.load();

    expect(first.source).toBe("network");
    expect(second.source).toBe("cache");
    expect(assetReads).toHaveLength(5);
    expect(new Set(assetReads)).toEqual(new Set(modelAssetNames));
    expect(await cache.activeVersion()).toBe("v1");
  });

  test("v2 hash mismatch rejects and retains prior active version", async () => {
    const v1 = await fixture("v1");
    const v2 = await fixture("v2");
    const cache = new MemoryCache();
    let currentBytes = v1.bytes;
    const manager = new ModelAssetManager({
      loadManifest: async () => v1.manifest,
      loadAsset: async (name) => currentBytes[name].slice(0),
      cache,
      digest: sha256,
    });

    await manager.load();
    currentBytes = {
      ...v2.bytes,
      encoder: encoder.encode("x2-encoder").buffer,
    };
    manager.setManifestLoader(async () => v2.manifest);

    await expect(manager.load()).rejects.toMatchObject({
      code: "ASSET_HASH_MISMATCH",
    });
    expect(await cache.activeVersion()).toBe("v1");
  });
});
