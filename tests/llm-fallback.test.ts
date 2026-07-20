import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildHeuristicSummary, extractDocumentTextWithGlmOcr, normalizeGeneratedPlan, resolveModelEndpoints, runWithModelFallback } from "../src/server/aiAutomation";

const request = {
  prompt: "Her hafta yeni dosyaları incele, özetle ve pazartesi rapor hazırla.",
  scheduleLabel: "Her pazartesi 09:00"
};

const glmPlan = normalizeGeneratedPlan({
  workflow: {
    title: "Haftalık dosya özeti",
    description: "Yeni dosyaları inceleyerek haftalık bir çalışma raporu hazırlar.",
    trigger: "Her pazartesi 09:00",
    actions: [{
      actionType: "files.scan",
      name: "Yeni dosyaları tara",
      details: "Son yedi gündeki dosyaları listeler.",
      risk_level: "düşük",
      parameters: { lookbackDays: 7 }
    }]
  }
}, request);
assert.equal(glmPlan.name, "Haftalık dosya özeti");
assert.equal(glmPlan.category, "operasyon");
assert.equal(glmPlan.steps[0].type, "files.scan");
assert.equal(glmPlan.steps[0].parameterJson, JSON.stringify({ lookbackDays: 7 }));

const kimiPlan = normalizeGeneratedPlan({
  name: "Fatura kontrolü",
  summary: "Yeni faturaları kontrol eder ve onay için kullanıcıya sunar.",
  actions: [{
    type: "approval",
    title: "Faturayı onaylat",
    instruction: "Finans sorumlusunun onayını bekler.",
    approval_required: "evet"
  }]
}, { prompt: "Yeni faturaları finans ekibi için kontrol et." });
assert.equal(kimiPlan.category, "finans");
assert.equal(kimiPlan.steps[0].type, "approval.wait");
assert.equal(kimiPlan.steps[0].requiresApproval, true);

const deepSeekPlan = normalizeGeneratedPlan(`\`\`\`json
{
  "output": {
    "description": "Müşteri tekliflerini CRM sisteminde düzenli olarak işler.",
    "schedule": { "label": "Her iş günü" },
    "workflow_steps": [{
      "action": "click",
      "label": "Teklifler menüsüne tıkla",
      "description": "CRM içindeki teklifler menüsünü açar.",
      "parameters": { "selector": "#offers" }
    }]
  }
}
\`\`\``, { prompt: "CRM tekliflerini işle." });
assert.equal(deepSeekPlan.name, "CRM tekliflerini işle");
assert.equal(deepSeekPlan.category, "satış");
assert.equal(deepSeekPlan.trigger, "Her iş günü");
assert.equal(deepSeekPlan.steps[0].type, "browser.click");

assert.throws(
  () => normalizeGeneratedPlan({ name: "Eksik plan", description: "Hiç adımı olmayan plan." }, request),
  /too_small|at least 1/i
);

const models = ["z-ai/glm-5.2", "moonshotai/kimi-k3", "deepseek/deepseek-v4-pro"];
const attempts: string[] = [];
const result = await runWithModelFallback(models, async (model) => {
  attempts.push(model);
  if (model !== models[2]) throw new Error("geçici sağlayıcı hatası");
  return "ok";
});

assert.equal(result.value, "ok");
assert.equal(result.model, models[2]);
assert.deepEqual(attempts, models);

const plainSummary = buildHeuristicSummary([
  { name: "stripe-checkout.ts", relativePath: "Documents/shop/payments/stripe-checkout.ts", size: 1200, modifiedAt: new Date().toISOString() },
  { name: "AdminDashboard.tsx", relativePath: "Documents/shop/AdminDashboard.tsx", size: 1800, modifiedAt: new Date().toISOString() },
  { name: "ReferenceError-AdminLogin-is-not-defined.txt", relativePath: "Documents/shop/tests/ReferenceError-AdminLogin-is-not-defined.txt", size: 900, modifiedAt: new Date().toISOString() },
  { name: "weekly-pdf-report.ts", relativePath: "Documents/shop/reports/weekly-pdf-report.ts", size: 1400, modifiedAt: new Date().toISOString() }
]);
assert.match(plainSummary, /Stripe ödeme bağlantısı/);
assert.match(plainSummary, /Yönetim ve takip ekranları/);
assert.match(plainSummary, /PDF seçenekleriyle/);
assert.match(plainSummary, /Yönetim giriş ekranındaki eksik tanım hatası giderildi/);

await assert.rejects(
  runWithModelFallback(models, async () => {
    throw new Error("Authorization: token super-secret");
  }),
  (error: Error) => {
    assert.match(error.message, /tüm modeller başarısız/i);
    assert.equal(error.message.includes("super-secret"), false);
    return true;
  }
);

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "otoflow-llm-test-"));
process.env.SAAS_DATABASE_PATH = path.join(tempDir, "state.sqlite");
process.env.OPENROUTER_API_KEY = "test-only-key";
delete process.env.ZAI_API_KEY;
delete process.env.OPENROUTER_MODEL_PRIMARY;
delete process.env.OPENROUTER_MODEL_FALLBACK_1;
delete process.env.OPENROUTER_MODEL_FALLBACK_2;

const { getAiRuntimeSettings } = await import("../src/server/saasStore");
const settings = getAiRuntimeSettings();
assert.deepEqual(settings.models, models);
assert.equal(settings.apiKey, "test-only-key");

process.env.ZAI_API_KEY = "test-zai-key";
const directSettings = getAiRuntimeSettings();
assert.deepEqual(directSettings.models, ["glm-5.2", "moonshotai/kimi-k3", "deepseek/deepseek-v4-pro"]);
assert.equal(directSettings.modelChain?.[0].label, "Z.AI · glm-5.2");
assert.equal(directSettings.modelChain?.[1].label, "OpenRouter · moonshotai/kimi-k3");
assert.equal(resolveModelEndpoints(directSettings).length, 3);

const imagePath = path.join(tempDir, "invoice.png");
await fs.writeFile(imagePath, Buffer.from("fake-png"));
let ocrRequestBody = "";
const ocrResult = await extractDocumentTextWithGlmOcr(
  { path: imagePath, mimeType: "image/png", sizeBytes: 8 },
  { apiKey: "test-zai-key", baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-ocr" },
  async (_url, init) => {
    ocrRequestBody = String(init?.body || "");
    return new Response(JSON.stringify({ md_results: "Fatura No: INV-42\nToplam: 12.400 TL" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
);
assert.equal(ocrResult?.model, "glm-ocr");
assert.match(ocrResult?.text || "", /INV-42/);
assert.match(ocrRequestBody, /data:image\/png;base64/);

delete process.env.ZAI_API_KEY;
await fs.rm(tempDir, { recursive: true, force: true });

console.log(JSON.stringify({ ok: true, models, fallbackAttempts: attempts.length }));
