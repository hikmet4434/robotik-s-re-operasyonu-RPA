import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const readableExtensions = new Set([".txt", ".md", ".json", ".csv", ".tsv", ".log", ".xml", ".yaml", ".yml", ".html", ".css", ".js", ".ts", ".tsx", ".jsx"]);

function expandPath(value) {
  if (!value) return value;
  return path.resolve(value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value);
}

function defaultRoots() {
  return ["Documents", "Downloads", "Desktop"].map((folder) => path.join(os.homedir(), folder));
}

export class FileExecutor {
  constructor(summarize) {
    this.summarize = summarize;
    this.allowedRoots = (process.env.OTOFLOW_ALLOWED_PATHS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(expandPath);
    if (this.allowedRoots.length === 0) this.allowedRoots = defaultRoots();
  }

  assertAllowed(requestedPath) {
    const resolved = expandPath(requestedPath);
    if (!resolved) throw new Error("Dosya adımı için klasör veya rapor yolu gerekli.");
    const allowed = this.allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
    if (!allowed) throw new Error(`Bu yol izin verilen çalışma klasörlerinin dışında: ${resolved}`);
    return resolved;
  }

  async scan(parameters) {
    const root = this.assertAllowed(parameters.directoryPath);
    const lookbackMs = Math.max(1, parameters.lookbackDays || 7) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;
    const maxFiles = Math.min(5000, Math.max(1, parameters.maxFiles || 500));
    const extensions = new Set((parameters.extensions || []).map((value) => value.toLowerCase().replace(/^([^\.])/, ".$1")));
    const files = [];

    const visit = async (directory, depth = 0) => {
      if (files.length >= maxFiles || depth > 12) return;
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (parameters.recursive !== false) await visit(absolutePath, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (extensions.size > 0 && !extensions.has(extension)) continue;
        const stat = await fs.stat(absolutePath);
        if (stat.mtimeMs < cutoff && stat.birthtimeMs < cutoff) continue;
        files.push({
          name: entry.name,
          relativePath: path.relative(root, absolutePath),
          absolutePath,
          extension,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          createdAt: stat.birthtime.toISOString()
        });
      }
    };

    await visit(root);
    files.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    return { root, scannedAt: new Date().toISOString(), lookbackDays: parameters.lookbackDays || 7, files };
  }

  findScan(outputs) {
    const direct = Object.values(outputs || {}).find((value) => value && typeof value === "object" && Array.isArray(value.files));
    if (!direct) throw new Error("Özetlenecek dosya tarama çıktısı bulunamadı.");
    return direct;
  }

  async summarizeFiles(outputs, parameters) {
    const scan = this.findScan(outputs);
    const files = [];
    for (const file of scan.files.slice(0, 100)) {
      const safePath = this.assertAllowed(file.absolutePath);
      let excerpt;
      if (readableExtensions.has(path.extname(safePath).toLowerCase()) && file.size <= 2_000_000) {
        const handle = await fs.open(safePath, "r");
        try {
          const buffer = Buffer.alloc(Math.min(3000, file.size));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          excerpt = buffer.subarray(0, bytesRead).toString("utf8").replace(/\0/g, "");
        } finally {
          await handle.close();
        }
      }
      files.push({ name: file.name, relativePath: file.relativePath, size: file.size, modifiedAt: file.modifiedAt, excerpt });
    }
    const summary = await this.summarize(files, parameters.prompt);
    return { count: files.length, summary, files: files.map(({ excerpt, ...file }) => ({ ...file, hasTextPreview: Boolean(excerpt) })) };
  }

  summarizeActivity(outputs) {
    const scan = this.findScan(outputs);
    const byDay = {};
    const byExtension = {};
    for (const file of scan.files) {
      const day = file.modifiedAt.slice(0, 10);
      const extension = file.extension || "uzantısız";
      byDay[day] = (byDay[day] || 0) + 1;
      byExtension[extension] = (byExtension[extension] || 0) + 1;
    }
    return { totalFiles: scan.files.length, byDay, byExtension, periodDays: scan.lookbackDays };
  }

  composeReport(outputs, parameters) {
    const summaryOutput = Object.values(outputs || {}).find((value) => value && typeof value === "object" && typeof value.summary === "string");
    const activity = Object.values(outputs || {}).find((value) => value && typeof value === "object" && value.byDay && value.byExtension);
    const dayLines = Object.entries(activity?.byDay || {}).map(([day, count]) => `- ${day}: ${count} dosya`).join("\n") || "- Dosya hareketi bulunmadı.";
    const typeLines = Object.entries(activity?.byExtension || {}).map(([extension, count]) => `- ${extension}: ${count}`).join("\n") || "- Dosya türü bulunmadı.";
    return [
      `# ${parameters.reportTitle || "OtoFlow Otomasyon Raporu"}`,
      `\nOluşturulma: ${new Date().toLocaleString("tr-TR")}`,
      `\n## Genel Bakış\n${activity?.totalFiles || 0} yeni veya değişen dosya incelendi.`,
      `\n## Dosya Özetleri\n${summaryOutput?.summary || "Özetlenecek dosya bulunmadı."}`,
      `\n## Günlere Göre Aktivite\n${dayLines}`,
      `\n## Dosya Türleri\n${typeLines}`
    ].join("\n");
  }

  async saveReport(outputs, parameters) {
    const report = Object.values(outputs || {}).find((value) => typeof value === "string" && value.startsWith("# "));
    if (!report) throw new Error("Kaydedilecek rapor çıktısı bulunamadı.");
    const reportPath = this.assertAllowed(parameters.reportPath);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, report, "utf8");
    return { reportPath, bytes: Buffer.byteLength(report), savedAt: new Date().toISOString() };
  }

  async execute(step, outputs) {
    const parameters = step.parameters || {};
    if (step.type === "files.scan") {
      const output = await this.scan(parameters);
      return { summary: `${output.files.length} yeni veya değişen dosya bulundu.`, output };
    }
    if (step.type === "files.summarize") {
      const output = await this.summarizeFiles(outputs, parameters);
      return { summary: `${output.count} dosya özetlendi.`, output };
    }
    if (step.type === "activity.summarize") {
      const output = this.summarizeActivity(outputs);
      return { summary: `${output.totalFiles} dosyanın haftalık aktivitesi gruplandı.`, output };
    }
    if (step.type === "report.compose") {
      const output = this.composeReport(outputs, parameters);
      return { summary: "Haftalık Markdown raporu hazırlandı.", output };
    }
    if (step.type === "report.save") {
      const output = await this.saveReport(outputs, parameters);
      return { summary: `Rapor ${output.reportPath} konumuna kaydedildi.`, output };
    }
    throw new Error(`${step.type} dosya yürütücüsü tarafından desteklenmiyor.`);
  }
}
