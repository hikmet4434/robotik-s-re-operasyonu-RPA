import fs from "node:fs";
import path from "node:path";
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
  const detected = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!detected) throw new Error("Chrome/Edge/Chromium bulunamadı. OTOFLOW_BROWSER_EXECUTABLE ayarlayın.");
  return detected;
}

export class BrowserExecutor {
  context;
  page;

  async ensurePage() {
    if (!this.context) {
      const profileDir = path.resolve(process.cwd(), "data", "browser-profile");
      fs.mkdirSync(profileDir, { recursive: true });
      this.context = await chromium.launchPersistentContext(profileDir, {
        executablePath: browserExecutable(),
        headless: process.env.OTOFLOW_HEADLESS === "true",
        acceptDownloads: true,
        viewport: null
      });
      this.page = this.context.pages()[0] || await this.context.newPage();
    }
    return this.page;
  }

  async execute(step, resolvedValue) {
    const page = await this.ensurePage();
    const parameters = step.parameters || {};
    const timeout = parameters.timeoutMs || 30_000;

    switch (step.type) {
      case "browser.navigate":
        if (!parameters.url) throw new Error("Tarayıcı adresi tanımlı değil.");
        await page.goto(parameters.url, { waitUntil: "domcontentloaded", timeout });
        return `Sayfa açıldı: ${new URL(page.url()).origin}`;
      case "browser.click":
        if (!parameters.selector) throw new Error("Tıklanacak öğenin seçicisi tanımlı değil.");
        await page.locator(parameters.selector).first().click({ timeout });
        return "Öğe tıklandı.";
      case "browser.type": {
        if (!parameters.selector) throw new Error("Yazılacak alanın seçicisi tanımlı değil.");
        const value = resolvedValue ?? parameters.value;
        if (typeof value !== "string") throw new Error("Yazılacak değer veya hesap alanı tanımlı değil.");
        await page.locator(parameters.selector).first().fill(value, { timeout });
        return parameters.credentialField ? "Kasa değeri güvenli alana yazıldı." : "Alan dolduruldu.";
      }
      case "browser.select":
        if (!parameters.selector || parameters.option === undefined) throw new Error("Seçim alanı veya seçenek tanımlı değil.");
        await page.locator(parameters.selector).first().selectOption({ label: parameters.option }).catch(() => page.locator(parameters.selector).first().selectOption(parameters.option));
        return "Seçenek işaretlendi.";
      case "browser.wait":
        await page.waitForTimeout(parameters.timeoutMs || 1000);
        return "Bekleme tamamlandı.";
      case "browser.extract": {
        if (!parameters.selector) throw new Error("Okunacak öğenin seçicisi tanımlı değil.");
        const text = (await page.locator(parameters.selector).first().innerText({ timeout })).trim();
        return `Ekran verisi okundu (${Math.min(text.length, 500)} karakter).`;
      }
      default:
        throw new Error(`Tarayıcı yürütücüsü ${step.type} adımını desteklemiyor.`);
    }
  }

  async close() {
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }
}
