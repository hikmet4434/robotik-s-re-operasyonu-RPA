import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const port = 4138;
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "otoflow-capabilities-test-"));
const server = spawn("npm", ["start"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    SAAS_DATABASE_PATH: path.join(tempDir, "saas.sqlite"),
    DATABASE_PATH: path.join(tempDir, "legacy.sqlite"),
    CREDENTIAL_VAULT_KEY: "capabilities-test-key"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

async function request(route, init = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route}: ${payload.error || response.status}`);
  return payload;
}

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
  throw new Error("Yetenek testi sunucusu zamanında başlamadı.");
}

try {
  await waitForServer();
  const dashboard = await request("/api/dashboard");
  assert.ok(Array.isArray(dashboard.queues));
  assert.ok(Array.isArray(dashboard.queueItems));
  assert.ok(Array.isArray(dashboard.jobLogs));

  const opportunity = await request("/api/opportunities", {
    method: "POST",
    body: JSON.stringify({ title: "Haftalık dosya raporu", department: "Operasyon", monthlyVolume: 240, minutesPerTask: 8, errorRisk: 3, feasibility: 85 })
  });
  assert.ok(opportunity.roiScore > 0);
  const analyzed = await request(`/api/opportunities/${opportunity.id}`, { method: "PATCH", body: JSON.stringify({ status: "analiz" }) });
  assert.equal(analyzed.status, "analiz");

  const document = await request("/api/documents/extract", { method: "POST", body: JSON.stringify({ name: "Test faturası", type: "invoice" }) });
  const lowConfidenceField = document.fields.find((field) => field.confidence < 80);
  assert.ok(lowConfidenceField);
  const verifiedDocument = await request(`/api/documents/${document.id}/fields`, {
    method: "PATCH",
    body: JSON.stringify({ fieldId: lowConfidenceField.id, value: "48.320 TL doğrulandı" })
  });
  assert.equal(verifiedDocument.fields.find((field) => field.id === lowConfidenceField.id)?.verified, true);

  const workflow = dashboard.workflows.find((item) => item.status === "published");
  assert.ok(workflow);
  const job = await request(`/api/workflows/${workflow.id}/run`, { method: "POST", body: JSON.stringify({ payloadSummary: "Orchestrator retry testi" }) });
  const cancelled = await request(`/api/jobs/${job.id}/cancel`, { method: "POST", body: "{}" });
  assert.equal(cancelled.status, "cancelled");
  const retried = await request(`/api/jobs/${job.id}/retry`, { method: "POST", body: "{}" });
  assert.notEqual(retried.id, job.id);
  assert.ok(["queued", "waiting_approval"].includes(retried.status));

  console.log(JSON.stringify({ ok: true, opportunityStatus: analyzed.status, fieldVerified: true, retryJobId: retried.id }));
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await fs.rm(tempDir, { recursive: true, force: true });
}
