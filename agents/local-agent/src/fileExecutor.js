import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { writePdfReport } from "./pdfReport.js";

const readableExtensions = new Set([".txt", ".md", ".json", ".csv", ".tsv", ".log", ".xml", ".yaml", ".yml", ".html", ".css", ".js", ".ts", ".tsx", ".jsx"]);
const ignoredDirectoryNames = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "target", "vendor", ".venv", "venv", "__pycache__", "browser-profile", "Cache", "Caches", "Code Cache", "GPUCache", "OtoFlow Raporları"]);
const ignoredTechnicalExtensions = new Set([".sqlite", ".sqlite-wal", ".sqlite-shm", ".db", ".db-wal", ".db-shm", ".pma", ".journal", ".tsbuildinfo"]);

const fileTypeGroups = {
  application: new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".swift", ".py", ".java", ".sh"]),
  document: new Set([".md", ".txt", ".pdf", ".doc", ".docx", ".rtf"]),
  data: new Set([".csv", ".tsv", ".xls", ".xlsx", ".json", ".xml", ".yaml", ".yml"]),
  image: new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]),
  archive: new Set([".zip", ".rar", ".7z", ".tar", ".gz"])
};

const fileTypeLabels = {
  application: "Program çalışma dosyası",
  configuration: "Program ayar dosyası",
  document: "Belge veya not",
  data: "Tablo veya veri dosyası",
  image: "Görsel",
  archive: "Arşiv dosyası",
  other: "Diğer dosya"
};

function fileType(file) {
  const extension = (file.extension || path.extname(file.name)).toLowerCase();
  if (/(^|[-_.])(config|settings?|package|tsconfig|vite|tailwind|postcss)([-_.]|$)/i.test(file.name)) return "configuration";
  return Object.entries(fileTypeGroups).find(([, extensions]) => extensions.has(extension))?.[0] || "other";
}

function friendlyDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

function friendlyRoot(value) {
  return { Documents: "Belgeler", Downloads: "İndirilenler", Desktop: "Masaüstü" }[value] || value || "Diğer";
}

function workArea(file) {
  const parts = file.relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.length > 2) return parts[1];
  return friendlyRoot(parts[0] || file.root);
}

function isNewFile(file, scan) {
  const cutoff = new Date(scan.scannedAt).getTime() - scan.lookbackDays * 24 * 60 * 60 * 1000;
  return Number.isFinite(new Date(file.createdAt).getTime()) && new Date(file.createdAt).getTime() >= cutoff;
}

