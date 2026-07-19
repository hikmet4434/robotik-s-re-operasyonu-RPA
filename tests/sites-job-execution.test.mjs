import assert from "node:assert/strict";

const worker = (await import(`../dist/server/index.js?sites-job-test=${Date.now()}`)).default;

async function request(path, init = {}) {
  const response = await worker.fetch(new Request(`https://otoflow.test${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers }
  }));
  const payload = await response.json().catch(() => null);
  assert.equal(response.ok, true, `${path}: ${JSON.stringify(payload)}`);
  return payload;
}

async function pollJob(jobId, expectedStatuses, limit = 16) {
  for (let index = 0; index < limit; index += 1) {
    const jobs = await request("/api/jobs");
    const job = jobs.find((item) => item.id === jobId);
    assert.ok(job, `Job bulunamadı: ${jobId}`);
    if (expectedStatuses.includes(job.status)) return job;
  }
  throw new Error(`${jobId} beklenen duruma ulaşmadı: ${expectedStatuses.join(", ")}`);
}

const workflows = await request("/api/workflows");
const portal = workflows.find((workflow) => workflow.id === "wf_portal");
assert.ok(portal);
assert.equal(portal.version.steps.length, 3);

const portalJob = await request(`/api/workflows/${portal.id}/run`, {
  method: "POST",
  body: JSON.stringify({ payloadSummary: "Portal sonucu testi" })
});
assert.equal(portalJob.status, "queued");
assert.equal(portalJob.currentStepIndex, 0);
assert.deepEqual(portalJob.outputs, {});
assert.equal(portalJob.completedAt, undefined);

const portalCompleted = await pollJob(portalJob.id, ["succeeded"]);
assert.equal(portalCompleted.currentStepIndex, 3);
assert.equal(portalCompleted.outputs.portalOrders.orderCount, 3);
assert.equal(portalCompleted.outputs.reportRows.rowsWritten, 3);
assert.equal(portalCompleted.outputs._result.status, "succeeded");
assert.match(portalCompleted.outputs._result.summary, /3 siparis/);
assert.equal(portalCompleted.outputs._result.details.length, 3);

const invoice = workflows.find((workflow) => workflow.id === "wf_invoice");
const invoiceJob = await request(`/api/workflows/${invoice.id}/run`, { method: "POST", body: "{}" });
const waitingInvoice = await pollJob(invoiceJob.id, ["waiting_approval"]);
assert.equal(waitingInvoice.currentStepIndex, 1);
const approvals = await request("/api/approvals");
const approval = approvals.find((item) => item.jobId === invoiceJob.id && item.status === "pending");
assert.ok(approval);
await request(`/api/approvals/${approval.id}/approve`, { method: "POST", body: "{}" });
const invoiceCompleted = await pollJob(invoiceJob.id, ["succeeded"]);
assert.equal(invoiceCompleted.outputs.tableResult.rowsWritten, 1);
assert.equal(invoiceCompleted.outputs._result.status, "succeeded");

const plan = await request("/api/ai/automation-plan", {
  method: "POST",
  body: JSON.stringify({ prompt: "Belgeler klasörünü tara ve haftalık rapor hazırla", directoryPath: "/Users/test/Documents" })
});
const fileWorkflow = await request("/api/ai/workflows", { method: "POST", body: JSON.stringify(plan) });
const fileJob = await request(`/api/workflows/${fileWorkflow.id}/run`, { method: "POST", body: "{}" });
const agentRequired = await pollJob(fileJob.id, ["failed"]);
assert.match(agentRequired.lastError, /Yerel Ajan/);
assert.equal(agentRequired.outputs._result.status, "agent_required");

const workerSource = await (await import("node:fs/promises")).readFile(new URL("../src/client/pages/DashboardPage.tsx", import.meta.url), "utf8");
assert.match(workerSource, /Çalışma Sonucu/);
assert.match(workerSource, /Sonucu İndir/);

console.log(JSON.stringify({ ok: true, portalSteps: portalCompleted.totalSteps, invoiceApproval: approval.id, localAgentGuard: agentRequired.status }));
