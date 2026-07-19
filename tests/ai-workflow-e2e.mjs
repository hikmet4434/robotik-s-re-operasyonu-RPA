import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const apiBase = process.env.OTOFLOW_TEST_API || "http://localhost:4100";
const suffix = Date.now().toString(36);
const testDir = path.resolve("data", `ai-e2e-${suffix}`);
const reportPath = path.join(testDir, "raporlar", "haftalik-rapor.md");

async function request(route, init = {}) {
  const response = await fetch(`${apiBase}${route}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route}: ${typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error || response.status)}`);
  return payload;
}

async function waitFor(check, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("AI workflow beklenen duruma zamanında ulaşmadı.");
}

await fs.mkdir(path.join(testDir, "projeler"), { recursive: true });
await fs.writeFile(path.join(testDir, "toplanti-notlari.md"), "# Pazartesi\nYeni ERP entegrasyonu planlandı. Salı günü ödeme raporu kontrol edilecek.\n", "utf8");
await fs.writeFile(path.join(testDir, "projeler", "durum.csv"), "is,olcum,durum\nFatura otomasyonu,42,tamamlandi\nRaporlama,18,devam ediyor\n", "utf8");

await request("/api/ai/settings", {
  method: "PUT",
  body: JSON.stringify({ provider: "template", model: "yerel-guvenli-planlayici", baseUrl: "" })
});

const plan = await request("/api/ai/automation-plan", {
  method: "POST",
  body: JSON.stringify({
    prompt: "Her pazartesi son bir haftadaki yeni ve değişen dosyaları incele, özetle ve haftalık çalışma raporu hazırla.",
    directoryPath: testDir,
    reportPath,
    cron: "0 9 * * 1",
    timezone: "Europe/Istanbul",
    scheduleLabel: "Her pazartesi 09:00",
    approvalAtEnd: true
  })
});
assert.equal(plan.steps.length, 5);
assert.equal(plan.steps.at(-1).requiresApproval, true);

const workflow = await request("/api/ai/workflows", { method: "POST", body: JSON.stringify(plan) });
assert.equal(workflow.status, "published");
assert.equal(workflow.schedule.enabled, true);
assert.ok(workflow.schedule.nextRunAt);

const exportedResponse = await fetch(`${apiBase}/api/workflows/${workflow.id}/export`);
assert.equal(exportedResponse.ok, true);
const exportedText = await exportedResponse.text();
const exported = JSON.parse(exportedText);
assert.equal(exported.metadata.schedule.cron, "0 9 * * 1");
assert.equal(exportedText.includes("encryptedApiKey"), false);
assert.equal(exportedText.includes("apiKey"), false);

const job = await request(`/api/workflows/${workflow.id}/run`, { method: "POST", body: JSON.stringify({ payloadSummary: "AI haftalık rapor E2E" }) });
await waitFor(async () => {
  const current = await request(`/api/jobs/${job.id}`);
  if (current.status === "failed") throw new Error(current.lastError || "Dosya workflow adımı başarısız oldu.");
  return current.status === "waiting_approval" && current.currentStepIndex === 4 ? current : null;
});

await assert.rejects(fs.access(reportPath));
const approval = await waitFor(async () => {
  const approvals = await request("/api/approvals");
  return approvals.find((item) => item.jobId === job.id && item.stepIndex === 4 && item.status === "pending");
});
await request(`/api/approvals/${approval.id}/approve`, { method: "POST", body: "{}" });

const completed = await waitFor(async () => {
  const current = await request(`/api/jobs/${job.id}`);
  if (current.status === "failed") throw new Error(current.lastError || "Onay sonrası rapor kaydedilemedi.");
  return current.status === "succeeded" ? current : null;
});
const report = await fs.readFile(reportPath, "utf8");
assert.match(report, /Haftalık Dosya ve Çalışma Özeti/);
assert.match(report, /toplanti-notlari\.md/);
assert.match(report, /durum\.csv/);
assert.equal(completed.outputs.savedReport.reportPath, reportPath);

if (apiBase.includes("localhost") && process.env.OTOFLOW_TEST_KEEP_DATA !== "true") {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database("data/otoflow-saas.sqlite");
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get("saas");
  const state = JSON.parse(row.value);
  state.workflows = state.workflows.filter((item) => item.id !== workflow.id);
  state.workflowVersions = state.workflowVersions.filter((item) => item.workflowId !== workflow.id);
  state.jobs = state.jobs.filter((item) => item.id !== job.id);
  state.jobLogs = state.jobLogs.filter((item) => item.jobId !== job.id);
  state.queueItems = state.queueItems.filter((item) => item.id !== job.queueItemId);
  state.approvals = state.approvals.filter((item) => item.jobId !== job.id);
  state.audit = state.audit.filter((item) => ![workflow.id, job.id].includes(item.entityId));
  db.prepare("UPDATE app_state SET value = ?, updated_at = ? WHERE key = ?").run(JSON.stringify(state), new Date().toISOString(), "saas");
  db.close();
  await fs.rm(testDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, steps: completed.totalSteps, approvalStep: approval.stepIndex, schedule: workflow.schedule.label }));
