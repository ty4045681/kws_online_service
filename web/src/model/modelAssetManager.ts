import {
  modelAssetNames,
  parseModelManifest,
  type ModelAsset,
  type ModelAssetName,
  type ModelManifest,
} from "./manifest";

const browserCacheName = "kws-model-assets-v1";
const browserCachePrefix = "/__kws-model-cache__/assets/";
const browserActiveKey = "/__kws-model-cache__/active-version";

export interface ModelCache {
  read(key: string): Promise<ArrayBuffer | undefined>;
  write(key: string, value: ArrayBuffer): Promise<void>;
  activate(version: string): Promise<void>;
  activeVersion(): Promise<string | undefined>;
  removeVersionsExcept(version: string, modelId?: string): Promise<void>;
}

export interface ModelAssetManagerDependencies {
  loadManifest: () => Promise<unknown>;
  loadAsset: (name: ModelAssetName, asset: ModelAsset) => Promise<ArrayBuffer>;
  cache: ModelCache;
  digest: (bytes: ArrayBuffer) => Promise<string>;
}

export interface ModelLoadProgress {
  asset: ModelAssetName;
  phase: "download" | "verify";
  loaded: number;
  total: number;
}

export interface LoadedModelPackage {
  manifest: ModelManifest;
  assets: Record<ModelAssetName, ArrayBuffer>;
  source: "network" | "cache" | "mixed";
}

export interface ModelAssetManagerApi {
  setManifestLoader(loader: () => Promise<unknown>): void;
  load(onProgress?: (event: ModelLoadProgress) => void): Promise<LoadedModelPackage>;
}

export type ModelAssetErrorCode =
  | "ASSET_SIZE_MISMATCH"
  | "ASSET_HASH_MISMATCH";

export class ModelAssetError extends Error {
  readonly code: ModelAssetErrorCode;
  readonly asset: ModelAssetName;
  readonly expected: number | string;
  readonly actual: number | string;

  constructor(
    code: ModelAssetErrorCode,
    asset: ModelAssetName,
    expected: number | string,
    actual: number | string,
  ) {
    super(
      `${asset} ${code === "ASSET_SIZE_MISMATCH" ? "size" : "sha256"} mismatch: expected ${expected}, received ${actual}`,
    );
    this.name = "ModelAssetError";
    this.code = code;
    this.asset = asset;
    this.expected = expected;
    this.actual = actual;
  }
}

function browserUrl(pathname: string): string {
  const origin =
    typeof location !== "undefined" && location.origin !== "null"
      ? location.origin
      : "http://localhost";
  return new URL(pathname, origin).href;
}

export class CacheStorageModelCache implements ModelCache {
  private async open(): Promise<Cache> {
    return caches.open(browserCacheName);
  }

  async read(key: string): Promise<ArrayBuffer | undefined> {
    const response = await (await this.open()).match(
      browserUrl(`${browserCachePrefix}${key}`),
    );
    return response ? response.arrayBuffer() : undefined;
  }

  async write(key: string, value: ArrayBuffer): Promise<void> {
    await (await this.open()).put(
      browserUrl(`${browserCachePrefix}${key}`),
      new Response(value),
    );
  }

  async activate(version: string): Promise<void> {
    await (await this.open()).put(
      browserUrl(browserActiveKey),
      new Response(version),
    );
  }

  async activeVersion(): Promise<string | undefined> {
    const response = await (await this.open()).match(browserUrl(browserActiveKey));
    return response ? response.text() : undefined;
  }

  async removeVersionsExcept(version: string, modelId?: string): Promise<void> {
    const cache = await this.open();
    const keepPath = modelId
      ? `${browserCachePrefix}${encodeURIComponent(modelId)}/${encodeURIComponent(version)}/`
      : undefined;

    await Promise.all(
      (await cache.keys()).map(async (request) => {
        const pathname = new URL(request.url).pathname;
        if (
          pathname.startsWith(browserCachePrefix) &&
          (!keepPath || !pathname.startsWith(keepPath))
        ) {
          await cache.delete(request);
        }
      }),
    );
  }
}

