import { spawnSync } from "node:child_process";

const root = process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, cwd, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(npm, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const backend = `${root}/backend`;
const frontend = `${root}/frontend`;

run("Backend Prettier", backend, ["exec", "--", "prettier", "--check", "src/services/paymentService.ts"]);
run("Backend lint", backend, ["run", "lint"]);
run("Backend typecheck", backend, ["run", "type-check"]);
run("Backend Jest", backend, ["run", "test:ci"]);
run("Backend production build", backend, ["run", "build"]);
run("Frontend lint", frontend, ["run", "lint"]);
run("Frontend typecheck", frontend, ["run", "type-check"]);
run("Frontend production build", frontend, ["run", "build"]);

console.log("\nStatic release gates passed. Docker, Redis, production-container, and browser gates require their external runtime prerequisites.");
