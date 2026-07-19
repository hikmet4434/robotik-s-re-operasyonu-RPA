import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { BrowserExecutor } from "./browserExecutor.js";
import { DesktopExecutor } from "./desktopExecutor.js";

const apiBase = (process.env.OTOFLOW_API_BASE || "http://localhost:4100").replace(/\/$/, "");
const sessionId = process.env.OTOFLOW_RECORDING_SESSION_ID || "";
const agentToken = process.env.OTOFLOW_AGENT_TOKEN || "otoflow-local-dev-agent";
const port = Number(process.env.OTOFLOW_LOCAL_AGENT_PORT || 4687);
const allowedUiOrigins = new Set((process.env.OTOFLOW_UI_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,https://otoflow-ai-rpa.hiktan.chatgpt.site").split(",").map((value) => value.trim()).filter(Boolean));
const browser = new BrowserExecutor();
const desktop = new DesktopExecutor();
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
  const executor = lease.step.type.startsWith("browser.") ? browser : lease.step.type.startsWith("desktop.") ? desktop : null;
  if (!executor) throw new Error(`${lease.step.type} için yerel yürütücü henüz tanımlı değil.`);
  return executor.execute(lease.step, lease.resolvedValue);
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const lease = await apiRequest("/api/agent/next-step", { method: "POST", body: "{}" });
    if (!lease) return;
    try {
      const summary = await executeLease(lease);
      await apiRequest(`/api/agent/jobs/${lease.jobId}/steps/${lease.stepIndex}/complete`, { method: "POST", body: JSON.stringify({ summary }) });
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
}

function stopNativeRecording() {
  if (!nativeRecorder) return false;
  nativeRecorder.kill("SIGTERM");
  nativeRecorder = undefined;
  activeRecordingSessionId = "";
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

function startServer() {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !allowedUiOrigins.has(origin)) {
      jsonResponse(res, 403, { error: "Bu arayüzün yerel ajanı kullanmasına izin verilmemiş." });
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
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
