import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import type { Actor } from "../shared/types";
import { calculateTax } from "./tax";
import { createUploadedFile } from "./seed";
import { dashboardStats, getFile, listFiles, nextFileNumber, saveFile } from "./db";
import { generateAutomationPlan, summarizeFilesWithLlm } from "./aiAutomation";
import {
  cancelJob,
  analyzeRecording,
  appendRecordingEvent,
  attachRecordingVideo,
  completeAgentStep,
  createConnector,
  createWorkflowFromAiPlan,
  createOpportunity,
  createPolicy,
  createRecordingSession,
  createQueueItem,
  extractDocument,
  extractUploadedDocument,
  exportAutomationPackage,
  failAgentStep,
  getCurrentContext,
  getDashboard,
  getAiRuntimeSettings,
  getAiSettings,
  getWorkflows,
  heartbeatLocalAgent,
  importAutomationPackage,
  leaseNextAgentStep,
  listCompliance,
  listCredentialProfiles,
  listJobs,
  listQueues,
  listRecordings,
  publishAutomationDraft,
  publishWorkflow,
  resolveApproval,
  retryJob,
  runDueSchedules,
  runWorkflow,
  saveAiSettings,
  updateAutomationDraft,
  updateOpportunityStatus,
  updateWorkflowConfiguration,
  updateDocumentField
} from "./saasStore";

const app = express();
const port = Number(process.env.PORT ?? 4100);
const uploadDir = path.resolve(process.cwd(), "data", "uploads");
const recordingDir = path.resolve(process.cwd(), "data", "recordings");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(recordingDir, { recursive: true });

const allowedUploadTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv", "application/json"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12);
      cb(null, `${Date.now()}-${cryptoSafeName(path.basename(file.originalname, ext))}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (allowedUploadTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Desteklenmeyen dosya tipi. PDF, PNG, JPG, WEBP, TXT, CSV veya JSON yükleyin."));
  }
});

const recordingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, recordingDir),
    filename: (req, file, cb) => {
      const ext = file.mimetype === "video/mp4" ? ".mp4" : ".webm";
      cb(null, `${cryptoSafeName(String(req.params.id))}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 150 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ["video/webm", "video/mp4"].includes(file.mimetype))
});

function cryptoSafeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document";
}

const allowedOrigins = new Set((process.env.CORS_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
app.use(cors((req, callback) => {
  const origin = req.header("origin");
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0].trim();
  const requestHost = forwardedHost || req.header("host");
  let sameOrigin = false;
  if (origin && requestHost) {
    try {
      sameOrigin = new URL(origin).host === requestHost;
    } catch {
      sameOrigin = false;
    }
  }
  const permitted = !origin || process.env.NODE_ENV !== "production" || sameOrigin || allowedOrigins.has(origin);
  callback(permitted ? null : new Error("Bu arayüz kaynağına CORS izni verilmemiş."), { origin: permitted });
}));
app.use(express.json({ limit: "2mb" }));

const workflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "browser.navigate", "browser.click", "browser.type", "browser.select", "browser.wait", "browser.extract",
    "desktop.launch", "desktop.click", "desktop.type", "desktop.hotkey", "desktop.wait",
    "http.request", "document.extract", "approval.wait", "email.draft", "email.send_after_approval",
    "table.append", "condition", "webhook.emit"
    , "files.scan", "files.summarize", "activity.summarize", "report.compose", "report.save"
  ]),
  title: z.string().min(2).max(160),
  description: z.string().min(2).max(800),
  requiresApproval: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  approvalPrompt: z.string().max(500).optional(),
  credentialId: z.string().optional(),
  parameters: z.object({
    url: z.string().max(2048).optional(),
    selector: z.string().max(1000).optional(),
    value: z.string().max(10000).optional(),
    option: z.string().max(1000).optional(),
    appName: z.string().max(160).optional(),
    x: z.number().int().min(0).max(20000).optional(),
    y: z.number().int().min(0).max(20000).optional(),
    keys: z.array(z.string().max(30)).max(8).optional(),
    timeoutMs: z.number().int().min(0).max(120000).optional(),
    credentialField: z.enum(["username", "password"]).optional(),
    outputKey: z.string().max(160).optional()
    , directoryPath: z.string().max(2048).optional()
    , reportPath: z.string().max(2048).optional()
    , lookbackDays: z.number().int().min(1).max(365).optional()
    , extensions: z.array(z.string().max(20)).max(50).optional()
    , recursive: z.boolean().optional()
    , maxFiles: z.number().int().min(1).max(5000).optional()
    , prompt: z.string().max(4000).optional()
    , reportTitle: z.string().max(240).optional()
  }).optional()
});

