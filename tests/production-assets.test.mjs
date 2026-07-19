import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const port = 4137;
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "otoflow-assets-test-"));
const html = await fs.readFile("dist/index.html", "utf8");
const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
assert.ok(assetPath, "Üretim JavaScript asset yolu bulunamadı.");

const server = spawn("npm", ["start"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    SAAS_DATABASE_PATH: path.join(tempDir, "saas.sqlite"),
    DATABASE_PATH: path.join(tempDir, "legacy.sqlite"),
    CREDENTIAL_VAULT_KEY: "production-assets-test-key"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Üretim sunucusu zamanında başlamadı.");
}

try {
  await waitForServer();
  const sameOriginAsset = await fetch(`${baseUrl}${assetPath}`, {
    headers: { Origin: "https://rpa.example.com", "X-Forwarded-Host": "rpa.example.com" }
  });
  assert.equal(sameOriginAsset.status, 200);
  assert.match(sameOriginAsset.headers.get("content-type") || "", /javascript/);

  const foreignApi = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Origin: "https://foreign.example", "X-Forwarded-Host": "rpa.example.com" }
  });
  assert.equal(foreignApi.status, 400);
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await fs.rm(tempDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, assetPath, sameOriginStatus: 200, foreignOriginStatus: 400 }));