async function loadBrowserManifest(): Promise<unknown> {
  const response = await fetch("/models/kws/model-manifest.json", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load model manifest: HTTP ${response.status}`);
  }
  return response.json();
}

async function loadBrowserAsset(
  _name: ModelAssetName,
  asset: ModelAsset,
): Promise<ArrayBuffer> {
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Failed to load model asset ${asset.url}: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

async function browserDigest(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createBrowserModelAssetDependencies(): ModelAssetManagerDependencies {
  return {
    loadManifest: loadBrowserManifest,
    loadAsset: loadBrowserAsset,
    cache: new CacheStorageModelCache(),
    digest: browserDigest,
  };
}

function assetCacheKey(
  manifest: ModelManifest,
  asset: ModelAssetName,
): string {
  return `${encodeURIComponent(manifest.modelId)}/${encodeURIComponent(manifest.version)}/${asset}`;
}

export class ModelAssetManager implements ModelAssetManagerApi {
  private readonly dependencies: ModelAssetManagerDependencies;
  private manifestLoader: () => Promise<unknown>;

  constructor(dependencies: Partial<ModelAssetManagerDependencies> = {}) {
    this.dependencies = {
      ...createBrowserModelAssetDependencies(),
      ...dependencies,
    };
    this.manifestLoader = this.dependencies.loadManifest;
  }

  setManifestLoader(loader: () => Promise<unknown>): void {
    this.manifestLoader = loader;
  }

  async load(
    onProgress?: (event: ModelLoadProgress) => void,
  ): Promise<LoadedModelPackage> {
    const manifest = parseModelManifest(await this.manifestLoader());
    const assets = {} as Record<ModelAssetName, ArrayBuffer>;
    const activeVersion = await this.dependencies.cache.activeVersion();
    let cacheCount = 0;
    let networkCount = 0;

    const missing: ModelAssetName[] = [];
    for (const name of modelAssetNames) {
      const expected = manifest.files[name];
      const cached =
        activeVersion === manifest.version
          ? await this.dependencies.cache.read(assetCacheKey(manifest, name))
          : undefined;

      if (cached && (await this.isValidCachedAsset(name, expected, cached, onProgress))) {
        assets[name] = cached;
        cacheCount += 1;
      } else {
        missing.push(name);
      }
    }

    await this.downloadMissing(manifest, missing, assets, onProgress);
    networkCount = missing.length;

    await this.dependencies.cache.activate(manifest.version);
    await this.dependencies.cache.removeVersionsExcept(
      manifest.version,
      manifest.modelId,
    );

    return {
      manifest,
      assets,
      source:
        cacheCount === modelAssetNames.length
          ? "cache"
          : networkCount === modelAssetNames.length
            ? "network"
            : "mixed",
    };
  }

  private async isValidCachedAsset(
    name: ModelAssetName,
    expected: ModelAsset,
    bytes: ArrayBuffer,
    onProgress?: (event: ModelLoadProgress) => void,
  ): Promise<boolean> {
    try {
      await this.verify(name, expected, bytes, onProgress);
      return true;
    } catch (error) {
      if (error instanceof ModelAssetError) {
        return false;
      }
      throw error;
    }
  }

  private async downloadMissing(
    manifest: ModelManifest,
    missing: ModelAssetName[],
    assets: Record<ModelAssetName, ArrayBuffer>,
    onProgress?: (event: ModelLoadProgress) => void,
  ): Promise<void> {
    let nextIndex = 0;
    let failure: unknown;

    const worker = async (): Promise<void> => {
      while (failure === undefined) {
        const name = missing[nextIndex];
        nextIndex += 1;
        if (name === undefined) {
          return;
        }

        const expected = manifest.files[name];
        try {
          onProgress?.({
            asset: name,
            phase: "download",
            loaded: 0,
            total: expected.size,
          });
          const bytes = await this.dependencies.loadAsset(name, expected);
          onProgress?.({
            asset: name,
            phase: "download",
            loaded: bytes.byteLength,
            total: expected.size,
          });
          await this.verify(name, expected, bytes, onProgress);
          if (failure !== undefined) {
            return;
          }
          await this.dependencies.cache.write(
            assetCacheKey(manifest, name),
            bytes,
          );
          assets[name] = bytes;
        } catch (error) {
          failure = error;
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(2, missing.length) },
        async () => worker(),
      ),
    );

    if (failure !== undefined) {
      throw failure;
    }
  }

  private async verify(
    name: ModelAssetName,
    expected: ModelAsset,
    bytes: ArrayBuffer,
    onProgress?: (event: ModelLoadProgress) => void,
  ): Promise<void> {
    if (bytes.byteLength !== expected.size) {
      onProgress?.({
        asset: name,
        phase: "verify",
        loaded: bytes.byteLength,
        total: expected.size,
      });
      throw new ModelAssetError(
        "ASSET_SIZE_MISMATCH",
        name,
        expected.size,
        bytes.byteLength,
      );
    }

    const actualHash = await this.dependencies.digest(bytes);
    onProgress?.({
      asset: name,
      phase: "verify",
      loaded: bytes.byteLength,
      total: expected.size,
    });
    if (actualHash !== expected.sha256) {
      throw new ModelAssetError(
        "ASSET_HASH_MISMATCH",
        name,
        expected.sha256,
        actualHash,
      );
    }
  }
}