const workflowScheduleSchema = z.object({
  enabled: z.boolean(),
  cron: z.string().min(5).max(120),
  timezone: z.string().min(3).max(80),
  label: z.string().min(2).max(160),
  nextRunAt: z.string().optional(),
  lastRunAt: z.string().optional()
});

function requireLocalAgent(req: express.Request, res: express.Response, next: express.NextFunction) {
  const configured = process.env.OTOFLOW_AGENT_TOKEN;
  if (!configured && process.env.NODE_ENV === "production") {
    res.status(503).json({ error: "OTOFLOW_AGENT_TOKEN üretim ortamında zorunludur." });
    return;
  }
  const expected = configured || "otoflow-local-dev-agent";
  const received = req.header("x-otoflow-agent-token") || "";
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    res.status(401).json({ error: "Yerel ajan anahtarı geçersiz." });
    return;
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "OtoFlow AI API" });
});

app.post("/api/auth/login", (_req, res) => {
  const context = getCurrentContext();
  res.json({
    token: "demo-local-session",
    user: context.user,
    organization: context.organization,
    membership: context.membership
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", (_req, res) => {
  res.json(getCurrentContext());
});

app.get("/api/org/current", (_req, res) => {
  const context = getCurrentContext();
  res.json({
    organization: context.organization,
    membership: context.membership,
    plan: context.plan,
    subscription: context.subscription
  });
});

app.get("/api/dashboard", (_req, res) => {
  res.json(getDashboard());
});

app.get("/api/legacy/dashboard", (_req, res) => {
  const files = listFiles();
  res.json({ files, stats: dashboardStats(files) });
});

app.get("/api/opportunities", (_req, res) => {
  res.json(getDashboard().opportunities);
});

app.post("/api/opportunities", (req, res) => {
  const schema = z.object({
    title: z.string().min(3),
    department: z.string().min(2),
    monthlyVolume: z.number().int().min(1),
    minutesPerTask: z.number().min(1),
    errorRisk: z.number().min(1).max(5),
    feasibility: z.number().min(1).max(100)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  res.status(201).json(createOpportunity(parsed.data));
});

app.patch("/api/opportunities/:id", (req, res) => {
  const schema = z.object({ status: z.enum(["fikir", "analiz", "hazir", "canli", "beklemede"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(updateOpportunityStatus(req.params.id, parsed.data.status));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Otomasyon fikri bulunamadı." });
  }
});

app.get("/api/workflows", (_req, res) => {
  res.json(getWorkflows());
});

app.get("/api/recordings", (_req, res) => {
  res.json(listRecordings());
});

app.get("/api/recorder/install", (_req, res) => {
  res.json({
    chromeExtension: {
      path: "extension/chrome-recorder",
      loadUrl: "chrome://extensions",
      status: "manual_install",
      capabilities: ["click", "input", "select", "navigation", "tab", "form", "secret_masking"]
    },
    localAgent: {
      path: "agents/local-agent",
      healthUrl: "http://localhost:4687/health",
      eventUrl: "http://localhost:4687/event",
      status: "optional_bridge",
      capabilities: ["desktop_event_bridge", "secret_masking", "future_ocr_accessibility"]
    }
  });
});

app.post("/api/recordings", (req, res) => {
  const schema = z.object({
    title: z.string().min(3),
    goal: z.string().min(8),
    appName: z.string().min(2)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  res.status(201).json(createRecordingSession(parsed.data));
});

app.post("/api/recordings/:id/events", (req, res) => {
  const schema = z.object({
    type: z.enum([
      "screen.start",
      "screen.stop",
      "app.login",
      "navigation",
      "tab.switch",
      "click",
      "input",
      "select",
      "report.open",
      "report.filter",
      "report.export",
      "email.read",
      "email.summarize",
      "email.draft",
      "email.send",
      "file.download",
      "file.upload",
      "note"
    ]),
    label: z.string().min(2),
    target: z.string().min(1),
    value: z.string().optional(),
    appArea: z.string().min(2),
    selectorHint: z.string().optional(),
    region: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(appendRecordingEvent(req.params.id, parsed.data));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Kayıt olayı eklenemedi." });
  }
});

app.post("/api/recordings/:id/video", recordingUpload.single("video"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "WEBM veya MP4 ekran kaydı gerekli." });
    return;
  }
  try {
    res.status(201).json(attachRecordingVideo(String(req.params.id), { fileName: req.file.filename, mimeType: req.file.mimetype, sizeBytes: req.file.size }));
  } catch (error) {
    fs.unlinkSync(req.file.path);
    res.status(404).json({ error: error instanceof Error ? error.message : "Ekran kaydı ilişkilendirilemedi." });
  }
});

app.get("/api/recordings/:id/video", (req, res) => {
  const session = listRecordings().find((item) => item.id === req.params.id);
  if (!session?.videoFileName) {
    res.status(404).json({ error: "Ekran kaydı bulunamadı." });
    return;
  }
  res.type(session.videoMimeType || "video/webm").sendFile(path.join(recordingDir, path.basename(session.videoFileName)));
});

app.post("/api/recordings/:id/analyze", (req, res) => {
  try {
    res.json(analyzeRecording(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Kayıt analiz edilemedi." });
  }
});

app.post("/api/automation-drafts/:id/publish", (req, res) => {
  try {
    res.status(201).json(publishAutomationDraft(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Taslak yayınlanamadı." });
  }
});

app.patch("/api/automation-drafts/:id", (req, res) => {
  const schema = z.object({
    steps: z.array(workflowStepSchema).min(1).max(250),
    credentialId: z.string().optional(),
    title: z.string().min(3).max(160).optional(),
    objective: z.string().min(8).max(1200).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(updateAutomationDraft(req.params.id, parsed.data));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Taslak güncellenemedi." });
  }
});

app.post("/api/workflows", (_req, res) => {
  res.status(501).json({ error: "Yeni workflow builder UI ikinci iterasyonda açılacak; hazır şablonlar bu sürümde kullanılabilir." });
});

app.get("/api/ai/settings", (_req, res) => {
  res.json(getAiSettings());
});

app.get("/api/ai/status", (_req, res) => {
  const settings = getAiRuntimeSettings();
  res.json({
    mode: settings.provider === "openrouter" && settings.models?.length === 3 ? "openrouter_fallback" : "local_template",
    configured: settings.provider === "template" || Boolean(settings.apiKey),
    modelCount: settings.models?.length || 1
  });
});

app.put("/api/ai/settings", (req, res) => {
  if (process.env.OPENROUTER_API_KEY) {
    res.status(403).json({ error: "LLM ayarları Coolify ortam değişkenleri tarafından yönetiliyor." });
    return;
  }
  const schema = z.object({
    provider: z.enum(["template", "openrouter", "openai", "ollama", "custom"]),
    model: z.string().min(2).max(160),
    baseUrl: z.string().max(500),
    apiKey: z.string().max(500).optional(),
    clearApiKey: z.boolean().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const fixedUrls = {
    template: "",
    openrouter: "https://openrouter.ai/api/v1",
    openai: "https://api.openai.com/v1",
    ollama: "http://127.0.0.1:11434/v1"
  } as const;
  const baseUrl = parsed.data.provider === "custom" ? parsed.data.baseUrl : fixedUrls[parsed.data.provider];
  if (parsed.data.provider === "custom") {
    try {
      const url = new URL(baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      res.status(400).json({ error: "Özel sağlayıcı için geçerli bir HTTP/HTTPS API adresi girin." });
      return;
    }
  }
  res.json(saveAiSettings({ ...parsed.data, baseUrl }));
});

app.post("/api/ai/automation-plan", async (req, res) => {
  const schema = z.object({
    prompt: z.string().min(12).max(8000),
    directoryPath: z.string().max(2048).optional(),
    reportPath: z.string().max(2048).optional(),
    cron: z.string().min(5).max(120).optional(),
    timezone: z.string().min(3).max(80).optional(),
    scheduleLabel: z.string().max(160).optional(),
    approvalAtEnd: z.boolean().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await generateAutomationPlan(parsed.data, getAiRuntimeSettings()));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "AI otomasyon planı üretilemedi." });
  }
});

app.post("/api/ai/workflows", (req, res) => {
  const schema = z.object({
    name: z.string().min(3).max(160),
    description: z.string().min(8).max(1200),
    category: z.enum(["finans", "operasyon", "gümrük", "satış", "genel"]),
    trigger: z.string().min(2).max(300),
    source: z.enum(["ai", "template"]),
    schedule: workflowScheduleSchema,
    steps: z.array(workflowStepSchema).min(1).max(250),
    assumptions: z.array(z.string().max(300)).max(20),
    providerLabel: z.string().max(200)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(createWorkflowFromAiPlan(parsed.data));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "AI workflow kaydedilemedi." });
  }
});

app.get("/api/workflows/:id/export", (req, res) => {
  try {
    const pkg = exportAutomationPackage(req.params.id);
    const fileName = `${cryptoSafeName(pkg.metadata.name)}.otomasyon`;
    res.setHeader("Content-Type", "application/vnd.otoflow.automation+json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(pkg, null, 2));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Otomasyon dışa aktarılamadı." });
  }
});

app.post("/api/workflows/import", (req, res) => {
  const packageSchema = z.object({
    format: z.literal("otoflow.automation"),
    version: z.literal(1),
    exportedAt: z.string(),
    metadata: z.object({
      name: z.string().min(3).max(160),
      description: z.string().min(3).max(1200),
      category: z.enum(["finans", "operasyon", "gümrük", "satış", "genel"]),
      trigger: z.string().min(2).max(300),
      source: z.enum(["template", "recorder", "ai", "import"]).optional(),
      schedule: workflowScheduleSchema.optional()
    }),
    steps: z.array(workflowStepSchema).min(1).max(250),
    variables: z.array(z.object({ key: z.string(), label: z.string(), example: z.string(), source: z.string() })).max(100),
    requiredCredential: z.object({ alias: z.literal("primary"), label: z.string(), loginUrl: z.string().optional() }).optional()
  });
  const parsed = packageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veya desteklenmeyen .otomasyon dosyası.", details: parsed.error.flatten() });
    return;
  }
  res.status(201).json(importAutomationPackage(parsed.data));
});

app.patch("/api/workflows/:id", (req, res) => {
  const schema = z.object({ steps: z.array(workflowStepSchema).min(1).max(250).optional(), credentialId: z.string().optional(), publish: z.boolean().optional(), schedule: workflowScheduleSchema.optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(updateWorkflowConfiguration(req.params.id, parsed.data));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Workflow ayarlanamadı." });
  }
});

app.post("/api/workflows/:id/publish", (req, res) => {
  try {
    res.json(publishWorkflow(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Workflow bulunamadı." });
  }
});

app.post("/api/workflows/:id/run", (req, res) => {
  const schema = z.object({ payloadSummary: z.string().min(3).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(runWorkflow(req.params.id, parsed.data.payloadSummary));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Workflow çalıştırılamadı." });
  }
});

app.get("/api/jobs", (_req, res) => {
  res.json(listJobs());
});

app.get("/api/jobs/:id", (req, res) => {
  const job = listJobs().find((item) => item.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job bulunamadı." });
    return;
  }
  res.json(job);
});

app.post("/api/jobs/:id/cancel", (req, res) => {
  try {
    res.json(cancelJob(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Job iptal edilemedi." });
  }
});

app.post("/api/jobs/:id/retry", (req, res) => {
  try {
    res.status(201).json(retryJob(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Job yeniden çalıştırılamadı." });
  }
});

app.post("/api/agent/heartbeat", requireLocalAgent, (req, res) => {
  const schema = z.object({ name: z.string().min(2).max(120).optional(), platform: z.string().max(120).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  res.json(heartbeatLocalAgent(parsed.data));
});

app.post("/api/agent/next-step", requireLocalAgent, (_req, res) => {
  try {
    const lease = leaseNextAgentStep();
    if (!lease) {
      res.status(204).end();
      return;
    }
    res.json(lease);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ajan adımı alınamadı." });
  }
});

app.post("/api/agent/jobs/:id/steps/:stepIndex/complete", requireLocalAgent, (req, res) => {
  const schema = z.object({ summary: z.string().max(500).optional(), output: z.unknown().optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(completeAgentStep({ jobId: String(req.params.id), stepIndex: Number(req.params.stepIndex), summary: parsed.data.summary, output: parsed.data.output }));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Adım tamamlanamadı." });
  }
});

app.post("/api/agent/ai-summarize", requireLocalAgent, async (req, res) => {
  const fileSchema = z.object({
    name: z.string().max(260),
    relativePath: z.string().max(2048),
    size: z.number().nonnegative(),
    modifiedAt: z.string().max(80),
    excerpt: z.string().max(3000).optional()
  });
  const schema = z.object({ files: z.array(fileSchema).max(100), prompt: z.string().max(4000).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json({ summary: await summarizeFilesWithLlm(parsed.data.files, parsed.data.prompt, getAiRuntimeSettings()) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Dosyalar özetlenemedi." });
  }
});

app.post("/api/agent/jobs/:id/steps/:stepIndex/fail", requireLocalAgent, (req, res) => {
  const schema = z.object({ error: z.string().min(1).max(1000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(failAgentStep({ jobId: String(req.params.id), stepIndex: Number(req.params.stepIndex), error: parsed.data.error }));
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : "Adım hatası işlenemedi." });
  }
});

app.get("/api/queues", (_req, res) => {
  res.json(listQueues());
});

app.post("/api/queues", (_req, res) => {
  res.status(501).json({ error: "Kuyruk oluşturma bu MVP'de seed kuyruk üzerinden sınırlandı." });
});

app.post("/api/queues/:id/items", (req, res) => {
  const schema = z.object({
    workflowId: z.string(),
    payloadSummary: z.string().min(3)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(createQueueItem(req.params.id, parsed.data.workflowId, parsed.data.payloadSummary));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Kuyruk kalemi eklenemedi." });
  }
});

app.get("/api/approvals", (_req, res) => {
  res.json(getDashboard().approvals);
});

app.post("/api/approvals", (_req, res) => {
  res.status(501).json({ error: "Onay görevleri robot ve doküman akışlarından otomatik oluşur." });
});

app.post("/api/approvals/:id/approve", (req, res) => {
  try {
    res.json(resolveApproval(req.params.id, true));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Onay bulunamadı." });
  }
});

app.post("/api/approvals/:id/reject", (req, res) => {
  try {
    res.json(resolveApproval(req.params.id, false));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Onay bulunamadı." });
  }
});

app.post("/api/documents/extract", (req, res) => {
  const schema = z.object({
    name: z.string().min(3),
    type: z.enum(["invoice", "order", "customs", "reconciliation", "other"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(extractDocument(parsed.data));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Doküman işlenemedi." });
  }
});

app.post("/api/documents/upload", upload.single("file"), (req, res) => {
  const schema = z.object({
    type: z.enum(["invoice", "order", "customs", "reconciliation", "other"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    if (req.file) fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Dosya yüklenemedi." });
    return;
  }
  const uploadedFile = req.file;

  try {
    res.status(201).json(
      extractUploadedDocument({
        originalName: uploadedFile.originalname,
        storedFileName: uploadedFile.filename,
        path: uploadedFile.path,
        mimeType: uploadedFile.mimetype,
        sizeBytes: uploadedFile.size,
        type: parsed.data.type
      })
    );
  } catch (error) {
    fs.unlink(uploadedFile.path, () => undefined);
    res.status(400).json({ error: error instanceof Error ? error.message : "Doküman işlenemedi." });
  }
});

app.patch("/api/documents/:id/fields", (req, res) => {
  const schema = z.object({
    fieldId: z.string(),
    value: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.json(updateDocumentField(req.params.id, parsed.data.fieldId, parsed.data.value));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : "Doküman alanı güncellenemedi." });
  }
});

app.get("/api/connectors", (_req, res) => {
  res.json(getDashboard().connectors);
});

app.get("/api/credentials", (_req, res) => {
  res.json(listCredentialProfiles());
});

app.post("/api/connectors", (req, res) => {
  const schema = z.object({
    type: z.enum(["email", "google_sheets", "webhook", "portal", "csv"]),
    name: z.string().min(2).max(120),
    secret: z.string().min(3).max(10000).optional(),
    username: z.string().max(320).optional(),
    password: z.string().max(10000).optional(),
    loginUrl: z.union([z.string().url(), z.literal("")]).optional()
  }).refine((value) => Boolean(value.secret || value.username || value.password), { message: "Kullanıcı adı/şifre veya secret gerekli." });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(createConnector(parsed.data));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Bağlayıcı eklenemedi." });
  }
});

app.get("/api/compliance/audit", (_req, res) => {
  res.json(listCompliance().audit);
});

app.get("/api/compliance/policies", (_req, res) => {
  res.json(listCompliance());
});

app.post("/api/compliance/policies", (req, res) => {
  const schema = z.object({
    name: z.string().min(3),
    description: z.string().min(8),
    policyType: z.enum(["approval_gate", "retention", "secret_block", "audit"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  res.status(201).json(createPolicy(parsed.data));
});

app.get("/api/files", (_req, res) => {
  res.json(listFiles());
});

app.post("/api/files", (_req, res) => {
  const file = createUploadedFile(nextFileNumber());
  saveFile(file);
  res.status(201).json(file);
});

app.get("/api/files/:id", (req, res) => {
  const file = getFile(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Dosya bulunamadı." });
    return;
  }
  res.json(file);
});

app.patch("/api/files/:id/field", (req, res) => {
  const schema = z.object({
    documentType: z.enum(["fatura", "ceki_listesi", "konsimento"]),
    key: z.string(),
    value: z.string(),
    confidence: z.number().min(0).max(100).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const file = getFile(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Dosya bulunamadı." });
    return;
  }

  const document = file.documents.find((item) => item.type === parsed.data.documentType);
  const field = document?.fields.find((item) => item.key === parsed.data.key);
  if (!field) {
    res.status(404).json({ error: "Alan bulunamadı." });
    return;
  }

  field.value = parsed.data.value;
  field.confidence = parsed.data.confidence ?? Math.max(field.confidence, 96);
  file.auditLog.unshift({
    ts: new Date().toISOString(),
    actor: "user",
    action: `${field.label} alanı doğrulandı/güncellendi.`
  });
  res.json(saveFile(file));
});

app.post("/api/files/:id/select-gtip", (req, res) => {
  const schema = z.object({ lineItemId: z.string(), code: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const file = getFile(req.params.id);
  const item = file?.lineItems.find((line) => line.id === parsed.data.lineItemId);
  if (!file || !item) {
    res.status(404).json({ error: "Kalem bulunamadı." });
    return;
  }

  item.selectedGtip = parsed.data.code;
  file.auditLog.unshift({
    ts: new Date().toISOString(),
    actor: "user",
    action: `${item.description} için ${parsed.data.code} GTİP kodu seçildi.`
  });
  res.json(saveFile(file));
});

app.post("/api/files/:id/approve-validation", (req, res) => {
  const file = getFile(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Dosya bulunamadı." });
    return;
  }

  file.status = "islemde";
  file.taxResult = calculateTax(file);
  file.auditLog.unshift({
    ts: new Date().toISOString(),
    actor: "user",
    action: "Belge alanları ve GTİP seçimi onaylandı; vergi hesabı üretildi."
  });
  res.json(saveFile(file));
});

app.post("/api/files/:id/tax", (req, res) => {
  const file = getFile(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Dosya bulunamadı." });
    return;
  }

  file.taxResult = calculateTax(file);
  file.auditLog.unshift({
    ts: new Date().toISOString(),
    actor: "ai",
    action: "Temsili vergi ve harç hesabı güncellendi."
  });
  res.json(saveFile(file));
});

app.post("/api/files/:id/log", (req, res) => {
  const schema = z.object({
    actor: z.enum(["bot", "user", "ai"]),
    action: z.string().min(3)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const file = getFile(req.params.id);
  if (!file) {
    res.status(404).json({ error: "Dosya bulunamadı." });
    return;
  }

  file.auditLog.unshift({ ts: new Date().toISOString(), actor: parsed.data.actor as Actor, action: parsed.data.action });
  res.json(saveFile(file));
});

app.post("/api/files/:id/submit", (_req, res) => {
  const file = getFile(_req.params.id);
  if (!file) {
    res.status(404).json({ error: "Dosya bulunamadı." });
    return;
  }

  const ts = new Date().toISOString();
  file.status = "tamamlandi";
  file.communicationHistory.unshift({
    ts,
    channel: "email",
    message: `${file.customer} için ${file.id} numaralı beyanname insan onayıyla tamamlandı. Vergi/harç özeti ve işlem logu müşteri portalında hazır.`
  });
  file.auditLog.unshift({ ts, actor: "user", action: "İnsan onayı verildi ve dosya portala gönderilmiş olarak işaretlendi." });
  file.auditLog.unshift({ ts, actor: "bot", action: "Müşteri bilgilendirme metni üretildi ve iletişim geçmişine kaydedildi." });
  res.json(saveFile(file));
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof multer.MulterError) {
    const limitMessage = error.field === "video" ? "Ekran kaydı 150MB sınırını aşamaz." : "Dosya boyutu 10MB sınırını aşamaz.";
    res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? limitMessage : error.message });
    return;
  }
  if (error instanceof Error) {
    res.status(400).json({ error: error.message });
    return;
  }
  next(error);
});

const distDir = path.resolve(process.cwd(), "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`OtoFlow AI API listening on http://localhost:${port}`);
});

setTimeout(() => runDueSchedules(), 2_000).unref();
setInterval(() => runDueSchedules(), 30_000).unref();
