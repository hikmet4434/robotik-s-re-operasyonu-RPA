import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { normalizeSaasDashboard } from "../src/client/api";
import type { SaasDashboard } from "../src/shared/saasTypes";

const normalized = normalizeSaasDashboard({
  approvals: undefined,
  queues: undefined,
  queueItems: undefined,
  jobLogs: undefined
} as unknown as SaasDashboard);

assert.deepEqual(normalized.approvals, []);
assert.deepEqual(normalized.queues, []);
assert.deepEqual(normalized.queueItems, []);
assert.deepEqual(normalized.jobLogs, []);

const workerSource = await fs.readFile(new URL("../scripts/build-sites-worker.mjs", import.meta.url), "utf8");
for (const contract of ["queues: state.queues", "queueItems: state.queueItems", "jobLogs: state.jobLogs"]) {
  assert.match(workerSource, new RegExp(contract.replace(".", "\\.")));
}

const layoutSource = await fs.readFile(new URL("../src/client/ui/AppLayout.tsx", import.meta.url), "utf8");
assert.match(layoutSource, /to="\/approvals"/);
assert.match(layoutSource, /bekleyen onayı aç/);
assert.match(layoutSource, /to: "\/jobs", label: "Hazırlanan Dosyalar"/);
assert.match(layoutSource, /link\.to === "\/jobs" \? "Dosyalar"/);

const dashboardSource = await fs.readFile(new URL("../src/client/pages/DashboardPage.tsx", import.meta.url), "utf8");
assert.match(dashboardSource, /Hazırlanan dosyaları görün/);
assert.match(dashboardSource, /Belgeler → OtoFlow Raporları/);
assert.match(dashboardSource, /Tek sayfalık, kolay okunur haftalık özet/);
assert.match(dashboardSource, /Dosyalarda yapılan işlemlerin sade açıklaması/);
assert.match(dashboardSource, /Bilgisayarınızda hazır olan dosyalar/);
assert.match(dashboardSource, /api\.localPreparedReports\(\)/);
assert.match(dashboardSource, /href="\/downloads\/otoflow-chrome-recorder\.zip" download/);
assert.match(dashboardSource, /Chrome Recorder’ı İndir/);
assert.match(dashboardSource, /Paketlenmemiş öğe yükle/);
assert.match(dashboardSource, /kayıt başlatmak için uygulama girişi yapmanız gerekmez/);
assert.match(dashboardSource, /Örnek Uygulama Girişi/);
assert.match(dashboardSource, /api\.localRecordings\(\)/);
assert.match(dashboardSource, /window\.setInterval\(\(\) => void syncRecorder\(\), 1_000\)/);
assert.match(dashboardSource, /adım canlı alındı/);
assert.match(dashboardSource, /finder\|masaüstü\|dosya\|klasör/);
assert.match(dashboardSource, /Finder Kaydını Başlat/);
assert.match(dashboardSource, /api\.startDesktopRecording\(started\.session\.id\)/);
assert.match(dashboardSource, /Masaüstü kaydı açık/);

const agentSource = await fs.readFile(new URL("../agents/local-agent/src/index.js", import.meta.url), "utf8");
assert.match(agentSource, /req\.url === "\/reports"/);
assert.match(agentSource, /Access-Control-Allow-Private-Network/);
assert.match(agentSource, /fs\.createReadStream\(reportPath\)\.pipe\(res\)/);
assert.match(agentSource, /https:\/\/otoflow-ai-rpa\.hiktan\.chatgpt\.site/);

const recorderArchive = await fs.stat(new URL("../public/downloads/otoflow-chrome-recorder.zip", import.meta.url));
assert.ok(recorderArchive.size > 1_000);

const recorderPopup = await fs.readFile(new URL("../extension/chrome-recorder/popup.html", import.meta.url), "utf8");
assert.doesNotMatch(recorderPopup, />Oturum Aç</);
assert.match(recorderPopup, /Kayıt için uygulama girişi gerekmez/);
assert.match(recorderPopup, /id="toggle" class="primary">Kaydı Başlat/);

const recorderPopupScript = await fs.readFile(new URL("../extension/chrome-recorder/popup.js", import.meta.url), "utf8");
assert.match(recorderPopupScript, /if \(!state\.recording && !state\.sessionId\)/);
assert.match(recorderPopupScript, /await createSession\(false\)/);
assert.match(recorderPopupScript, /Date\.now\(\) - new Date\(item\.updatedAt\)\.getTime\(\) < 10 \* 60 \* 1_000/);

const recorderContentScript = await fs.readFile(new URL("../extension/chrome-recorder/content.js", import.meta.url), "utf8");
assert.match(recorderContentScript, /OtoFlow • Kayıt açık/);
assert.match(recorderContentScript, /adım kaydedildi/);
assert.match(recorderContentScript, /Kayıt bağlantısı kesildi/);

const recorderBackgroundScript = await fs.readFile(new URL("../extension/chrome-recorder/background.js", import.meta.url), "utf8");
assert.match(recorderBackgroundScript, /setBadgeText\(\{ text: recording \? "REC" : "" \}\)/);

const serverSource = await fs.readFile(new URL("../src/server/index.ts", import.meta.url), "utf8");
assert.match(serverSource, /origin\?\.startsWith\("chrome-extension:\/\/"\)/);
assert.match(serverSource, /Access-Control-Allow-Private-Network/);
assert.match(serverSource, /https:\/\/otoflow-ai-rpa\.hiktan\.chatgpt\.site/);

assert.match(agentSource, /OtoFlow kaydı başladı/);
assert.match(agentSource, /OtoFlow kaydı tamamlandı/);

console.log(JSON.stringify({ ok: true, normalizedCollections: 4, notificationTarget: "/approvals", preparedFilesNavigation: true, localReportBridge: true, recorderDownload: true, oneClickRecorder: true, liveRecorderBridge: true, recorderIndicator: true, desktopTaskAutostart: true }));
