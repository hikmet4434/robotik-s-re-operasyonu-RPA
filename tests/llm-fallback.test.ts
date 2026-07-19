import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runWithModelFallback } from "../src/server/aiAutomation";

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
delete process.env.OPENROUTER_MODEL_PRIMARY;
delete process.env.OPENROUTER_MODEL_FALLBACK_1;
delete process.env.OPENROUTER_MODEL_FALLBACK_2;

const { getAiRuntimeSettings } = await import("../src/server/saasStore");
const settings = getAiRuntimeSettings();
assert.deepEqual(settings.models, models);
assert.equal(settings.apiKey, "test-only-key");
await fs.rm(tempDir, { recursive: true, force: true });

console.log(JSON.stringify({ ok: true, models, fallbackAttempts: attempts.length }));
