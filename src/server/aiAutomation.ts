import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AiAutomationPlan, AiSettings, WorkflowStep, WorkflowStepType } from "../shared/saasTypes";

export interface AiPlanRequest {
  prompt: string;
  directoryPath?: string;
  reportPath?: string;
  cron?: string;
  timezone?: string;
  scheduleLabel?: string;
  approvalAtEnd?: boolean;
}

export interface AiRuntimeSettings extends AiSettings {
  apiKey?: string;
  models?: string[];
  modelChain?: AiModelEndpoint[];
}

export interface AiModelEndpoint {
  provider: "zai" | "openrouter" | "openai" | "ollama" | "custom";
  model: string;
  baseUrl: string;
  apiKey: string;
  label: string;
}

export interface GlmOcrResult {
  text: string;
  model: string;
  providerLabel: string;
}

const allowedStepTypes = [
  "browser.navigate", "browser.click", "browser.type", "browser.select", "browser.wait", "browser.extract",
  "desktop.launch", "desktop.click", "desktop.type", "desktop.hotkey", "desktop.wait",
  "http.request", "document.extract", "approval.wait", "email.draft", "email.send_after_approval",
  "table.append", "condition", "webhook.emit", "files.scan", "files.summarize", "activity.summarize",
  "report.compose", "report.save"
] as const satisfies readonly WorkflowStepType[];

const generatedPlanSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().min(8).max(700),
  category: z.enum(["finans", "operasyon", "gümrük", "satış", "genel"]),
  trigger: z.string().min(3).max(200),
  assumptions: z.array(z.string().min(2).max(240)).max(8),
  steps: z.array(z.object({
    type: z.enum(allowedStepTypes),
    title: z.string().min(2).max(140),
    description: z.string().min(2).max(600),
    requiresApproval: z.boolean(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    approvalPrompt: z.string().max(400).nullable(),
    parameterJson: z.string().max(6000)
  })).min(1).max(30)
});

type JsonRecord = Record<string, unknown>;
type GeneratedPlan = z.infer<typeof generatedPlanSchema>;

const allowedStepTypeSet = new Set<string>(allowedStepTypes);
const planWrapperKeys = ["plan", "workflow", "automation", "result", "data", "output", "response"];

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(withoutFence.slice(start, end + 1));
      } catch {
        return value;
      }
    }
    return value;
  }
}

function unwrapPlan(value: unknown): JsonRecord {
  let current = parseJsonValue(value);
  for (let depth = 0; depth < 5; depth += 1) {
    const record = asRecord(current);
    if (!record) break;
    const hasSteps = ["steps", "actions", "workflowSteps", "workflow_steps"].some((key) => Array.isArray(record[key]));
    if (hasSteps) return record;
    const wrapper = planWrapperKeys.find((key) => record[key] !== undefined);
    if (!wrapper) return record;
    const nested = parseJsonValue(record[wrapper]);
    const nestedRecord = asRecord(nested);
    if (!nestedRecord) return record;
    current = { ...record, ...nestedRecord };
  }
  return asRecord(current) || {};
}

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function boundedText(value: string | undefined, fallback: string, min: number, max: number) {
  const selected = (value || fallback).replace(/\s+/g, " ").trim();
  const validFallback = fallback.replace(/\s+/g, " ").trim();
  const result = selected.length >= min ? selected : validFallback;
  return result.slice(0, max);
}

function searchable(value: string) {
  return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeCategory(value: unknown, context: string): GeneratedPlan["category"] {
  const candidate = typeof value === "string" ? searchable(value) : "";
  if (["finans", "finance", "financial", "muhasebe"].includes(candidate)) return "finans";
  if (["operasyon", "operation", "operations"].includes(candidate)) return "operasyon";
  if (["gumruk", "customs", "lojistik"].includes(candidate)) return "gümrük";
  if (["satis", "sales", "crm"].includes(candidate)) return "satış";
  if (["genel", "general"].includes(candidate)) return "genel";

  const text = searchable(context);
  if (/(finans|muhasebe|fatura|odeme|banka)/.test(text)) return "finans";
  if (/(gumruk|ithalat|ihracat|lojistik)/.test(text)) return "gümrük";
  if (/(satis|musteri|teklif|crm)/.test(text)) return "satış";
  if (/(operasyon|dosya|rapor|surec|is akisi)/.test(text)) return "operasyon";
  return "genel";
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (["true", "yes", "evet", "1"].includes(searchable(value))) return true;
    if (["false", "no", "hayir", "0"].includes(searchable(value))) return false;
  }
  return fallback;
}

