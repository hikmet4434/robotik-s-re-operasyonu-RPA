import crypto from "node:crypto";
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
  if (settings.provider !== "ollama" && !settings.apiKey) throw new Error("Seçilen LLM sağlayıcısı için API anahtarı gerekli.");
  if (!settings.model.trim()) throw new Error("LLM modeli seçilmedi.");

  const provider = createOpenAICompatible({
    name: "otoflowPlanner",
    baseURL: settings.baseUrl,
    apiKey: settings.apiKey || "ollama-local",
    supportsStructuredOutputs: settings.provider !== "ollama"
  });
  const generated = await runWithModelFallback(settings.models || [settings.model], async (model) => {
    const result = await generateText({
      model: provider(model),
      output: Output.json(),
      system: [
        "Sen OtoFlow için güvenli bir RPA workflow mimarısın.",
        "Yalnızca verilen izinli adım türlerini kullan. Uydurma şifre, kullanıcı adı veya gizli bilgi üretme.",
        "Bilinmeyen selector, koordinat, URL ve dosya yolu için boş değer veya açık varsayım kullan.",
        "Para, silme, resmi beyan, müşteri iletişimi ve dış sisteme gönderim adımlarında requiresApproval=true kullan.",
        "parameterJson alanına yalnızca geçerli JSON nesnesi yaz. Dosya raporu için files.scan, files.summarize, activity.summarize, report.compose ve report.save adımlarını sırala.",
        "Başlıkları ve açıklamaları Türkçe yaz. Ekran kaydı gerektirmeyen çalıştırılabilir bir taslak üret."
      ].join("\n"),
      prompt: `Kullanıcı talebi:\n${input.prompt}\n\nTakvim: ${input.scheduleLabel || "Manuel"}\nKlasör: ${input.directoryPath || "Kullanıcı seçecek"}\nRapor hedefi: ${input.reportPath || "Kullanıcı seçecek"}`
    });
    return generatedPlanSchema.parse(result.output);
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
    providerLabel: `OpenRouter · ${generated.model}`,
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
  if (settings.provider !== "ollama" && !settings.apiKey) return buildHeuristicSummary(files);
  const provider = createOpenAICompatible({ name: "otoflowSummary", baseURL: settings.baseUrl, apiKey: settings.apiKey || "ollama-local" });
  const source = files.slice(0, 80).map((file) => ({ ...file, excerpt: file.excerpt?.slice(0, 1800) }));
  const generated = await runWithModelFallback(settings.models || [settings.model], async (model) => {
    const { text } = await generateText({
      model: provider(model),
      system: "Dosya içeriklerinden kısa, somut ve Türkçe haftalık çalışma özeti üret. Gizli bilgi tahmin etme. Her dosyayı ayrı madde yap.",
      prompt: `${prompt || "Yeni ve değişen dosyaları özetle."}\n\n${JSON.stringify(source)}`
    });
    if (!text.trim()) throw new Error("Model boş yanıt verdi.");
    return text.trim();
  });
  return generated.value;
}

export async function runWithModelFallback<T>(models: string[], operation: (model: string) => Promise<T>) {
  const candidates = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  if (candidates.length === 0) throw new Error("OpenRouter model zinciri yapılandırılmamış.");
  const failures: string[] = [];
  for (const model of candidates) {
    try {
      return { value: await operation(model), model };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen model hatası";
      const safeMessage = /(api[_ -]?key|authorization|token|secret)/i.test(message) ? "Kimlik doğrulama hatası." : message.slice(0, 180);
      failures.push(`${model}: ${safeMessage}`);
    }
  }
  throw new Error(`OpenRouter model zincirindeki tüm modeller başarısız oldu. ${failures.join(" | ")}`);
}
