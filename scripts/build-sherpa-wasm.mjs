import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

import { executable, run, runWindowsBatch } from "./process.mjs";

const emscriptenVersion = "4.0.23";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "third_party/sherpa-onnx");
const build = resolve(root, "third_party/sherpa-onnx-build/wasm-kws");
const install = resolve(build, "install");
const emsdk = resolve(root, ".toolchains/emsdk");
const emsdkCommand = resolve(emsdk, process.platform === "win32" ? "emsdk.bat" : "emsdk");
const emscripten = resolve(emsdk, "upstream/emscripten");
const publicDirectory = resolve(root, "web/public/wasm/kws");
const patchFile = resolve(
  root,
  "patches/sherpa-onnx/0001-expose-partial-kws-result.patch",
);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

await run(process.execPath, [resolve(root, "scripts/fetch-sherpa-onnx.mjs")], {
  cwd: root,
});

if (!(await exists(resolve(emsdk, ".git")))) {
  await mkdir(dirname(emsdk), { recursive: true });
  await run(executable("git"), [
    "clone",
    "--depth",
    "1",
    "https://github.com/emscripten-core/emsdk.git",
    emsdk,
  ], { cwd: root });
}

await runWindowsBatch(emsdkCommand, ["install", emscriptenVersion], { cwd: emsdk });
const activatedTools = [emscriptenVersion];
if (process.platform === "win32") {
  const ninjaTool = "ninja-git-release-64bit";
  await runWindowsBatch(emsdkCommand, ["install", ninjaTool], { cwd: emsdk });
  activatedTools.push(ninjaTool);
}
await runWindowsBatch(emsdkCommand, ["activate", ...activatedTools], { cwd: emsdk });

const emsdkConfig = await readFile(resolve(emsdk, ".emscripten"), "utf8");
function configuredPath(name) {
  const match = emsdkConfig.match(
    new RegExp(`^${name} = emsdk_path \\+ ['\"]([^'\"]+)['\"]`, "m"),
  );
  if (!match?.[1]) {
    throw new Error(`Unable to find ${name} in ${resolve(emsdk, ".emscripten")}`);
  }
  return resolve(emsdk, `.${match[1]}`);
}

const python = configuredPath("PYTHON");
const node = configuredPath("NODE_JS");
const configuredNinja = process.platform === "win32"
  ? configuredPath("NINJA")
  : null;

const environment = {
  EMSDK: emsdk,
  EMSCRIPTEN: emscripten,
  EM_CONFIG: resolve(emsdk, ".emscripten"),
  SHERPA_ONNX_IS_USING_BUILD_WASM_SH: "ON",
  PATH: [
    dirname(python),
    dirname(node),
    configuredNinja,
    emscripten,
    process.env.PATH ?? "",
  ].filter(Boolean).join(delimiter),
};
const cmakeArguments = [
  "-S", source,
  "-B", build,
  ...(configuredNinja ? ["-G", "Ninja"] : []),
  `-DCMAKE_INSTALL_PREFIX=${install}`,
  "-DCMAKE_BUILD_TYPE=Release",
  `-DCMAKE_TOOLCHAIN_FILE=${resolve(emscripten, "cmake/Modules/Platform/Emscripten.cmake")}`,
  "-DSHERPA_ONNX_ENABLE_PYTHON=OFF",
  "-DSHERPA_ONNX_ENABLE_TESTS=OFF",
  "-DSHERPA_ONNX_ENABLE_CHECK=OFF",
  "-DBUILD_SHARED_LIBS=OFF",
  "-DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF",
  "-DSHERPA_ONNX_ENABLE_JNI=OFF",
  "-DSHERPA_ONNX_ENABLE_C_API=ON",
  "-DSHERPA_ONNX_ENABLE_TTS=OFF",
  "-DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF",
  "-DSHERPA_ONNX_ENABLE_GPU=OFF",
  "-DSHERPA_ONNX_ENABLE_WASM=ON",
  "-DSHERPA_ONNX_ENABLE_WASM_KWS=ON",
  "-DSHERPA_ONNX_ENABLE_BINARY=OFF",
  "-DSHERPA_ONNX_LINK_LIBSTDCPP_STATICALLY=OFF",
];

await run(executable("cmake"), cmakeArguments, { cwd: root, env: environment });
await run(executable("cmake"), [
  "--build", build,
  "--config", "Release",
  "--parallel", String(Math.min(cpus().length, 8)),
], { cwd: root, env: environment });
await run(executable("cmake"), ["--install", build, "--config", "Release"], {
  cwd: root,
  env: environment,
});

const installedDirectory = resolve(install, "bin/wasm");
const files = [
  "sherpa-onnx-kws-module.js",
  "sherpa-onnx-kws-module.wasm",
  "sherpa-onnx-kws.js",
];
await rm(publicDirectory, { recursive: true, force: true });
await mkdir(publicDirectory, { recursive: true });
for (const file of files) {
  await cp(join(installedDirectory, file), join(publicDirectory, file));
}

const sourceSha = (
  await run(executable("git"), ["rev-parse", "HEAD"], {
    cwd: source,
    capture: true,
  })
).stdout.trim();
await writeFile(
  resolve(publicDirectory, "build.json"),
  `${JSON.stringify({
    sourceSha,
    patchSha256: await sha256(patchFile),
    emscriptenVersion,
    platform: process.platform,
    architecture: process.arch,
  }, null, 2)}\n`,
);
console.log(`WASM KWS runtime written to ${publicDirectory}`);