function normalizeRisk(value: unknown, type: WorkflowStepType): GeneratedPlan["steps"][number]["riskLevel"] {
  const candidate = typeof value === "string" ? searchable(value) : "";
  if (["low", "dusuk"].includes(candidate)) return "low";
  if (["medium", "orta"].includes(candidate)) return "medium";
  if (["high", "yuksek"].includes(candidate)) return "high";
  if (["critical", "kritik"].includes(candidate)) return "critical";
  return ["email.send_after_approval", "webhook.emit", "http.request"].includes(type) ? "medium" : "low";
}

function inferStepType(text: string): WorkflowStepType | undefined {
  const value = searchable(text);
  if (/(dosya|klasor).*(tara|listele|bul)/.test(value)) return "files.scan";
  if (/(dosya|belge).*(ozet)/.test(value)) return "files.summarize";
  if (/(aktivite|calisma|hafta).*(ozet|grupla)/.test(value)) return "activity.summarize";
  if (/(rapor).*(hazirla|olustur|birles)/.test(value)) return "report.compose";
  if (/(rapor).*(kaydet|yaz)/.test(value)) return "report.save";
  if (/(e-?posta|email).*(taslak|hazirla)/.test(value)) return "email.draft";
  if (/(e-?posta|email).*(gonder)/.test(value)) return "email.send_after_approval";
  if (/(onay|approval)/.test(value)) return "approval.wait";
  if (/(webhook)/.test(value)) return "webhook.emit";
  if (/(api|http)/.test(value)) return "http.request";
  if (/(dokuman|belge).*(cikar|oku|ayristir)/.test(value)) return "document.extract";
  if (/(tablo|excel).*(ekle|yaz)/.test(value)) return "table.append";
  if (/(uygulama).*(ac|baslat)/.test(value)) return "desktop.launch";
  if (/(sec|select).*(alan|menu|option)/.test(value)) return "browser.select";
  if (/(tikla|click)/.test(value)) return "browser.click";
  if (/(yaz|gir|type).*(alan|form|input)/.test(value)) return "browser.type";
  if (/(bekle|wait)/.test(value)) return "browser.wait";
  if (/(oku|cikar|extract)/.test(value)) return "browser.extract";
  if (/(url|sayfa|site|tarayici).*(ac|git|navigate)/.test(value)) return "browser.navigate";
  return undefined;
}

function normalizeStepType(value: unknown, context: string): WorkflowStepType | undefined {
  const raw = typeof value === "string" ? value.trim() : "";
  if (allowedStepTypeSet.has(raw)) return raw as WorkflowStepType;
  const candidate = searchable(raw).replace(/[\s_-]+/g, ".");
  const aliases: Record<string, WorkflowStepType> = {
    "navigate": "browser.navigate", "browser.open": "browser.navigate", "click": "browser.click",
    "type": "browser.type", "input": "browser.type", "select": "browser.select", "wait": "browser.wait",
    "extract": "browser.extract", "launch": "desktop.launch", "request": "http.request",
    "approval": "approval.wait", "email.draft": "email.draft", "email.send": "email.send_after_approval",
    "append": "table.append", "webhook": "webhook.emit", "files.scan": "files.scan",
    "files.summarize": "files.summarize", "activity.summarize": "activity.summarize",
    "report.compose": "report.compose", "report.save": "report.save"
  };
  return aliases[candidate] || inferStepType(`${raw} ${context}`);
}

function normalizeParameterJson(value: unknown) {
  const parsed = parseJsonValue(value);
  const record = asRecord(parsed);
  return JSON.stringify(record || {});
}

function normalizeAssumptions(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|;/) : [];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 240))
    .filter((item) => item.length >= 2)
    .slice(0, 8);
}

