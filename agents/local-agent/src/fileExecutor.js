import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const readableExtensions = new Set([".txt", ".md", ".json", ".csv", ".tsv", ".log", ".xml", ".yaml", ".yml", ".html", ".css", ".js", ".ts", ".tsx", ".jsx"]);
const ignoredDirectoryNames = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "target", "vendor", ".venv", "venv", "__pycache__", "browser-profile", "Cache", "Caches", "Code Cache", "GPUCache", "OtoFlow Raporları"]);
const ignoredTechnicalExtensions = new Set([".sqlite", ".sqlite-wal", ".sqlite-shm", ".db", ".db-wal", ".db-shm", ".pma", ".journal", ".tsbuildinfo"]);

function expandPath(value) {
  if (!value) return value;
  return path.resolve(value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value);
}

function defaultRoots() {
  return ["Documents", "Downloads", "Desktop"].map((folder) => path.join(os.homedir(), folder));
}

function findRecentFiles(root, markerPath, recursive) {
  return new Promise((resolve, reject) => {
    const ignoredNames = [...ignoredDirectoryNames];
    const pruneExpression = ["-type", "d", "(", "-name", ".*", ...ignoredNames.flatMap((name) => ["-o", "-name", name]), ")", "-prune"];
    const args = [root, ...(recursive === false ? ["-maxdepth", "1"] : []), ...pruneExpression, "-o", "-type", "f", "!", "-name", ".*", "!", "-name", "~$*", "(", "-newer", markerPath, "-o", "-Bnewer", markerPath, ")", "-print0"];
    const child = spawn("/usr/bin/find", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    const errors = [];
    let bytes = 0;
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 50_000_000) {
        child.kill("SIGTERM");
        reject(new Error("Dosya listesi güvenli tarama sınırını aştı."));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => errors.push(chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", () => {
      const paths = Buffer.concat(chunks).toString("utf8").split("\0").filter(Boolean);
      resolve({ paths, errors: errors.join("").split("\n").filter(Boolean) });
    });
  });
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
    const requestedRoots = parameters.directoryPaths?.length ? parameters.directoryPaths : [parameters.directoryPath];
    const roots = [...new Set(requestedRoots.map((value) => this.assertAllowed(value)))];
    const lookbackMs = Math.max(1, parameters.lookbackDays || 7) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;
    const maxFiles = Math.min(5000, Math.max(1, parameters.maxFiles || 500));
    const extensions = new Set((parameters.extensions || []).map((value) => value.toLowerCase().replace(/^([^\.])/, ".$1")));
    const files = [];
    const inaccessiblePaths = [];

    const visit = async (root, directory, depth = 0) => {
      if (files.length >= maxFiles || depth > 12) return;
      let entries;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) {
        inaccessiblePaths.push({ path: directory, reason: error instanceof Error ? error.message : "Klasör okunamadı" });
        return;
      }
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (ignoredDirectoryNames.has(entry.name)) continue;
          if (parameters.recursive !== false) await visit(root, absolutePath, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        if (entry.name.startsWith("~$")) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (ignoredTechnicalExtensions.has(extension)) continue;
        if (extensions.size > 0 && !extensions.has(extension)) continue;
        let stat;
        try {
          stat = await fs.stat(absolutePath);
        } catch {
          continue;
        }
        if (stat.mtimeMs < cutoff && stat.birthtimeMs < cutoff) continue;
        files.push({
          name: entry.name,
          root: path.basename(root),
          relativePath: path.join(path.basename(root), path.relative(root, absolutePath)),
          absolutePath,
          extension,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          createdAt: stat.birthtime.toISOString()
        });
      }
    };

    if (process.platform === "darwin") {
      const markerPath = path.join(os.tmpdir(), `otoflow-cutoff-${process.pid}-${Date.now()}`);
      await fs.writeFile(markerPath, "", "utf8");
      await fs.utimes(markerPath, cutoff / 1000, cutoff / 1000);
      try {
        const foundByRoot = await Promise.all(roots.map(async (root) => ({ root, ...(await findRecentFiles(root, markerPath, parameters.recursive)) })));
        for (const found of foundByRoot) {
          inaccessiblePaths.push(...found.errors.map((reason) => ({ path: found.root, reason })));
          for (let index = 0; index < found.paths.length; index += 100) {
            const batch = await Promise.all(found.paths.slice(index, index + 100).map(async (absolutePath) => {
              const extension = path.extname(absolutePath).toLowerCase();
              if (ignoredTechnicalExtensions.has(extension)) return undefined;
              if (extensions.size > 0 && !extensions.has(extension)) return undefined;
              try {
                const stat = await fs.stat(absolutePath);
                if (stat.mtimeMs < cutoff && stat.birthtimeMs < cutoff) return undefined;
                return {
                  name: path.basename(absolutePath),
                  root: path.basename(found.root),
                  relativePath: path.join(path.basename(found.root), path.relative(found.root, absolutePath)),
                  absolutePath,
                  extension,
                  size: stat.size,
                  modifiedAt: stat.mtime.toISOString(),
                  createdAt: stat.birthtime.toISOString()
                };
              } catch {
                return undefined;
              }
            }));
            files.push(...batch.filter(Boolean));
          }
        }
      } finally {
        await fs.rm(markerPath, { force: true });
      }
    } else {
      for (const root of roots) {
        if (files.length >= maxFiles) break;
        await visit(root, root);
      }
    }
    files.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    const maxFilesReached = files.length > maxFiles;
    return { root: roots[0], roots, scannedAt: new Date().toISOString(), lookbackDays: parameters.lookbackDays || 7, maxFilesReached, inaccessiblePaths, files: files.slice(0, maxFiles) };
  }

  findScan(outputs) {
    const direct = Object.values(outputs || {}).find((value) => value && typeof value === "object" && Array.isArray(value.files));
    if (!direct) throw new Error("Özetlenecek dosya tarama çıktısı bulunamadı.");
    return direct;
  }

  async summarizeFiles(outputs, parameters) {
    const scan = this.findScan(outputs);
    const files = [];
    const candidates = scan.files.slice(0, 100);
    for (let index = 0; index < candidates.length; index += 10) {
      const batch = await Promise.all(candidates.slice(index, index + 10).map(async (file) => {
        const safePath = this.assertAllowed(file.absolutePath);
        let excerpt;
        if (readableExtensions.has(path.extname(safePath).toLowerCase()) && file.size <= 2_000_000) {
          try {
            const content = await fs.readFile(safePath, { signal: AbortSignal.timeout(1_500) });
            excerpt = content.subarray(0, 3000).toString("utf8").replace(/\0/g, "");
          } catch {
            excerpt = undefined;
          }
        }
        return { name: file.name, relativePath: file.relativePath, size: file.size, modifiedAt: file.modifiedAt, excerpt };
      }));
      files.push(...batch);
    }
    const summary = await this.summarize(files, parameters.prompt);
    return { count: files.length, totalFiles: scan.files.length, omittedCount: Math.max(0, scan.files.length - files.length), summary, files: files.map(({ excerpt, ...file }) => ({ ...file, hasTextPreview: Boolean(excerpt) })) };
  }

  summarizeActivity(outputs) {
    const scan = this.findScan(outputs);
    const byDay = {};
    const byDayDetails = {};
    const byExtension = {};
    const byRoot = {};
    for (const file of scan.files) {
      const day = file.modifiedAt.slice(0, 10);
      const extension = file.extension || "uzantısız";
      const pathParts = file.relativePath.split(/[\\/]/).filter(Boolean);
      const area = pathParts.length >= 3 ? `${pathParts[0]}/${pathParts[1]}` : pathParts[0] || "Diğer";
      byDay[day] = (byDay[day] || 0) + 1;
      byExtension[extension] = (byExtension[extension] || 0) + 1;
      byRoot[file.root || "Diğer"] = (byRoot[file.root || "Diğer"] || 0) + 1;
      byDayDetails[day] ||= { count: 0, areas: {}, fileNames: [] };
      byDayDetails[day].count += 1;
      byDayDetails[day].areas[area] = (byDayDetails[day].areas[area] || 0) + 1;
      if (byDayDetails[day].fileNames.length < 6) byDayDetails[day].fileNames.push(file.name);
    }
    return { totalFiles: scan.files.length, byDay, byDayDetails, byExtension, byRoot, periodDays: scan.lookbackDays, maxFilesReached: scan.maxFilesReached, inaccessibleCount: scan.inaccessiblePaths?.length || 0 };
  }

  composeReport(outputs, parameters) {
    const summaryOutput = Object.values(outputs || {}).find((value) => value && typeof value === "object" && typeof value.summary === "string");
    const activity = Object.values(outputs || {}).find((value) => value && typeof value === "object" && value.byDay && value.byExtension);
    const dayLines = Object.entries(activity?.byDayDetails || {}).sort(([left], [right]) => right.localeCompare(left)).map(([day, detail]) => {
      const areas = Object.entries(detail.areas || {}).sort(([, left], [, right]) => right - left).slice(0, 4).map(([area, count]) => `${area} (${count})`).join(", ");
      const fileNames = (detail.fileNames || []).join(", ");
      return `### ${day}\n- ${detail.count} dosyada hareket\n- Çalışma alanları: ${areas || "Belirlenemedi"}\n- Öne çıkan dosyalar: ${fileNames || "Dosya adı bulunmadı"}`;
    }).join("\n\n") || "- Dosya hareketi bulunmadı.";
    const typeLines = Object.entries(activity?.byExtension || {}).sort(([, left], [, right]) => right - left).map(([extension, count]) => `- ${extension}: ${count}`).join("\n") || "- Dosya türü bulunmadı.";
    const rootLines = Object.entries(activity?.byRoot || {}).sort(([, left], [, right]) => right - left).map(([root, count]) => `- ${root}: ${count} dosya`).join("\n") || "- Klasör hareketi bulunmadı.";
    const coverageNote = activity?.maxFilesReached ? "\n\nNot: Güvenli dosya sınırına ulaşıldı; en yeni dosyalar raporlandı." : "";
    return [
      `# ${parameters.reportTitle || "OtoFlow Otomasyon Raporu"}`,
      `\nOluşturulma: ${new Date().toLocaleString("tr-TR")}`,
      `\n## Genel Bakış\n${activity?.totalFiles || 0} yeni veya değişen dosya incelendi.${coverageNote}`,
      `\n## Dosya Özetleri\n${summaryOutput?.summary || "Özetlenecek dosya bulunmadı."}`,
      `\n## Günlere Göre Aktivite\n${dayLines}`,
      `\n## Klasörlere Göre Aktivite\n${rootLines}`,
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
