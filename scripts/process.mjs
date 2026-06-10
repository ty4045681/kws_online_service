import { spawn } from "node:child_process";

export function executable(name) {
  return process.platform === "win32" && !name.endsWith(".exe")
    ? `${name}.exe`
    : name;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}\n${stderr}`));
    });
  });
}

export function runWindowsBatch(file, args, options = {}) {
  if (process.platform !== "win32") return run(file, args, options);
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const commandLine = ["call", quote(file), ...args.map(quote)].join(" ");
  return run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], options);
}
