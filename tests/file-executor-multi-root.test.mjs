import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { FileExecutor } from "../agents/local-agent/src/fileExecutor.js";

const suffix = Date.now().toString(36);
const base = path.resolve("data", `multi-root-${suffix}`);
const documents = path.join(base, "Documents");
const downloads = path.join(base, "Downloads");
const reportPath = path.join(documents, "OtoFlow Raporları", "haftalik.pdf");

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
  const reportOutputs = { ...outputs, fileSummaries: summaries, weeklyActivity: activity };
  const report = executor.composeReport(reportOutputs, { reportTitle: "Haftalık Dosya ve Çalışma Özeti" });
  const detailReport = executor.composeDetailedReport(reportOutputs, { detailReportTitle: "Haftalık Çalışma Ayrıntıları" });
  const saved = await executor.saveReport({ ...reportOutputs, weeklyReport: report }, { reportPath });

  let prioritizedFiles = [];
  const priorityExecutor = new FileExecutor(async (files) => {
    prioritizedFiles = files;
    return "- Yönetim giriş ekranındaki eksik tanım hatası giderildi.";
  });
  const priorityScan = {
    ...scan,
    files: [
      ...Array.from({ length: 100 }, (_, index) => ({ ...scan.files[0], name: `genel-${index}.md`, relativePath: `Documents/proje/genel-${index}.md` })),
      { ...scan.files[0], name: "ReferenceError-AdminLogin-is-not-defined.txt", relativePath: "Documents/proje/ReferenceError-AdminLogin-is-not-defined.txt" }
    ]
  };
  await priorityExecutor.summarizeFiles({ priorityScan }, { prompt: "Özetle" });

  assert.equal(activity.byRoot.Documents, 1);
  assert.equal(activity.byRoot.Downloads, 1);
  assert.equal(Object.values(activity.byDayDetails)[0].count, 2);
  assert.doesNotMatch(report, /notlar\.md/);
  assert.match(report, /Kısa Sonuç/);
  assert.match(report, /Öne Çıkan Gelişmeler/);
  assert.match(report, /Çalışmanın Dağılımı/);
  assert.ok(prioritizedFiles.some((file) => file.name === "ReferenceError-AdminLogin-is-not-defined.txt"));
  assert.match(detailReport, /Problem veya istek/);
  assert.match(detailReport, /Yapılan işlem/);
  assert.match(detailReport, /Sonuç/);
  assert.match(detailReport, /notlar\.md/);
  assert.equal(saved.reportPath, reportPath);
  assert.equal(saved.format, "pdf");
  const pdf = await fs.readFile(reportPath);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 5_000);
  assert.ok(saved.detailReportPath.endsWith("-ayrintilar.pdf"));
  const detailPdf = await fs.readFile(saved.detailReportPath);
  assert.equal(detailPdf.subarray(0, 5).toString("ascii"), "%PDF-");
} finally {
  await fs.rm(base, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, roots: 2, files: 2 }));
