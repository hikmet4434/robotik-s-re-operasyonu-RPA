import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { FileExecutor } from "../agents/local-agent/src/fileExecutor.js";

const suffix = Date.now().toString(36);
const base = path.resolve("data", `multi-root-${suffix}`);
const documents = path.join(base, "Documents");
const downloads = path.join(base, "Downloads");
const reportPath = path.join(documents, "OtoFlow Raporları", "haftalik.md");

await fs.mkdir(path.join(documents, "proje"), { recursive: true });
await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(path.join(documents, "node_modules", "ignored-package"), { recursive: true });
await fs.writeFile(path.join(documents, "proje", "notlar.md"), "Haftalık proje notları", "utf8");
await fs.writeFile(path.join(downloads, "yeni-talep.txt"), "Yeni müşteri talebi", "utf8");
await fs.writeFile(path.join(documents, "node_modules", "ignored-package", "index.js"), "ignored", "utf8");

process.env.OTOFLOW_ALLOWED_PATHS = [documents, downloads].join(",");
const executor = new FileExecutor(async (files) => files.map((file) => `- ${file.relativePath}`).join("\n"));

try {
  const scan = await executor.scan({ directoryPaths: [documents, downloads], lookbackDays: 7, recursive: true, maxFiles: 100 });
  assert.equal(scan.roots.length, 2);
  assert.deepEqual(scan.files.map((file) => file.name).sort(), ["notlar.md", "yeni-talep.txt"]);
  assert.ok(scan.files.some((file) => file.relativePath === path.join("Documents", "proje", "notlar.md")));
  assert.ok(scan.files.some((file) => file.relativePath === path.join("Downloads", "yeni-talep.txt")));

  const outputs = { weeklyFiles: scan };
  const summaries = await executor.summarizeFiles(outputs, { prompt: "Özetle" });
  const activity = executor.summarizeActivity(outputs);
  const report = executor.composeReport({ ...outputs, fileSummaries: summaries, weeklyActivity: activity }, { reportTitle: "Haftalık Dosya ve Çalışma Özeti" });
  const saved = await executor.saveReport({ weeklyReport: report }, { reportPath });

  assert.equal(activity.byRoot.Documents, 1);
  assert.equal(activity.byRoot.Downloads, 1);
  assert.equal(Object.values(activity.byDayDetails)[0].count, 2);
  assert.match(report, /Klasörlere Göre Aktivite/);
  assert.equal(saved.reportPath, reportPath);
  assert.match(await fs.readFile(reportPath, "utf8"), /yeni-talep\.txt/);
} finally {
  await fs.rm(base, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, roots: 2, files: 2 }));
