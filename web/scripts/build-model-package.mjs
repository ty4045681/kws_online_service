import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const requiredFiles = {
  encoder: "encoder.onnx",
  decoder: "decoder.onnx",
  joiner: "joiner.onnx",
  tokens: "tokens.txt",
  keywords: "keywords.txt",
};

const safeSegment = /^[A-Za-z0-9._-]+$/;

function isSafeSegment(value) {
  return safeSegment.test(value) && value !== "." && value !== "..";
}

function parseArguments(argv) {
  const expected = new Set([
    "--source",
    "--model-id",
    "--model-version",
    "--sample-rate",
    "--feature-dim",
  ]);
  const values = new Map();

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!expected.has(flag)) {
      throw new Error(`Unknown argument: ${flag ?? "<missing>"}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (values.has(flag)) {
      throw new Error(`Duplicate argument: ${flag}`);
    }
    values.set(flag, value);
  }

  for (const flag of expected) {
    if (!values.has(flag)) {
      throw new Error(`Missing required argument: ${flag}`);
    }
  }

  const modelId = values.get("--model-id");
  const version = values.get("--model-version");
  if (!isSafeSegment(modelId)) {
    throw new Error("--model-id must match [A-Za-z0-9._-]+");
  }
  if (!isSafeSegment(version)) {
    throw new Error("--model-version must match [A-Za-z0-9._-]+");
  }

  const sampleRate = Number(values.get("--sample-rate"));
  const featureDim = Number(values.get("--feature-dim"));
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error("--sample-rate must be a positive integer");
  }
  if (!Number.isInteger(featureDim) || featureDim <= 0) {
    throw new Error("--feature-dim must be a positive integer");
  }

  const invocationDirectory = process.env.INIT_CWD
    ? resolve(process.env.INIT_CWD)
    : process.cwd();
  return {
    source: resolve(invocationDirectory, values.get("--source")),
    modelId,
    version,
    sampleRate,
    featureDim,
  };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function validateSourceFiles(source) {
  const validated = {};
  for (const [asset, filename] of Object.entries(requiredFiles)) {
    const sourcePath = join(source, filename);
    let sourceStat;
    try {
      sourceStat = await stat(sourcePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Missing required model file: ${sourcePath}`);
      }
      throw error;
    }
    if (!sourceStat.isFile() || sourceStat.size <= 0) {
      throw new Error(`Required model file must be a non-empty file: ${sourcePath}`);
    }
    validated[asset] = { filename, sourcePath };
  }
  return validated;
}

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function copyPackageFiles(sourceFiles, temporaryDirectory, modelId, version) {
  const files = {};
  for (const [asset, { filename, sourcePath }] of Object.entries(sourceFiles)) {
    const destinationPath = join(temporaryDirectory, filename);
    await pipeline(
      createReadStream(sourcePath),
      createWriteStream(destinationPath, { flags: "wx" }),
    );
    const copiedStat = await stat(destinationPath);
    files[asset] = {
      url: `/models/kws/${modelId}/${version}/${filename}`,
      size: copiedStat.size,
      sha256: await sha256(destinationPath),
    };
  }
  return files;
}

function uniqueSibling(parent, name, purpose) {
  return join(
    parent,
    `.${name}.${purpose}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
}

async function publishDirectory(temporaryDirectory, finalDirectory) {
  const parent = dirname(finalDirectory);
  const backupDirectory = uniqueSibling(parent, "model", "backup");
  const hadPrevious = await exists(finalDirectory);

  if (hadPrevious) {
    await rename(finalDirectory, backupDirectory);
  }

  try {
    await rename(temporaryDirectory, finalDirectory);
  } catch (error) {
    if (hadPrevious && !(await exists(finalDirectory))) {
      await rename(backupDirectory, finalDirectory);
    }
    throw error;
  }

  return hadPrevious ? backupDirectory : undefined;
}

async function rollbackDirectory(finalDirectory, backupDirectory) {
  await rm(finalDirectory, { recursive: true, force: true });
  if (backupDirectory) {
    await rename(backupDirectory, finalDirectory);
  }
}

async function publishFile(contents, finalPath) {
  const parent = dirname(finalPath);
  const temporaryPath = uniqueSibling(parent, "manifest", "temporary");
  const backupPath = uniqueSibling(parent, "manifest", "backup");
  const hadPrevious = await exists(finalPath);
  let backupCreated = false;
  let publicationError;

  try {
    await writeFile(temporaryPath, contents, { flag: "wx" });
    if (hadPrevious) {
      await rename(finalPath, backupPath);
      backupCreated = true;
    }
    await rename(temporaryPath, finalPath);
  } catch (error) {
    let reportedError = error;
    if (backupCreated) {
      try {
        if (!(await exists(finalPath))) {
          await rename(backupPath, finalPath);
          backupCreated = false;
        }
      } catch (restoreError) {
        reportedError = new AggregateError(
          [error, restoreError],
          `Manifest publication and restoration failed; manual recovery is possible from ${backupPath}`,
        );
      }
    }
    publicationError = reportedError;
    throw reportedError;
  } finally {
    try {
      await rm(temporaryPath, { force: true });
    } catch (cleanupError) {
      if (publicationError === undefined) {
        throw cleanupError;
      }
    }
  }

  if (backupCreated) {
    await rm(backupPath, { force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceFiles = await validateSourceFiles(options.source);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(scriptDirectory, "../public/models/kws");
  const modelRoot = join(packageRoot, options.modelId);
  const finalDirectory = join(modelRoot, options.version);
  const temporaryDirectory = uniqueSibling(
    modelRoot,
    options.version,
    "temporary",
  );

  await mkdir(modelRoot, { recursive: true });
  await mkdir(temporaryDirectory);

  try {
    const files = await copyPackageFiles(
      sourceFiles,
      temporaryDirectory,
      options.modelId,
      options.version,
    );
    const manifest = {
      schemaVersion: 1,
      modelId: options.modelId,
      version: options.version,
      sampleRate: options.sampleRate,
      featureDim: options.featureDim,
      files,
    };

    const backupDirectory = await publishDirectory(
      temporaryDirectory,
      finalDirectory,
    );
    try {
      await publishFile(
        `${JSON.stringify(manifest, null, 2)}\n`,
        join(packageRoot, "model-manifest.json"),
      );
    } catch (error) {
      await rollbackDirectory(finalDirectory, backupDirectory);
      throw error;
    }
    if (backupDirectory) {
      await rm(backupDirectory, { recursive: true, force: true });
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(
    `Published ${options.modelId}@${options.version} to ${finalDirectory}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
