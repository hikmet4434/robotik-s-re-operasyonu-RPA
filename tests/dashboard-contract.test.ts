import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeSaasDashboard } from "../src/client/api";
import type { SaasDashboard } from "../src/shared/saasTypes";

const normalized = normalizeSaasDashboard({
  approvals: undefined,
  queues: undefined,
  queueItems: undefined,
  jobLogs: undefined
} as unknown as SaasDashboard);

assert.deepEqual(normalized.approvals, []);
assert.deepEqual(normalized.queues, []);
assert.deepEqual(normalized.queueItems, []);
assert.deepEqual(normalized.jobLogs, []);

const workerSource = await fs.readFile(new URL("../scripts/build-sites-worker.mjs", import.meta.url), "utf8");
for (const contract of ["queues: state.queues", "queueItems: state.queueItems", "jobLogs: state.jobLogs"]) {
  assert.match(workerSource, new RegExp(contract.replace(".", "\\.")));
}

const layoutSource = await fs.readFile(new URL("../src/client/ui/AppLayout.tsx", import.meta.url), "utf8");
assert.match(layoutSource, /to="\/approvals"/);
assert.match(layoutSource, /bekleyen onayı aç/);
assert.match(layoutSource, /to: "\/jobs", label: "Hazırlanan Dosyalar"/);
assert.match(layoutSource, /link\.to === "\/jobs" \? "Dosyalar"/);

const dashboardSource = await fs.readFile(new URL("../src/client/pages/DashboardPage.tsx", import.meta.url), "utf8");
assert.match(dashboardSource, /Hazırlanan dosyaları görün/);
assert.match(dashboardSource, /Belgeler → OtoFlow Raporları/);
assert.match(dashboardSource, /Tek sayfalık, kolay okunur haftalık özet/);
assert.match(dashboardSource, /Dosyalarda yapılan işlemlerin sade açıklaması/);

console.log(JSON.stringify({ ok: true, normalizedCollections: 4, notificationTarget: "/approvals", preparedFilesNavigation: true }));
