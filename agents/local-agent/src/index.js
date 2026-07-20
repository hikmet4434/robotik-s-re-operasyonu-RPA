import http from "node:http";
import fs from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { BrowserExecutor } from "./browserExecutor.js";
import { DesktopExecutor } from "./desktopExecutor.js";
import { FileExecutor } from "./fileExecutor.js";

const apiBase = (process.env.OTOFLOW_API_BASE || "http://localhost:4100").replace(/\/$/, "");
const sessionId = process.env.OTOFLOW_RECORDING_SESSION_ID || "";
const agentToken = process.env.OTOFLOW_AGENT_TOKEN || "otoflow-local-dev-agent";
const port = Number(process.env.OTOFLOW_LOCAL_AGENT_PORT || 4687);
const reportsDirectory = path.resolve(process.env.OTOFLOW_REPORTS_DIRECTORY || path.join(os.homedir(), "Documents", "OtoFlow Raporları"));
const defaultUiOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4100", "http://127.0.0.1:4100", "https://otoflow-ai-rpa.hiktan.chatgpt.site"];
const configuredUiOrigins = (process.env.OTOFLOW_UI_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
const allowedUiOrigins = new Set([...defaultUiOrigins, ...configuredUiOrigins]);
const browser = new BrowserExecutor();
const desktop = new DesktopExecutor();
const files = new FileExecutor(async (fileItems, prompt) => {
  const response = await apiRequest("/api/agent/ai-summarize", { method: "POST", body: JSON.stringify({ files: fileItems, prompt }) });
  return response.summary;
});
let busy = false;
let nativeRecorder;
let activeRecordingSessionId = "";

async function apiRequest(route, init = {}) {
  const response = await fetch(`${apiBase}${route}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-OtoFlow-Agent-Token": agentToken, ...init.headers }
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function maskSensitive(value) {
  if (!value) return value;
  if (/pin|otp|sms|şifre|sifre|password|token|secret|banka|e[-\s]?imza/i.test(value)) return "MASKED_SECRET";
  return String(value).slice(0, 160);
}

async function sendEvent(recordingSessionId, event) {
  if (!recordingSessionId) throw new Error("Kayıt oturumu kimliği gerekli.");
  return apiRequest(`/api/recordings/${recordingSessionId}/events`, {
    method: "POST",
    body: JSON.stringify({
      type: event.type || "note",
      label: event.label || "Yerel ajan olayı",
      target: event.target || "desktop",
      value: maskSensitive(event.value),
      appArea: event.appArea || "Yerel Masaüstü",
      selectorHint: event.selectorHint || "local-agent",
      region: event.region
    })
  });
}

async function executeLease(lease) {
  const executor = lease.step.type.startsWith("browser.") ? browser : lease.step.type.startsWith("desktop.") ? desktop : lease.step.type.startsWith("files.") || lease.step.type.startsWith("activity.") || lease.step.type.startsWith("report.") ? files : null;
  if (!executor) throw new Error(`${lease.step.type} için yerel yürütücü henüz tanımlı değil.`);
  if (executor === files) return executor.execute(lease.step, lease.outputs || {});
  return { summary: await executor.execute(lease.step, lease.resolvedValue) };
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const lease = await apiRequest("/api/agent/next-step", { method: "POST", body: "{}" });
    if (!lease) return;
    try {
      const result = await executeLease(lease);
      await apiRequest(`/api/agent/jobs/${lease.jobId}/steps/${lease.stepIndex}/complete`, { method: "POST", body: JSON.stringify(result) });
    } catch (error) {
      await apiRequest(`/api/agent/jobs/${lease.jobId}/steps/${lease.stepIndex}/fail`, { method: "POST", body: JSON.stringify({ error: error instanceof Error ? error.message : "Bilinmeyen ajan hatası" }) });
    }
  } catch (error) {
    if (process.env.OTOFLOW_DEBUG === "true") console.error(error instanceof Error ? error.message : error);
  } finally {
    busy = false;
  }
}

async function heartbeat() {
  try {
    await apiRequest("/api/agent/heartbeat", { method: "POST", body: JSON.stringify({ name: `${os.hostname()} Yerel Ajan`, platform: `${process.platform}-${process.arch}` }) });
  } catch (error) {
    if (process.env.OTOFLOW_DEBUG === "true") console.error(error instanceof Error ? error.message : error);
  }
}

function startNativeRecording(recordingSessionId) {
  if (process.platform !== "darwin") throw new Error("Yerel masaüstü kaydı bu sürümde macOS için etkin.");
  if (nativeRecorder) throw new Error("Masaüstü kaydı zaten sürüyor.");
  const source = path.join(path.dirname(fileURLToPath(import.meta.url)), "macos-recorder.swift");
  activeRecordingSessionId = recordingSessionId;
  nativeRecorder = spawn("/usr/bin/swift", [source], { stdio: ["ignore", "pipe", "pipe"] });
  let pending = "";
  nativeRecorder.stdout.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) {
      try { void sendEvent(activeRecordingSessionId, JSON.parse(line)); } catch { /* malformed native event */ }
    }
  });
  nativeRecorder.stderr.on("data", (chunk) => console.error(chunk.toString().trim()));
  nativeRecorder.on("close", () => {
    nativeRecorder = undefined;
    activeRecordingSessionId = "";
  });
  spawn("/usr/bin/osascript", ["-e", "display notification \"Finder veya masaüstündeki işlemi şimdi yapabilirsiniz.\" with title \"OtoFlow kaydı başladı\""], { stdio: "ignore" });
}

function stopNativeRecording() {
  if (!nativeRecorder) return false;
  nativeRecorder.kill("SIGTERM");
  nativeRecorder = undefined;
  activeRecordingSessionId = "";
  spawn("/usr/bin/osascript", ["-e", "display notification \"Kaydedilen adımlar OtoFlow ekranına aktarıldı.\" with title \"OtoFlow kaydı tamamlandı\""], { stdio: "ignore" });
  return true;
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy(new Error("İstek çok büyük."));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

async function listPreparedReports() {
  const entries = await readdir(reportsDirectory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const reports = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase("tr-TR").endsWith(".pdf"))
    .map(async (entry) => {
      const info = await stat(path.join(reportsDirectory, entry.name));
      const detailed = /-ayrintilar\.pdf$/i.test(entry.name);
      return {
        name: entry.name,
        label: detailed ? "Ayrıntılı PDF" : "Kısa PDF",
        description: detailed ? "Dosyalarda yapılan işlemlerin sade açıklaması" : "Tek sayfalık, kolay okunur haftalık özet",
        sizeBytes: info.size,
        updatedAt: info.mtime.toISOString()
      };
    }));
  return reports.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function safeReportPath(fileName) {
  const decoded = decodeURIComponent(fileName || "");
  if (decoded !== path.basename(decoded) || !decoded.toLocaleLowerCase("tr-TR").endsWith(".pdf")) return null;
  const resolved = path.resolve(reportsDirectory, decoded);
  return path.dirname(resolved) === reportsDirectory ? resolved : null;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !allowedUiOrigins.has(origin)) {
      jsonResponse(res, 403, { error: "Bu arayüzün yerel ajanı kullanmasına izin verilmemiş." });
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.headers["access-control-request-private-network"] === "true") res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS" });
      res.end();
      return;
    }
    if (req.url === "/health") {
      jsonResponse(res, 200, { ok: true, service: "OtoFlow Local Agent", apiBase, platform: process.platform, recording: Boolean(nativeRecorder) });
      return;
    }
    try {
      if (req.url === "/event" && req.method === "POST") {
        const body = await readBody(req);
        jsonResponse(res, 201, await sendEvent(body.sessionId || sessionId, body.event || body));
        return;
      }
      if (req.url === "/record/start" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.sessionId) throw new Error("Kayıt oturumu kimliği gerekli.");
        startNativeRecording(body.sessionId);
        jsonResponse(res, 201, { ok: true, recording: true });
        return;
      }
      if (req.url === "/record/stop" && req.method === "POST") {
        jsonResponse(res, 200, { ok: true, stopped: stopNativeRecording() });
        return;
      }
      if (req.url === "/runtime/recordings" && req.method === "GET") {
        jsonResponse(res, 200, await apiRequest("/api/recordings"));
        return;
      }
      if (req.url === "/runtime/recordings" && req.method === "POST") {
        const body = await readBody(req);
        jsonResponse(res, 201, await apiRequest("/api/recordings", { method: "POST", body: JSON.stringify(body) }));
        return;
      }
      let match = req.url?.match(/^\/runtime\/recordings\/([^/]+)\/(events|analyze)$/);
      if (match && req.method === "POST") {
        const body = await readBody(req);
        jsonResponse(res, match[2] === "events" ? 201 : 200, await apiRequest(`/api/recordings/${encodeURIComponent(match[1])}/${match[2]}`, { method: "POST", body: JSON.stringify(body) }));
        return;
      }
      match = req.url?.match(/^\/runtime\/automation-drafts\/([^/]+)(\/publish)?$/);
      if (match && ((match[2] && req.method === "POST") || (!match[2] && req.method === "PATCH"))) {
        const body = await readBody(req);
        jsonResponse(res, 200, await apiRequest(`/api/automation-drafts/${encodeURIComponent(match[1])}${match[2] || ""}`, { method: req.method, body: JSON.stringify(body) }));
        return;
      }
      if (req.url === "/reports" && req.method === "GET") {
        jsonResponse(res, 200, { directoryLabel: "Belgeler → OtoFlow Raporları", reports: await listPreparedReports() });
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/reports/")) {
        const reportPath = safeReportPath(req.url.slice("/reports/".length));
        if (!reportPath) {
          jsonResponse(res, 400, { error: "Geçersiz rapor dosyası." });
          return;
        }
        const info = await stat(reportPath).catch(() => null);
        if (!info?.isFile()) {
          jsonResponse(res, 404, { error: "PDF raporu bu bilgisayarda bulunamadı." });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": info.size,
          "Content-Disposition": `inline; filename="${path.basename(reportPath).replace(/[^a-zA-Z0-9._-]/g, "-")}"`
        });
        fs.createReadStream(reportPath).pipe(res);
        return;
      }
      jsonResponse(res, 404, { error: "not_found" });
    } catch (error) {
      jsonResponse(res, 400, { error: error instanceof Error ? error.message : "İşlem başarısız." });
    }
  });

  server.listen(port, "127.0.0.1", () => console.log(`OtoFlow Yerel Ajan hazır: http://127.0.0.1:${port}`));
  void heartbeat();
  setInterval(heartbeat, 15_000).unref();
  setInterval(poll, 1_500).unref();
  process.on("SIGINT", async () => { stopNativeRecording(); await browser.close(); process.exit(0); });
  process.on("SIGTERM", async () => { stopNativeRecording(); await browser.close(); process.exit(0); });
}

if (process.argv.includes("--demo-event")) {
  await sendEvent(sessionId, { type: "note", label: "Yerel ajan demo olayı", target: "desktop.demo", value: "Masaüstü/ERP işi için demo event", appArea: "Yerel Masaüstü", selectorHint: "local-agent" });
  console.log("Demo event sent.");
} else {
  startServer();
}
