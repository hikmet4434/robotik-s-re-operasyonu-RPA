import assert from "node:assert/strict";
import crypto from "node:crypto";

const apiBase = process.env.OTOFLOW_TEST_API || "http://localhost:4100";
const uiBase = process.env.OTOFLOW_TEST_UI || "http://localhost:5173";

async function request(route, init = {}) {
  const response = await fetch(`${apiBase}${route}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route}: ${payload.error || response.status}`);
  return payload;
}

async function waitFor(check, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Beklenen otomasyon durumu zamanında oluşmadı.");
}

const suffix = Date.now().toString(36);
const username = `e2e_${suffix}`;
const password = crypto.randomBytes(18).toString("base64url");
const title = `E2E ERP Giriş ${suffix}`;

const connector = await request("/api/connectors", {
  method: "POST",
  body: JSON.stringify({ type: "portal", name: `${title} hesabı`, username, password, loginUrl: `${uiBase}/recorder` })
});
assert.ok(connector.credentialId);

const session = await request("/api/recordings", {
  method: "POST",
  body: JSON.stringify({ title, goal: "Kasa bilgileriyle yerel ERP giriş formunu doldur ve son adımdan önce teknik kullanıcı onayı bekle.", appName: "OtoFlow Yerel Test ERP" })
});

const events = [
  { type: "navigation", label: "Yerel ERP giriş sayfasını aç", target: `${uiBase}/recorder`, value: `${uiBase}/recorder`, appArea: "Yerel ERP", selectorHint: "browser.url" },
  { type: "input", label: "Kullanıcı adı alanını doldur", target: "username", appArea: "Yerel ERP Giriş", selectorHint: "input[placeholder='Kullanıcı adı']" },
  { type: "input", label: "Şifre alanını doldur", target: "password", value: "MASKED_SECRET", appArea: "Yerel ERP Giriş", selectorHint: "input[placeholder='Şifre/PIN kaydedilmez']" },
  { type: "click", label: "ERP giriş düğmesine bas", target: "login", appArea: "Yerel ERP Giriş", selectorHint: "button:has-text('Giriş Yap')" }
];
for (const event of events) await request(`/api/recordings/${session.id}/events`, { method: "POST", body: JSON.stringify(event) });

let draft = await request(`/api/recordings/${session.id}/analyze`, { method: "POST", body: "{}" });
assert.equal(draft.steps.length, 4);
draft.steps[3] = { ...draft.steps[3], requiresApproval: true, riskLevel: "high", approvalPrompt: "ERP sisteminde oturum açma tıklamasını onaylıyor musunuz?" };
draft = await request(`/api/automation-drafts/${draft.id}`, {
  method: "PATCH",
  body: JSON.stringify({ steps: draft.steps, credentialId: connector.credentialId })
});
const workflow = await request(`/api/automation-drafts/${draft.id}/publish`, { method: "POST", body: "{}" });

const exportedResponse = await fetch(`${apiBase}/api/workflows/${workflow.id}/export`);
assert.equal(exportedResponse.ok, true);
const exported = await exportedResponse.text();
assert.equal(exported.includes(username), false, "Kullanıcı adı .otomasyon dosyasına sızdı.");
assert.equal(exported.includes(password), false, "Şifre .otomasyon dosyasına sızdı.");
const imported = await request("/api/workflows/import", { method: "POST", body: exported });
assert.equal(imported.status, "draft", "Hesap isteyen içe aktarılmış workflow teknik kullanıcı ayarı beklemeli.");

const job = await request(`/api/workflows/${workflow.id}/run`, { method: "POST", body: JSON.stringify({ payloadSummary: "E2E kasa ve onay testi" }) });
const waitingJob = await waitFor(async () => {
  const current = await request(`/api/jobs/${job.id}`);
  if (current.status === "failed") throw new Error(current.lastError || "Yerel ajan adımı başarısız oldu.");
  return current.status === "waiting_approval" && current.currentStepIndex === 3 ? current : null;
});
assert.equal(waitingJob.currentStepIndex, 3);

const approval = await waitFor(async () => {
  const approvals = await request("/api/approvals");
  return approvals.find((item) => item.jobId === job.id && item.stepIndex === 3 && item.status === "pending");
});
await request(`/api/approvals/${approval.id}/approve`, { method: "POST", body: "{}" });

const completed = await waitFor(async () => {
  const current = await request(`/api/jobs/${job.id}`);
  if (current.status === "failed") throw new Error(current.lastError || "Onay sonrası adım başarısız oldu.");
  return current.status === "succeeded" ? current : null;
});
assert.equal(completed.currentStepIndex, completed.totalSteps);

if (apiBase.includes("localhost") && process.env.OTOFLOW_TEST_KEEP_DATA !== "true") {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database("data/otoflow-saas.sqlite");
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get("saas");
  const state = JSON.parse(row.value);
  const workflowIds = new Set([workflow.id, imported.id]);
  const jobIds = new Set([job.id]);
  const queueItemIds = new Set([job.queueItemId]);
  const entityIds = new Set([workflow.id, imported.id, session.id, connector.id, connector.credentialId, job.id]);
  state.workflows = state.workflows.filter((item) => !workflowIds.has(item.id));
  state.workflowVersions = state.workflowVersions.filter((item) => !workflowIds.has(item.workflowId));
  state.recordingSessions = state.recordingSessions.filter((item) => item.id !== session.id);
  state.recorderEvents = state.recorderEvents.filter((item) => !item.target.startsWith(`${session.id}:`));
  state.automationDrafts = state.automationDrafts.filter((item) => item.recordingSessionId !== session.id);
  state.connectors = state.connectors.filter((item) => item.id !== connector.id);
  state.credentials = state.credentials.filter((item) => item.id !== connector.credentialId);
  state.jobs = state.jobs.filter((item) => !jobIds.has(item.id));
  state.jobLogs = state.jobLogs.filter((item) => !jobIds.has(item.jobId));
  state.queueItems = state.queueItems.filter((item) => !queueItemIds.has(item.id));
  state.approvals = state.approvals.filter((item) => !jobIds.has(item.jobId));
  state.audit = state.audit.filter((item) => !entityIds.has(item.entityId));
  db.prepare("UPDATE app_state SET value = ?, updated_at = ? WHERE key = ?").run(JSON.stringify(state), new Date().toISOString(), "saas");
  db.close();
}

console.log(JSON.stringify({ ok: true, workflowId: workflow.id, jobId: job.id, steps: completed.totalSteps, approvalStep: approval.stepIndex }));