function purposeForFiles(files) {
  const counts = files.reduce((result, file) => {
    const type = fileType(file);
    result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  const dominant = Object.entries(counts).sort(([, left], [, right]) => right - left)[0]?.[0] || "other";
  return {
    application: "Uygulama üzerinde geliştirme, bakım veya düzeltme çalışması yapıldı.",
    configuration: "Programın çalışma ayarları oluşturuldu veya güncellendi.",
    document: "Belge, not veya rapor içerikleri hazırlandı ve güncellendi.",
    data: "Tablo ve veri kayıtları yenilendi veya yeni veriler eklendi.",
    image: "Görsel dosyalar hazırlandı, düzenlendi veya çalışma alanına eklendi.",
    archive: "Dosyalar paketlendi veya toplu halde çalışma alanına eklendi.",
    other: "Bu çalışma alanındaki dosyalar oluşturuldu veya güncellendi."
  }[dominant];
}

function fileResult(file, change) {
  const type = fileType(file);
  if (change === "Yeni eklendi") {
    return {
      application: "Programın ilgili bölümünü çalıştıran yeni bir dosya eklendi.",
      configuration: "Program için yeni bir ayar dosyası eklendi.",
      document: "Yeni bir belge veya not hazırlandı.",
      data: "Yeni bir tablo veya veri kaydı eklendi.",
      image: "Yeni bir görsel çalışma alanına eklendi.",
      archive: "Yeni bir toplu dosya paketi eklendi.",
      other: "Çalışma alanına yeni bir dosya eklendi."
    }[type];
  }
  return {
    application: "Programın ilgili bölümünde değişiklik yapıldı.",
    configuration: "Programın çalışma ayarları değiştirildi.",
    document: "Belge veya not içeriği güncellendi.",
    data: "Tablo veya veri kayıtları güncellendi.",
    image: "Görsel dosya üzerinde değişiklik yapıldı.",
    archive: "Toplu dosya paketi yenilendi.",
    other: "Dosyada değişiklik yapıldı."
  }[type];
}

function deriveDetailReportPath(reportPath) {
  const extension = path.extname(reportPath);
  return extension ? `${reportPath.slice(0, -extension.length)}-ayrintilar${extension}` : `${reportPath}-ayrintilar.pdf`;
}

function summaryHighlights(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  const withoutCodeBlocks = value.replace(/```[\s\S]*?```/g, " ");
  const sourceLines = withoutCodeBlocks.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = sourceLines.length > 1
    ? sourceLines
    : withoutCodeBlocks.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
  return candidates
    .map((line) => line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/`/g, "")
      .replace(/(?:\/Users\/|~\/|[A-Za-z]:\\)[^\s,;]+/g, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter((line) => line.length >= 12
      && !/[{}<>]|=>|\b(?:const|function|import|export|class)\s/i.test(line)
      && !/(?:^|\s)(?:Documents|Downloads|Desktop)[\\/][^\s]+/i.test(line))
    .slice(0, 5)
    .map((line) => `- ${line.slice(0, 220)}${/[.!?]$/.test(line.slice(0, 220)) ? "" : "."}`);
}

function summarySignalScore(file) {
  const value = `${file.name || ""} ${file.relativePath || ""}`.toLocaleLowerCase("tr-TR");
  if (/stripe|admin[-_ ]?login.*(?:not[-_ ]defined|referenceerror)|referenceerror.*admin[-_ ]?login/.test(value)) return 100;
  if (/dashboard|admin[-_ ]?panel|pdf|weekly[-_ ]?report|haftalık[-_ ]?rapor/.test(value)) return 90;
  if (/uncaught|exception|error|bug|fix|hata|login|auth|credential|vault/.test(value)) return 80;
  if (/workflow|automation|otomasyon|orchestrator|local[-_ ]?agent|fileexecutor/.test(value)) return 70;
  if (/news|haber|appstore|screenshot|deploy|hosting|coolify|netlify|mobile|responsive/.test(value)) return 60;
  return 0;
}

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
    const candidates = [...scan.files]
      .sort((left, right) => summarySignalScore(right) - summarySignalScore(left) || right.modifiedAt.localeCompare(left.modifiedAt))
      .slice(0, 100);
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
        return { name: file.name, relativePath: file.relativePath, extension: file.extension, size: file.size, modifiedAt: file.modifiedAt, createdAt: file.createdAt, excerpt };
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
    const scan = this.findScan(outputs);
    const summaryOutput = Object.values(outputs || {}).find((value) => value && typeof value === "object" && typeof value.summary === "string");
    const activity = Object.values(outputs || {}).find((value) => value && typeof value === "object" && value.byDay && value.byExtension);
    const areas = Object.entries(scan.files.reduce((result, file) => {
      const area = workArea(file);
      result[area] ||= [];
      result[area].push(file);
      return result;
    }, {})).sort(([, left], [, right]) => right.length - left.length);
    const newCount = scan.files.filter((file) => isNewFile(file, scan)).length;
    const updatedCount = scan.files.length - newCount;
    const inferredHighlights = summaryHighlights(summaryOutput?.summary);
    const highlightLines = inferredHighlights.length > 0
      ? inferredHighlights.join("\n")
      : areas.slice(0, 5).map(([area, files]) => `- **${area}:** ${purposeForFiles(files)}`).join("\n") || "- Bu hafta kayda değer bir dosya hareketi bulunmadı.";
    const areaOverview = areas.slice(0, 4).map(([area, files]) => `${area} (${files.length} dosya)`).join(", ");
    const busiestDay = Object.entries(activity?.byDay || {}).sort(([, left], [, right]) => right - left)[0];
    const attention = activity?.maxFilesReached
      ? "Dosya sayısı güvenli inceleme sınırına ulaştı. En yeni dosyalar rapora alındı."
      : activity?.inaccessibleCount > 0
        ? `${activity.inaccessibleCount} korumalı klasör okunamadı; diğer klasörler başarıyla incelendi.`
        : "İnceleme sırasında kullanıcı müdahalesi gerektiren bir sorun görülmedi.";
    return [
      `# ${parameters.reportTitle || "OtoFlow Otomasyon Raporu"}`,
      `\nOluşturulma: ${new Date().toLocaleString("tr-TR")}`,
      "\nBu rapor, son bir haftadaki çalışmalarınızı teknik ayrıntıya girmeden özetler.",
      `\n## Kısa Sonuç\nToplam ${scan.files.length} dosya incelendi. ${newCount} yeni dosya eklendi, ${updatedCount} dosya güncellendi. ${Object.keys(activity?.byDay || {}).length} farklı günde çalışma kaydı bulundu.`,
      busiestDay ? `\nEn yoğun gün ${friendlyDate(busiestDay[0])} oldu; o gün ${busiestDay[1]} dosyada işlem yapıldı.` : "",
      `\n## Öne Çıkan Gelişmeler\n${highlightLines}`,
      areaOverview ? `\n## Çalışmanın Dağılımı\nEn çok hareket görülen alanlar: ${areaOverview}.` : "",
      `\n## Dikkat Gerekenler\n${attention}`,
      "\n## Daha Fazla Ayrıntı\nHangi dosyalarda işlem yapıldığını görmek için OtoFlow sonuç ekranındaki **Ayrıntılı Rapor** seçeneğini açabilirsiniz."
    ].join("\n");
  }

  composeDetailedReport(outputs, parameters) {
    const scan = this.findScan(outputs);
    const summaryOutput = Object.values(outputs || {}).find((value) => value && typeof value === "object" && typeof value.summary === "string");
    const areas = Object.entries(scan.files.reduce((result, file) => {
      const area = workArea(file);
      result[area] ||= [];
      result[area].push(file);
      return result;
    }, {})).sort(([, left], [, right]) => right.length - left.length);
    const areaSections = areas.map(([area, files]) => {
      const newCount = files.filter((file) => isNewFile(file, scan)).length;
      const updatedCount = files.length - newCount;
      const fileLines = files
        .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
        .map((file) => {
          const change = isNewFile(file, scan) ? "Yeni eklendi" : "Güncellendi";
          const type = fileTypeLabels[fileType(file)];
          const result = fileResult(file, change);
          return `- **${file.name}** — ${change}. ${type}. ${result}`;
        }).join("\n");
      return `## ${area}\n**Problem veya istek:** Dosya hareketlerine göre ${purposeForFiles(files).toLocaleLowerCase("tr-TR")}\n\n**Yapılan işlem:** ${newCount} yeni dosya eklendi, ${updatedCount} dosya güncellendi.\n\n**Sonuç:** Bu çalışma alanında toplam ${files.length} dosyadaki işlem kayda alındı ve aşağıda sade biçimde açıklandı.\n\n### İşlem Yapılan Dosyalar\n${fileLines}`;
    }).join("\n\n");
    const contentReview = typeof summaryOutput?.count === "number" && summaryOutput.count < scan.files.length
      ? ` İçeriği okunabilen ${summaryOutput.count} dosya ayrıca incelendi.`
      : "";
    return [
      `# ${parameters.detailReportTitle || "Haftalık Çalışma Ayrıntıları"}`,
      `\nOluşturulma: ${new Date().toLocaleString("tr-TR")}`,
      "\nBu rapor kod veya teknik içerik göstermez. Dosyalarda görülen hareketleri günlük bilgisayar kullanım diliyle açıklar.",
      `\n## Genel Değerlendirme\nToplam ${scan.files.length} yeni veya değişen dosya ayrıntılandırıldı.${contentReview}\n\n${summaryOutput?.summary || "Dosya hareketleri çalışma alanlarına göre gruplandı."}`,
      `\n${areaSections || "Bu dönemde ayrıntılandırılacak bir dosya hareketi bulunmadı."}`
    ].join("\n");
  }

  async saveReport(outputs, parameters) {
    const report = Object.values(outputs || {}).find((value) => typeof value === "string" && value.startsWith("# "));
    if (!report) throw new Error("Kaydedilecek rapor çıktısı bulunamadı.");
    const reportPath = this.assertAllowed(parameters.reportPath);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    const isPdf = path.extname(reportPath).toLowerCase() === ".pdf";
    const bytes = isPdf ? await writePdfReport(report, reportPath) : Buffer.byteLength(report);
    if (!isPdf) await fs.writeFile(reportPath, report, "utf8");
    let detailReportPath;
    let detailBytes;
    if (parameters.includeDetailedReport !== false) {
      detailReportPath = this.assertAllowed(parameters.detailReportPath || deriveDetailReportPath(reportPath));
      const detailReport = this.composeDetailedReport(outputs, parameters);
      await fs.mkdir(path.dirname(detailReportPath), { recursive: true });
      detailBytes = path.extname(detailReportPath).toLowerCase() === ".pdf"
        ? await writePdfReport(detailReport, detailReportPath)
        : Buffer.byteLength(detailReport);
      if (path.extname(detailReportPath).toLowerCase() !== ".pdf") await fs.writeFile(detailReportPath, detailReport, "utf8");
    }
    return { reportPath, bytes, detailReportPath, detailBytes, format: isPdf ? "pdf" : "markdown", savedAt: new Date().toISOString() };
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
      return { summary: "Haftalık rapor hazırlandı.", output };
    }
    if (step.type === "report.save") {
      const output = await this.saveReport(outputs, parameters);
      return { summary: `Rapor ${output.reportPath} konumuna kaydedildi.`, output };
    }
    throw new Error(`${step.type} dosya yürütücüsü tarafından desteklenmiyor.`);
  }
}
