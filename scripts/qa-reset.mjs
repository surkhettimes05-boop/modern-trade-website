import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync(process.execPath, ["scripts/qa-compose.mjs", ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["down", "--volumes", "--remove-orphans"]);
run(["up", "-d", "--build"]);
