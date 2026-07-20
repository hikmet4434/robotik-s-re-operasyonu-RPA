import fs from "node:fs";
import { chromium } from "playwright-core";

const browserCandidates = process.platform === "darwin"
  ? [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ]
  : process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

function browserExecutable() {
  const configured = process.env.OTOFLOW_BROWSER_EXECUTABLE;
  if (configured && fs.existsSync(configured)) return configured;
  return browserCandidates.find((candidate) => fs.existsSync(candidate));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let listItems = [];

  const closeList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith("- ")) {
      listItems.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    blocks.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  return blocks.join("\n");
}

function reportDocument(markdown) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>OtoFlow Otomasyon Raporu</title>
  <style>
    @page { size: A4; margin: 22mm 17mm 20mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font-family: Inter, Arial, "Helvetica Neue", sans-serif; font-size: 10.5pt; line-height: 1.55; }
    .brand { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f766e; padding-bottom: 9px; margin-bottom: 22px; }
    .brand-name { color: #0f766e; font-size: 12pt; font-weight: 800; }
    .brand-label { color: #64748b; font-size: 8.5pt; font-weight: 600; text-transform: uppercase; }
    h1 { color: #0f172a; font-size: 23pt; line-height: 1.15; margin: 0 0 10px; }
    h2 { color: #0f766e; font-size: 14pt; line-height: 1.3; border-bottom: 1px solid #d7e1e7; margin: 24px 0 9px; padding-bottom: 5px; break-after: avoid; }
    h3 { color: #334155; font-size: 11.5pt; line-height: 1.35; margin: 17px 0 6px; break-after: avoid; }
    p { margin: 5px 0 10px; }
    ul { margin: 5px 0 12px; padding-left: 19px; }
    li { margin: 3px 0; padding-left: 2px; }
    li::marker { color: #0f766e; }
    strong { color: #0f172a; }
    h2, h3, li { break-inside: avoid; }
  </style>
</head>
<body>
  <div class="brand"><span class="brand-name">OtoFlow AI</span><span class="brand-label">Otomasyon Raporu</span></div>
  <main>${markdownToHtml(markdown)}</main>
</body>
</html>`;
}

export async function writePdfReport(markdown, outputPath) {
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error("PDF oluşturmak için Chrome, Edge veya Chromium bulunamadı.");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(reportDocument(markdown), { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: '<div style="width:100%;padding:0 17mm;color:#64748b;font:8px Arial;text-align:right"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: "22mm", right: "17mm", bottom: "20mm", left: "17mm" }
    });
    return pdf.length;
  } finally {
    await browser.close();
  }
}
