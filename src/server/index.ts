import cors from "cors";
import express from "express";
import { z } from "zod";
import type { Actor } from "../shared/types";
import { calculateTax } from "./tax";
import { createUploadedFile } from "./seed";
import { dashboardStats, getFile, listFiles, nextFileNumber, saveFile } from "./db";
import {
  cancelJob,
  analyzeRecording,
  appendRecordingEvent,
  createConnector,
  createOpportunity,
  createPolicy,
  createRecordingSession,
  createQueueItem,
  extractDocument,
  getCurrentContext,
  getDashboard,
  getWorkflows,
  listCompliance,
  listJobs,
  listQueues,
  listRecordings,
  publishAutomationDraft,
  publishWorkflow,
  resolveApproval,
  runWorkflow,
  updateDocumentField
} from "./saasStore";

const app = express();
const port = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

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

app.post("/api/workflows", (_req, res) => {
  res.status(501).json({ error: "Yeni workflow builder UI ikinci iterasyonda açılacak; hazır şablonlar bu sürümde kullanılabilir." });
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

app.post("/api/connectors", (req, res) => {
  const schema = z.object({
    type: z.enum(["email", "google_sheets", "webhook", "portal", "csv"]),
    name: z.string().min(2),
    secret: z.string().min(3)
  });
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

app.listen(port, () => {
  console.log(`OtoFlow AI API listening on http://localhost:${port}`);
});
