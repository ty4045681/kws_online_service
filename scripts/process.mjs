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
      stdio: [
        options.input === undefined ? (options.capture ? "ignore" : "inherit") : "pipe",
        options.capture ? "pipe" : "inherit",
        options.capture ? "pipe" : "inherit",
      ],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    if (options.input !== undefined) child.stdin.end(options.input);
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
    args: ["/d", "/q"],
    input: `${commandLine}\r\nexit /b %errorlevel%\r\n`,
  };
}

export function runWindowsBatch(file, args, options = {}) {
  if (process.platform !== "win32") return run(file, args, options);
  const invocation = windowsBatchInvocation(file, args);
  return run(invocation.command, invocation.args, {
    ...options,
    input: invocation.input,
  });
}