export function normalizeGeneratedPlan(raw: unknown, input: AiPlanRequest): GeneratedPlan {
  const record = unwrapPlan(raw);
  const promptName = input.prompt.replace(/\s+/g, " ").trim().split(/[.!?]/)[0];
  const name = boundedText(
    firstString(record, ["name", "title", "workflowName", "workflow_name", "automationName", "automation_name"]),
    promptName.length >= 3 ? promptName : "Yeni otomasyon",
    3,
    120
  );
  const description = boundedText(
    firstString(record, ["description", "summary", "objective", "goal", "purpose"]),
    input.prompt.length >= 8 ? input.prompt : "Kullanıcı talebine göre hazırlanan otomasyon.",
    8,
    700
  );
  const schedule = asRecord(record.schedule);
  const trigger = boundedText(
    firstString(record, ["trigger", "scheduleLabel", "schedule_label"]) || (schedule && firstString(schedule, ["label", "description", "name"])),
    input.scheduleLabel || "Manuel başlat",
    3,
    200
  );
  const rawSteps = [record.steps, record.actions, record.workflowSteps, record.workflow_steps].find(Array.isArray) as unknown[] | undefined;
  const steps = (rawSteps || []).flatMap((value, index) => {
    const step = asRecord(value);
    if (!step) return [];
    const rawTitle = firstString(step, ["title", "name", "label"]);
    const rawDescription = firstString(step, ["description", "details", "instruction", "prompt"]);
    const type = normalizeStepType(
      step.type ?? step.actionType ?? step.action_type ?? step.action,
      `${rawTitle || ""} ${rawDescription || ""}`
    );
    if (!type) return [];
    const title = boundedText(rawTitle, `${index + 1}. adım`, 2, 140);
    const stepDescription = boundedText(rawDescription, title, 2, 600);
    const riskLevel = normalizeRisk(step.riskLevel ?? step.risk_level ?? step.risk, type);
    const externalAction = ["email.send_after_approval", "webhook.emit"].includes(type) || riskLevel === "critical";
    const requiresApproval = normalizeBoolean(
      step.requiresApproval ?? step.requires_approval ?? step.approvalRequired ?? step.approval_required,
      externalAction
    ) || externalAction;
    const approvalPrompt = firstString(step, ["approvalPrompt", "approval_prompt", "approvalMessage", "approval_message"])
      || (requiresApproval ? `${title} adımı çalıştırılsın mı?` : null);
    return [{
      type,
      title,
      description: stepDescription,
      requiresApproval,
      riskLevel,
      approvalPrompt,
      parameterJson: normalizeParameterJson(step.parameterJson ?? step.parameter_json ?? step.parameters ?? step.params)
    }];
  });

  return generatedPlanSchema.parse({
    name,
    description,
    category: normalizeCategory(record.category ?? record.department ?? record.domain, `${name} ${description} ${input.prompt}`),
    trigger,
    assumptions: normalizeAssumptions(record.assumptions ?? record.notes ?? record.requirements),
    steps
  });
}

const allowedParameterKeys = new Set([
  "url", "selector", "value", "option", "appName", "x", "y", "keys", "timeoutMs", "credentialField",
  "outputKey", "directoryPath", "reportPath", "lookbackDays", "extensions", "recursive", "maxFiles", "prompt", "reportTitle"
]);

function stepId() {
  return `step_${crypto.randomUUID().slice(0, 8)}`;
}

function safeParameters(raw: string): WorkflowStep["parameters"] {
  try {
    const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([key]) => allowedParameterKeys.has(key))) as WorkflowStep["parameters"];
  } catch {
    return {};
  }
}

export function resolveModelEndpoints(settings: AiRuntimeSettings): AiModelEndpoint[] {
  if (settings.modelChain?.length) {
    return settings.modelChain.filter((item) => item.model.trim() && item.baseUrl.trim() && item.apiKey.trim());
  }
  if (settings.provider === "template") return [];
  if (settings.provider !== "ollama" && !settings.apiKey) return [];
  const provider = settings.provider === "openrouter" || settings.provider === "openai" || settings.provider === "ollama"
    ? settings.provider
    : "custom";
  const label = provider === "openrouter" ? "OpenRouter" : provider === "openai" ? "OpenAI" : provider === "ollama" ? "Ollama" : "Özel LLM";
  return (settings.models || [settings.model]).map((model) => ({
    provider,
    model,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey || "ollama-local",
    label: `${label} · ${model}`
  }));
}

