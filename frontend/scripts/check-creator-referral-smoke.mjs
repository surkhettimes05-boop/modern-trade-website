// Exercise the production Next.js referral route through real HTTP while
// replacing only the external commerce backend with a controlled test server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

const webPort = 31479;
const publicOrigin = `http://127.0.0.1:${webPort}`;
const cookieValue = "a".repeat(64);

const backend = createServer((req, res) => {
  if (req.url === "/api/public/creators/qa-creator/visit") {
    res.writeHead(302, {
      location: `${publicOrigin}/shop?source=creator`,
      "set-cookie": `pasalho_creator_referral=${cookieValue}; Path=/; HttpOnly; SameSite=Lax`,
    });
  } else if (req.url === "/api/public/creators/hostile/visit") {
    res.writeHead(302, { location: "https://invalid.example/steal" });
  } else {
    res.writeHead(404);
  }
  res.end();
});

let child;
try {
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const apiPort = backend.address().port;
  child = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NEXT_LOCAL_QA: "1",
      API_URL: `http://127.0.0.1:${apiPort}`,
      NEXT_PUBLIC_SITE_URL: publicOrigin,
      PORT: String(webPort),
    },
    stdio: "inherit",
  });

  let live = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error("Next.js server exited before smoke test");
    try {
      const probe = await fetch(`${publicOrigin}/r/bad%20slug`, { signal: AbortSignal.timeout(1000) });
      if (probe.status === 400) { live = true; break; }
    } catch { /* Wait for server boot. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(live, "Next.js did not start before smoke timeout");

  const good = await fetch(`${publicOrigin}/r/qa-creator`, { redirect: "manual" });
  assert.equal(good.status, 302);
  assert.equal(good.headers.get("location"), "/shop?source=creator");
  assert.match(good.headers.get("set-cookie") ?? "", new RegExp(`pasalho_creator_referral=${cookieValue}`));
  assert.match(good.headers.get("set-cookie") ?? "", /HttpOnly/i);

  const hostile = await fetch(`${publicOrigin}/r/hostile`, { redirect: "manual" });
  assert.equal(hostile.status, 502);
  assert.equal(hostile.headers.get("location"), null);
  assert.equal(hostile.headers.get("set-cookie"), null);

  console.log("Creator referral HTTP smoke passed: cookie, relative redirect, external-origin rejection");
} finally {
  child?.kill("SIGTERM");
  if (backend.listening) await new Promise((resolve) => backend.close(resolve));
}
