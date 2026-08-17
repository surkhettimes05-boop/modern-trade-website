import { cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const standalone = resolve(root, ".next", "standalone");

await cp(resolve(root, "public"), resolve(standalone, "public"), { recursive: true, force: true });
await cp(resolve(root, ".next", "static"), resolve(standalone, ".next", "static"), { recursive: true, force: true });

const child = spawn(process.execPath, [resolve(standalone, "server.js")], {
  cwd: standalone,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