export async function extractDocumentTextWithGlmOcr(
  input: { path: string; mimeType: string; sizeBytes: number },
  settings: { apiKey?: string; baseUrl?: string; model?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<GlmOcrResult | undefined> {
  const apiKey = settings.apiKey?.trim() || process.env.ZAI_API_KEY?.trim();
  if (!apiKey) return undefined;
  if (!new Set(["application/pdf", "image/png", "image/jpeg"]).has(input.mimeType)) return undefined;
  if (input.sizeBytes > 10 * 1024 * 1024) throw new Error("GLM-OCR için dosya boyutu 10 MB sınırını aşıyor.");

  const baseUrl = (settings.baseUrl || process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4").replace(/\/$/, "");
  const model = settings.model || process.env.ZAI_OCR_MODEL || "glm-ocr";
  const content = await fs.readFile(input.path);
  const response = await fetchImpl(`${baseUrl}/layout_parsing`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      file: `data:${input.mimeType};base64,${content.toString("base64")}`,
      return_crop_images: false,
      need_layout_visualization: false
    }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok) throw new Error(`GLM-OCR isteği başarısız oldu (HTTP ${response.status}).`);
  const parsed = z.object({ md_results: z.string().min(1).max(2_000_000) }).safeParse(await response.json());
  if (!parsed.success) throw new Error("GLM-OCR geçerli bir doküman metni döndürmedi.");
  return { text: parsed.data.md_results, model, providerLabel: `Z.AI · ${model}` };
}

function weeklyFilePlan(input: AiPlanRequest): AiAutomationPlan {
  const directoryPath = input.directoryPath || path.join(os.homedir(), "Documents");
  const reportPath = input.reportPath || path.join(os.homedir(), "Documents", "OtoFlow Raporları", "haftalik-dosya-raporu.md");
  const steps: WorkflowStep[] = [
    {
      id: stepId(), type: "files.scan", title: "Yeni ve değişen dosyaları tara",
      description: "İzin verilen klasörde son yedi günde eklenen veya değiştirilen dosyaları güvenli sınırlar içinde listeler.",
      requiresApproval: false, riskLevel: "low",
      parameters: { directoryPath, lookbackDays: 7, recursive: true, maxFiles: 500, outputKey: "weeklyFiles" }
    },
    {
      id: stepId(), type: "files.summarize", title: "Dosya içeriklerini özetle",
      description: "Metin tabanlı yeni dosyaların sınırlı içeriğini LLM ile, diğer dosyaları metadata ile özetler.",
      requiresApproval: false, riskLevel: "medium",
      parameters: { outputKey: "fileSummaries", prompt: "Her dosyanın amacını, önemli değişikliklerini ve takip gerektiren noktaları kısa Türkçe maddelerle özetle." }
    },
    {
      id: stepId(), type: "activity.summarize", title: "Haftalık çalışmayı günlere ayır",
      description: "Dosya hareketlerini gün, klasör ve dosya türüne göre gruplar.",
      requiresApproval: false, riskLevel: "low", parameters: { outputKey: "weeklyActivity" }
    },
    {
      id: stepId(), type: "report.compose", title: "Haftalık raporu hazırla",
      description: "Dosya özetleri ve çalışma dağılımını tek bir okunabilir Markdown raporunda birleştirir.",
      requiresApproval: false, riskLevel: "low",
      parameters: { outputKey: "weeklyReport", reportTitle: "Haftalık Dosya ve Çalışma Özeti" }
    },
    {
      id: stepId(), type: "report.save", title: "Raporu bilgisayara kaydet",
      description: "Hazırlanan raporu izin verilen hedef klasöre kaydeder.",
      requiresApproval: Boolean(input.approvalAtEnd), riskLevel: input.approvalAtEnd ? "medium" : "low",
      approvalPrompt: input.approvalAtEnd ? "Haftalık rapor bilgisayara kaydedilsin mi?" : undefined,
      parameters: { reportPath, outputKey: "savedReport" }
    }
  ];

  return {
    name: "Haftalık dosya ve çalışma özeti",
    description: "Son yedi gündeki yeni ve değişen dosyaları inceler, içerik ve aktivite özeti çıkarır, her pazartesi okunabilir bir rapor hazırlar.",
    category: "operasyon",
    trigger: input.scheduleLabel || "Her pazartesi 09:00",
    source: "template",
    schedule: {
      enabled: true,
      cron: input.cron || "0 9 * * 1",
      timezone: input.timezone || "Europe/Istanbul",
      label: input.scheduleLabel || "Her pazartesi 09:00"
    },
    steps,
    assumptions: [
      `Taranacak klasör: ${directoryPath}`,
      `Rapor hedefi: ${reportPath}`,
      "Metin dışı dosyalarda içerik yerine dosya adı, boyut ve değişiklik zamanı raporlanır."
    ],
    providerLabel: "Yerel güvenli planlayıcı"
  };
}

function applyRuntimeOverrides(plan: AiAutomationPlan, input: AiPlanRequest) {
  const defaultDirectory = input.directoryPath || path.join(os.homedir(), "Documents");
  const defaultReport = input.reportPath || path.join(os.homedir(), "Documents", "OtoFlow Raporları", "otomasyon-raporu.md");
  plan.schedule = {
    enabled: Boolean(input.cron),
    cron: input.cron || "0 9 * * 1",
    timezone: input.timezone || "Europe/Istanbul",
    label: input.scheduleLabel || plan.trigger
  };
  plan.trigger = plan.schedule.enabled ? plan.schedule.label : "Manuel başlat";
  plan.steps = plan.steps.map((step) => {
    const parameters = { ...step.parameters };
    if (step.type === "files.scan") parameters.directoryPath = defaultDirectory;
    if (step.type === "report.save") parameters.reportPath = defaultReport;
    const externalAction = ["email.send_after_approval", "webhook.emit"].includes(step.type) || step.riskLevel === "critical";
    return {
      ...step,
      requiresApproval: externalAction || step.requiresApproval || (Boolean(input.approvalAtEnd) && step.type === "report.save"),
      approvalPrompt: externalAction ? step.approvalPrompt || `${step.title} adımı çalıştırılsın mı?` : step.approvalPrompt,
      parameters
    };
  });
  return plan;
}

export async function generateAutomationPlan(input: AiPlanRequest, settings: AiRuntimeSettings): Promise<AiAutomationPlan> {
  if (settings.provider === "template") return weeklyFilePlan(input);
  const endpoints = resolveModelEndpoints(settings);
  if (endpoints.length === 0) throw new Error("Otomasyon planlayıcısı için geçerli bir LLM bağlantısı bulunamadı.");
  const generated = await runWithModelEndpointFallback(endpoints, async (endpoint) => {
    const provider = createOpenAICompatible({
      name: `otoflow-${endpoint.provider}`,
      baseURL: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      supportsStructuredOutputs: endpoint.provider !== "ollama"
    });
    const result = await generateText({
      model: provider(endpoint.model),
      output: Output.json(),
      system: [
        "Sen OtoFlow için güvenli bir RPA workflow mimarısın.",
        "Tek bir JSON nesnesi döndür. Üst alanlar tam olarak name, description, category, trigger, assumptions ve steps olmalı.",
        "Her steps öğesinde type, title, description, requiresApproval, riskLevel, approvalPrompt ve parameterJson alanlarını yaz.",
        "Yalnızca verilen izinli adım türlerini kullan. Uydurma şifre, kullanıcı adı veya gizli bilgi üretme.",
        "Bilinmeyen selector, koordinat, URL ve dosya yolu için boş değer veya açık varsayım kullan.",
        "Para, silme, resmi beyan, müşteri iletişimi ve dış sisteme gönderim adımlarında requiresApproval=true kullan.",
        "parameterJson alanına yalnızca geçerli JSON nesnesi yaz. Dosya raporu için files.scan, files.summarize, activity.summarize, report.compose ve report.save adımlarını sırala.",
        "Başlıkları ve açıklamaları Türkçe yaz. Ekran kaydı gerektirmeyen çalıştırılabilir bir taslak üret."
      ].join("\n"),
      prompt: `Kullanıcı talebi:\n${input.prompt}\n\nTakvim: ${input.scheduleLabel || "Manuel"}\nKlasör: ${input.directoryPath || "Kullanıcı seçecek"}\nRapor hedefi: ${input.reportPath || "Kullanıcı seçecek"}`
    });
    return normalizeGeneratedPlan(result.output, input);
  });
  const output = generated.value;

  const plan: AiAutomationPlan = {
    name: output.name,
    description: output.description,
    category: output.category,
    trigger: output.trigger,
    source: "ai",
    schedule: { enabled: false, cron: input.cron || "0 9 * * 1", timezone: input.timezone || "Europe/Istanbul", label: input.scheduleLabel || "Manuel" },
    assumptions: output.assumptions,
    providerLabel: generated.endpoint.label,
    steps: output.steps.map((step) => ({
      id: stepId(),
      type: step.type,
      title: step.title,
      description: step.description,
      requiresApproval: step.requiresApproval,
      riskLevel: step.riskLevel,
      approvalPrompt: step.approvalPrompt || undefined,
      parameters: safeParameters(step.parameterJson)
    }))
  };
  return applyRuntimeOverrides(plan, input);
}

export function buildHeuristicSummary(files: Array<{ name: string; relativePath: string; size: number; modifiedAt: string; excerpt?: string }>) {
  if (files.length === 0) return "Bu dönemde yeni veya değişen dosya bulunmadı.";
  return files.map((file) => {
    const excerpt = file.excerpt?.replace(/\s+/g, " ").trim().slice(0, 240);
    return `- **${file.name}** (${file.relativePath}): ${excerpt || `${file.size} bayt, son değişiklik ${file.modifiedAt}`}`;
  }).join("\n");
}

export async function summarizeFilesWithLlm(
  files: Array<{ name: string; relativePath: string; size: number; modifiedAt: string; excerpt?: string }>,
  prompt: string | undefined,
  settings: AiRuntimeSettings
) {
  if (files.length === 0 || settings.provider === "template") return buildHeuristicSummary(files);
  const endpoints = resolveModelEndpoints(settings);
  if (endpoints.length === 0) return buildHeuristicSummary(files);
  const source = files.slice(0, 80).map((file) => ({ ...file, excerpt: file.excerpt?.slice(0, 1800) }));
  const generated = await runWithModelEndpointFallback(endpoints, async (endpoint) => {
    const provider = createOpenAICompatible({ name: `otoflow-summary-${endpoint.provider}`, baseURL: endpoint.baseUrl, apiKey: endpoint.apiKey });
    const { text } = await generateText({
      model: provider(endpoint.model),
      system: "Dosya içeriklerinden kısa, somut ve Türkçe haftalık çalışma özeti üret. Gizli bilgi tahmin etme. Her dosyayı ayrı madde yap.",
      prompt: `${prompt || "Yeni ve değişen dosyaları özetle."}\n\n${JSON.stringify(source)}`
    });
    if (!text.trim()) throw new Error("Model boş yanıt verdi.");
    return text.trim();
  });
  return generated.value;
}

export async function runWithModelEndpointFallback<T>(endpoints: AiModelEndpoint[], operation: (endpoint: AiModelEndpoint) => Promise<T>) {
  const candidates = [...new Map(
    endpoints
      .filter((endpoint) => endpoint.model.trim() && endpoint.baseUrl.trim() && endpoint.apiKey.trim())
      .map((endpoint) => [`${endpoint.baseUrl}|${endpoint.model}`, endpoint])
  ).values()];
  if (candidates.length === 0) throw new Error("LLM model zinciri yapılandırılmamış.");
  const failures: string[] = [];
  for (const endpoint of candidates) {
    try {
      return { value: await operation(endpoint), endpoint };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen model hatası";
      const safeMessage = error instanceof z.ZodError
        ? "Model yanıtı çalıştırılabilir otomasyon planına dönüştürülemedi."
        : /(api[_ -]?key|authorization|token|secret)/i.test(message) ? "Kimlik doğrulama hatası." : message.slice(0, 180);
      failures.push(`${endpoint.label}: ${safeMessage}`);
    }
  }
  throw new Error(`LLM model zincirindeki tüm modeller başarısız oldu. ${failures.join(" | ")}`);
}

export async function runWithModelFallback<T>(models: string[], operation: (model: string) => Promise<T>) {
  const endpoints: AiModelEndpoint[] = models.map((model) => ({
    provider: "openrouter",
    model,
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "compatibility-test-key",
    label: model
  }));
  const result = await runWithModelEndpointFallback(endpoints, (endpoint) => operation(endpoint.model));
  return { value: result.value, model: result.endpoint.model };
}
