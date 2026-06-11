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
      windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
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

export function windowsBatchInvocation(
  file,
  args,
  comspec = process.env.ComSpec ?? "cmd.exe",
) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const commandLine = ["call", quote(file), ...args.map(quote)].join(" ");
  return {
    command: comspec,
    args: ["/d", "/s", "/c", commandLine],
    windowsVerbatimArguments: true,
  };
}

export function runWindowsBatch(file, args, options = {}) {
  if (process.platform !== "win32") return run(file, args, options);
  const invocation = windowsBatchInvocation(file, args);
  return run(invocation.command, invocation.args, {
    ...options,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}
