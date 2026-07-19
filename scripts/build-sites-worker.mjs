import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, posix, relative } from "node:path";

const root = process.cwd();
const distDir = join(root, "dist");
const serverDir = join(distDir, "server");
const hostingDir = join(distDir, ".openai");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

async function listFiles(dir) {
  const entries = await readdir(dir);
  const files = [];
  for (const entry of entries) {
    if (entry === "server") continue;
    const fullPath = join(dir, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) files.push(...await listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function publicPath(filePath) {
  return `/${relative(distDir, filePath).split(posix.sep).join("/")}`;
}

await mkdir(hostingDir, { recursive: true });
await writeFile(join(hostingDir, "hosting.json"), await readFile(join(root, ".openai", "hosting.json")));

const files = await listFiles(distDir);
const assets = [];
for (const file of files) {
  const path = publicPath(file);
  assets.push([
    path,
    [contentTypes[extname(file)] ?? "application/octet-stream", await readFile(file, "base64")],
  ]);
}

const workerSource = `const ASSETS = new Map(${JSON.stringify(assets)});

const ORG_ID = "org_demo_kobi";
const USER_ID = "usr_hikmet";
const WORKER_ID = "wrk_cloud_01";
const QUEUE_ID = "que_kobi_ops";

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function readJson(request) {
  if (!request.body) return {};
  return request.json().catch(() => ({}));
}

function seedField(key, label, value, confidence) {
  return { id: id("fld"), key, label, value, confidence, verified: confidence >= 95 };
}

function seedStep(type, title, description, requiresApproval, riskLevel) {
  return { id: id("step"), type, title, description, requiresApproval, riskLevel };
}

function buildAiFilePlan(body) {
  const directoryPath = body.directoryPath || "/Users/kullanici/Documents";
  const reportPath = body.reportPath || "/Users/kullanici/Documents/OtoFlow Raporlari/haftalik-dosya-raporu.md";
  const schedule = {
    enabled: Boolean(body.cron),
    cron: body.cron || "0 9 * * 1",
    timezone: body.timezone || "Europe/Istanbul",
    label: body.scheduleLabel || "Manuel baslat",
  };
  const step = (type, title, description, riskLevel, parameters, requiresApproval = false) => ({
    id: id("step"), type, title, description, requiresApproval, riskLevel, parameters,
    approvalPrompt: requiresApproval ? title + " adimi calistirilsin mi?" : undefined,
  });
  return {
    name: "Haftalik dosya ve calisma ozeti",
    description: "Son yedi gundeki yeni ve degisen dosyalari inceler, icerik ve aktivite ozeti cikarir, okunabilir bir rapor hazirlar.",
    category: "operasyon",
    trigger: schedule.label,
    source: "template",
    schedule,
    steps: [
      step("files.scan", "Yeni ve degisen dosyalari tara", "Izin verilen klasorde son yedi gunde eklenen veya degistirilen dosyalari listeler.", "low", { directoryPath, lookbackDays: 7, recursive: true, maxFiles: 500, outputKey: "weeklyFiles" }),
      step("files.summarize", "Dosya iceriklerini ozetle", "Metin tabanli dosyalari icerigiyle, diger dosyalari metadata ile ozetler.", "medium", { outputKey: "fileSummaries", prompt: "Dosyalari kisa Turkce maddelerle ozetle." }),
      step("activity.summarize", "Haftalik calismayi gunlere ayir", "Dosya hareketlerini gun ve dosya turune gore gruplar.", "low", { outputKey: "weeklyActivity" }),
      step("report.compose", "Haftalik raporu hazirla", "Dosya ve aktivite ozetini tek raporda birlestirir.", "low", { outputKey: "weeklyReport", reportTitle: "Haftalik Dosya ve Calisma Ozeti" }),
      step("report.save", "Raporu bilgisayara kaydet", "Raporu izin verilen hedefe kaydeder.", body.approvalAtEnd ? "medium" : "low", { reportPath, outputKey: "savedReport" }, Boolean(body.approvalAtEnd)),
    ],
    assumptions: ["Taranacak klasor: " + directoryPath, "Rapor hedefi: " + reportPath, "Bulut onizlemesi dosya islemlerini simule eder; yerel ajan bilgisayardaki izinli klasorlerde gercekten calisir."],
    providerLabel: "Yerel guvenli planlayici",
  };
}

function makeCustomsFile(number = 881) {
  const ts = now();
  const fileNo = String(number).padStart(4, "0");
  return {
    id: "DOS-2026-" + fileNo,
    customer: "Demo KOBI Operasyon A.S.",
    product: "Endustriyel mutfak ekipmani",
    status: "onay_bekliyor",
    createdAt: ts,
    freightUSD: 1850,
    insuranceUSD: 420,
    fxRate: 33.15,
    documents: [
      {
        type: "fatura",
        name: "Commercial-Invoice-" + fileNo + ".pdf",
        fields: [
          { key: "seller", label: "Satici", value: "Shenzhen KitchenTech Ltd.", confidence: 94, bbox: { page: 1, x: 12, y: 17, w: 34, h: 6 } },
          { key: "buyer", label: "Alici", value: "Demo KOBI Operasyon A.S.", confidence: 97, bbox: { page: 1, x: 12, y: 26, w: 38, h: 6 } },
          { key: "amount", label: "Fatura Tutari", value: "37.000,00 USD", confidence: 72, bbox: { page: 1, x: 58, y: 70, w: 27, h: 8 } },
        ],
      },
      {
        type: "ceki_listesi",
        name: "Packing-List-" + fileNo + ".pdf",
        fields: [
          { key: "gross_weight", label: "Brut Agirlik", value: "1.240 KG", confidence: 89, bbox: { page: 1, x: 55, y: 42, w: 18, h: 6 } },
          { key: "package_count", label: "Kap Adedi", value: "18 Palet", confidence: 96, bbox: { page: 1, x: 20, y: 42, w: 18, h: 6 } },
        ],
      },
      {
        type: "konsimento",
        name: "Bill-of-Lading-" + fileNo + ".pdf",
        fields: [
          { key: "vessel", label: "Gemi", value: "MV Marmara Express", confidence: 91, bbox: { page: 1, x: 15, y: 34, w: 30, h: 5 } },
          { key: "port", label: "Varis Limani", value: "Ambarli", confidence: 84, bbox: { page: 1, x: 50, y: 34, w: 22, h: 5 } },
        ],
      },
    ],
    lineItems: [
      {
        id: "line_1",
        description: "Endustriyel mutfak robotu KR-500",
        quantity: 2000,
        unitPriceUSD: 18.5,
        gtipSuggestions: [
          { code: "8509.40.00.00.00", confidence: 91, reason: "Mutfak tipi gida hazirlama cihazi" },
          { code: "8438.80.99.00.00", confidence: 72, reason: "Endustriyel gida isleme ekipmani olasiligi" },
          { code: "8479.82.00.00.00", confidence: 61, reason: "Karistirma/ogutme fonksiyonu benzerligi" },
        ],
      },
    ],
    auditLog: [{ ts, actor: "ai", action: "Demo belgelerinden alanlar ve GTIP onerileri cikarildi." }],
    communicationHistory: [],
  };
}

function seedState() {
  const ts = now();
  const workflows = [
    {
      id: "wf_invoice",
      organizationId: ORG_ID,
      name: "Fatura ekinden veri cikar ve tabloya isle",
      category: "finans",
      status: "published",
      trigger: "E-posta eki geldiginde",
      description: "Fatura PDF'lerini okur, dusuk guvenli alanlari onaya gonderir, onaydan sonra tabloya isler.",
      currentVersionId: "wfv_invoice_1",
      createdAt: ts,
    },
    {
      id: "wf_portal",
      organizationId: ORG_ID,
      name: "Web portal siparislerini indir",
      category: "operasyon",
      status: "published",
      trigger: "Hafta ici 09:00",
      description: "Web portalina girer, siparis listesini indirir, rapor uretir ve webhook'a gonderir.",
      currentVersionId: "wfv_portal_1",
      createdAt: ts,
    },
    {
      id: "wf_reconcile",
      organizationId: ORG_ID,
      name: "Cari mutabakat e-postasi hazirla",
      category: "finans",
      status: "draft",
      trigger: "Manuel baslat",
      description: "Cari veriyi ozetler, e-posta taslagi uretir, gonderim icin insan onayi bekler.",
      currentVersionId: "wfv_reconcile_1",
      createdAt: ts,
    },
    {
      id: "wf_customs",
      organizationId: ORG_ID,
      name: "Gumruk/lojistik dosyasi dogrula",
      category: "gümrük",
      status: "published",
      trigger: "Dosya yuklendiginde",
      description: "Fatura, ceki listesi ve konsimento alanlarini cikarir; GTIP/vergi onerisini insan onayina sunar.",
      currentVersionId: "wfv_customs_1",
      createdAt: ts,
    },
  ];
  return {
    organization: {
      id: ORG_ID,
      name: "Demo KOBI Operasyon A.S.",
      taxNumber: "1234567890",
      sector: "Genel KOBI Hizmetleri",
      createdAt: ts,
    },
    user: { id: USER_ID, name: "Hikmet Operasyon", email: "hikmet@otoflow.demo", createdAt: ts },
    membership: { id: "mem_owner", organizationId: ORG_ID, userId: USER_ID, role: "owner" },
    plan: { code: "pro", name: "Pro", monthlyPriceTRY: 7990, limits: { workflows: 25, monthlyJobs: 1200, documents: 2500, connectors: 12 } },
    subscription: { id: "sub_demo", organizationId: ORG_ID, planCode: "pro", status: "active", renewalNote: "Manuel faturalama - aylik cari mutabakat sonrasi yenilenir.", currentPeriodEnd: "2026-08-07" },
    opportunities: [
      opportunity("Fatura eklerini oku ve tabloya isle", "Finans", 420, 6, 3, 88, "hazir", ts),
      opportunity("Portal siparislerini indir ve raporla", "Operasyon", 260, 8, 4, 82, "analiz", ts),
      opportunity("Cari mutabakat e-postasi hazirla", "Muhasebe", 180, 10, 4, 77, "fikir", ts),
      opportunity("Gumruk dosyasi belge dogrulama", "Lojistik", 95, 18, 5, 73, "hazir", ts),
    ],
    workflows,
    jobs: [],
    queues: [{ id: QUEUE_ID, organizationId: ORG_ID, name: "KOBI Operasyon Kuyrugu", description: "Bulut onizleme otomasyon isleri", createdAt: ts }],
    queueItems: [],
    jobLogs: [],
    approvals: [
      {
        id: "app_seed_01",
        organizationId: ORG_ID,
        title: "Cari mutabakat e-postasi gonderimi",
        summary: "Musteriye gonderilecek yasal baglayici e-posta icin insan onayi bekleniyor.",
        riskLevel: "high",
        status: "pending",
        diff: [
          { label: "Alici", before: "Taslak", after: "musteri@example.com" },
          { label: "Tutar", before: "Belirsiz", after: "124.500 TL" },
        ],
        dueAt: "2026-07-20T12:00:00.000Z",
        createdAt: ts,
      },
    ],
    documents: [
      {
        id: "doc_seed_invoice",
        organizationId: ORG_ID,
        name: "Fatura-2026-0881.pdf",
        type: "invoice",
        status: "needs_review",
        fields: [
          seedField("supplier", "Tedarikci", "ABC Tedarik Ltd.", 96),
          seedField("total", "Toplam Tutar", "48.320 TL", 74),
          seedField("due_date", "Vade", "2026-07-28", 91),
        ],
        createdAt: ts,
      },
    ],
    connectors: [
      { id: "con_email", organizationId: ORG_ID, type: "email", name: "Operasyon E-posta", status: "connected", secretPreview: "**** demo", createdAt: ts },
      { id: "con_sheet", organizationId: ORG_ID, type: "google_sheets", name: "Finans Tablosu", status: "needs_attention", secretPreview: "OAuth gerekli", createdAt: ts },
    ],
    credentialProfiles: [],
    policies: [
      {
        id: "pol_approval",
        organizationId: ORG_ID,
        name: "Riskli islemlerde insan onayi",
        description: "Para transferi, resmi beyan, musteri iletisimi ve yasal baglayici gonderimler onaysiz calismaz.",
        enabled: true,
        policyType: "approval_gate",
        createdAt: ts,
      },
      {
        id: "pol_secret",
        organizationId: ORG_ID,
        name: "E-imza ve banka secret yasagi",
        description: "E-imza PIN'i, OTP, SMS kodu, banka sifresi ve kisisel elektronik imza credential olarak saklanamaz.",
        enabled: true,
        policyType: "secret_block",
        createdAt: ts,
      },
      {
        id: "pol_audit",
        organizationId: ORG_ID,
        name: "Tam audit izi",
        description: "Robot, kullanici, AI ve sistem olaylari tenant bazli audit log'a yazilir.",
        enabled: true,
        policyType: "audit",
        createdAt: ts,
      },
    ],
    audit: [{ id: "aud_seed", organizationId: ORG_ID, ts, actor: "system", action: "Demo tenant, uyum politikalari ve robot kuyrugu olusturuldu.", entityType: "organization", entityId: ORG_ID }],
    workers: [{ id: WORKER_ID, organizationId: ORG_ID, name: "Bulut Robot 01", runtime: "cloud", status: "idle", lastSeenAt: ts }],
    recordingSessions: [
      {
        id: "rec_seed_daily_report",
        organizationId: ORG_ID,
        title: "Gunluk portal raporu ve e-posta",
        goal: "Portal raporunu indir, ozetle ve musteriye onayli e-posta hazirla.",
        appName: "Demo Portal + E-posta",
        status: "analyzed",
        screenRecordingStatus: "captured",
        eventCount: 8,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    recorderEvents: [],
    automationDrafts: [
      {
        id: "draft_seed_daily_report",
        organizationId: ORG_ID,
        recordingSessionId: "rec_seed_daily_report",
        title: "Gunluk portal raporu ve e-posta otomasyonu",
        objective: "Portal raporu alma, ozetleme ve e-posta taslagi hazirlama isini tekrar calistirilabilir otomasyona cevirir.",
        confidence: 86,
        status: "draft",
        steps: [
          seedStep("browser.navigate", "Portala giris sayfasini ac", "Kullanicinin sectigi is uygulamasina gider.", false, "medium"),
          seedStep("browser.extract", "Rapor satirlarini oku", "Tablodaki tutar, musteri ve tarih alanlarini cikarir.", false, "medium"),
          seedStep("approval.wait", "Gonderim onayi bekle", "Musteri iletisimi oldugu icin insan onayi ister.", true, "high"),
        ],
        variables: [{ key: "reportDate", label: "Rapor tarihi", example: "Bugun", source: "Rapor filtre alani" }],
        approvalGates: [{ title: "E-posta gonderimi", reason: "Musteri iletisimi ticari sonuc dogurabilir.", riskLevel: "high" }],
        subAutomations: [{ name: "Uctan uca surec", purpose: "Kaydedilen is akisinin tek otomasyona donusmesi", stepIds: ["step_1", "step_2", "step_3"] }],
        createdAt: ts,
      },
    ],
    files: [makeCustomsFile(881)],
  };
}

function opportunity(title, department, monthlyVolume, minutesPerTask, errorRisk, feasibility, status, createdAt) {
  return {
    id: id("opp"),
    organizationId: ORG_ID,
    title,
    department,
    monthlyVolume,
    minutesPerTask,
    errorRisk,
    feasibility,
    roiScore: Math.round(monthlyVolume * minutesPerTask * (1 + errorRisk / 10) * (feasibility / 100)),
    status,
    createdAt,
  };
}

function getState() {
  globalThis.__OTOFLOW_DEMO_STATE ??= seedState();
  const state = globalThis.__OTOFLOW_DEMO_STATE;
  const arrayKeys = ["opportunities", "workflows", "jobs", "queues", "queueItems", "jobLogs", "approvals", "documents", "connectors", "credentialProfiles", "policies", "audit", "workers", "recordingSessions", "recorderEvents", "automationDrafts", "files"];
  for (const key of arrayKeys) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  if (state.queues.length === 0) state.queues.push({ id: QUEUE_ID, organizationId: ORG_ID, name: "KOBI Operasyon Kuyrugu", description: "Bulut onizleme otomasyon isleri", createdAt: now() });
  return state;
}

function audit(state, actor, action, entityType, entityId) {
  state.audit.unshift({ id: id("aud"), organizationId: ORG_ID, ts: now(), actor, action, entityType, entityId });
}

function dashboard() {
  const state = getState();
  const succeeded = state.jobs.filter((job) => job.status === "succeeded").length;
  const finished = state.jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status)).length;
  return {
    organization: state.organization,
    user: state.user,
    membership: state.membership,
    plan: state.plan,
    subscription: state.subscription,
    usage: {
      workflows: state.workflows.length,
      monthlyJobs: state.jobs.length,
      documents: state.documents.length,
      connectors: state.connectors.length,
    },
    kpis: {
      savedHours: Math.round(state.opportunities.reduce((sum, item) => sum + (item.monthlyVolume * item.minutesPerTask) / 60, 0)),
      successRate: finished === 0 ? 100 : Math.round((succeeded / finished) * 100),
      pendingApprovals: state.approvals.filter((item) => item.status === "pending").length,
      slaBreaches: 0,
      activeRobots: state.workers.filter((item) => item.status !== "offline").length,
    },
    opportunities: state.opportunities,
    workflows: state.workflows,
    queues: state.queues,
    queueItems: state.queueItems,
    jobs: state.jobs,
    jobLogs: state.jobLogs,
    approvals: state.approvals,
    documents: state.documents,
    connectors: state.connectors,
    credentialProfiles: state.credentialProfiles,
    policies: state.policies,
    audit: state.audit.slice(0, 80),
    workers: state.workers,
    recordingSessions: state.recordingSessions,
    recorderEvents: state.recorderEvents,
    automationDrafts: state.automationDrafts,
  };
}

function calculateTax(file) {
  const invoiceTotal = 37000;
  const cifUSD = invoiceTotal + file.freightUSD + file.insuranceUSD;
  const customsDutyRate = 0.035;
  const customsDutyUSD = Math.round(cifUSD * customsDutyRate * 100) / 100;
  const vatRate = 0.2;
  const vatBaseUSD = cifUSD + customsDutyUSD;
  const vatUSD = Math.round(vatBaseUSD * vatRate * 100) / 100;
  const totalUSD = Math.round((customsDutyUSD + vatUSD) * 100) / 100;
  return { cifUSD, customsDutyRate, customsDutyUSD, vatBaseUSD, vatRate, vatUSD, totalUSD, totalTRY: Math.round(totalUSD * file.fxRate * 100) / 100 };
}

async function handleApi(request, url) {
  const state = getState();
  const method = request.method;
  const path = url.pathname;

  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (method === "GET" && path === "/api/health") return json({ ok: true, service: "OtoFlow AI Sites Demo API" });
  if (method === "GET" && path === "/api/me") return json({ organization: state.organization, user: state.user, membership: state.membership, plan: state.plan, subscription: state.subscription });
  if (method === "GET" && path === "/api/org/current") return json({ organization: state.organization, membership: state.membership, plan: state.plan, subscription: state.subscription });
  if (method === "GET" && path === "/api/dashboard") return json(dashboard());
  if (method === "GET" && path === "/api/workflows") return json(state.workflows.map((workflow) => ({ ...workflow, version: { id: workflow.currentVersionId, workflowId: workflow.id, version: 1, steps: [] } })));
  if (method === "GET" && path === "/api/recordings") return json(state.recordingSessions.map((session) => ({ ...session, events: state.recorderEvents.filter((event) => event.target.startsWith(session.id + ":")), draft: state.automationDrafts.find((draft) => draft.recordingSessionId === session.id) })));
  if (method === "GET" && path === "/api/jobs") return json(state.jobs.map((job) => ({ ...job, workflow: state.workflows.find((workflow) => workflow.id === job.workflowId), logs: state.jobLogs.filter((log) => log.jobId === job.id) })));
  if (method === "GET" && path === "/api/approvals") return json(state.approvals);
  if (method === "GET" && path === "/api/connectors") return json(state.connectors);
  if (method === "GET" && path === "/api/credentials") return json(state.credentialProfiles);
  if (method === "GET" && path === "/api/compliance/audit") return json(state.audit);
  if (method === "GET" && path === "/api/compliance/policies") return json({ policies: state.policies, audit: state.audit });
  if (method === "GET" && path === "/api/files") return json(state.files);

  if (method === "POST" && path === "/api/recordings") {
    const body = await readJson(request);
    const session = { id: id("rec"), organizationId: ORG_ID, title: body.title || "Yeni is kaydi", goal: body.goal || "Kaydedilen isi otomasyona cevir.", appName: body.appName || "Demo uygulama", status: "recording", screenRecordingStatus: "not_started", eventCount: 0, createdAt: now(), updatedAt: now() };
    state.recordingSessions.unshift(session);
    audit(state, "user", session.title + " icin is kaydi baslatildi.", "recording_session", session.id);
    return json(session, 201);
  }

  let match = path.match(/^\\/api\\/recordings\\/([^/]+)\\/events$/);
  if (method === "POST" && match) {
    const session = state.recordingSessions.find((item) => item.id === match[1]);
    if (!session) return error("Kayit oturumu bulunamadi.", 404);
    const body = await readJson(request);
    const event = { id: id("evt"), ts: now(), ...body, target: session.id + ":" + (body.target || "event") };
    state.recorderEvents.push(event);
    session.eventCount += 1;
    session.updatedAt = event.ts;
    if (body.type === "screen.start") session.screenRecordingStatus = "recording";
    if (body.type === "screen.stop") session.screenRecordingStatus = "captured";
    return json(event, 201);
  }

  match = path.match(/^\\/api\\/recordings\\/([^/]+)\\/video$/);
  if (method === "POST" && match) {
    const session = state.recordingSessions.find((item) => item.id === match[1]);
    if (!session) return error("Kayit oturumu bulunamadi.", 404);
    const form = await request.formData().catch(() => null);
    const video = form?.get("video");
    session.screenRecordingStatus = "captured";
    session.videoFileName = "sites-preview.webm";
    session.videoMimeType = typeof video === "object" && video && "type" in video ? video.type : "video/webm";
    session.videoSizeBytes = typeof video === "object" && video && "size" in video ? video.size : 0;
    return json(session, 201);
  }

  match = path.match(/^\\/api\\/recordings\\/([^/]+)\\/analyze$/);
  if (method === "POST" && match) {
    const session = state.recordingSessions.find((item) => item.id === match[1]);
    if (!session) return error("Kayit oturumu bulunamadi.", 404);
    const events = state.recorderEvents.filter((event) => event.target.startsWith(session.id + ":"));
    const draft = {
      id: id("draft"),
      organizationId: ORG_ID,
      recordingSessionId: session.id,
      title: session.title + " otomasyonu",
      objective: session.goal,
      confidence: Math.min(94, 68 + events.length * 4),
      status: "draft",
      steps: [
        seedStep("browser.click", "Kaydedilen adimlari tekrar et", "Kullanicinin is sirasinda yaptigi tiklama ve formlari uygular.", false, "medium"),
        seedStep("approval.wait", "Riskli final aksiyon icin onay bekle", "E-posta, resmi beyan veya finansal sonuc doguran adimlarda insan onayi ister.", true, "high"),
      ],
      variables: events.slice(0, 5).map((event, index) => ({ key: "var_" + (index + 1), label: event.label, example: event.value || "Demo veri", source: event.appArea || "Recorder" })),
      approvalGates: [{ title: "Final aksiyon", reason: "Riskli is adimlari onaysiz calismaz.", riskLevel: "high" }],
      subAutomations: [{ name: "Kayitli surec", purpose: "Recorder adimlarini workflow'a donusturur.", stepIds: ["step_1", "step_2"] }],
      createdAt: now(),
    };
    state.automationDrafts = state.automationDrafts.filter((item) => item.recordingSessionId !== session.id);
    state.automationDrafts.unshift(draft);
    session.status = "analyzed";
    session.updatedAt = now();
    audit(state, "ai", session.title + " kaydi analiz edildi.", "automation_draft", draft.id);
    return json(draft);
  }

  match = path.match(/^\\/api\\/automation-drafts\\/([^/]+)\\/publish$/);
  if (method === "POST" && match) {
    const draft = state.automationDrafts.find((item) => item.id === match[1]);
    if (!draft) return error("Taslak bulunamadi.", 404);
    const workflow = { id: id("wf"), organizationId: ORG_ID, name: draft.title, category: "genel", status: "published", trigger: "Recorder Studio kaydindan uretildi", description: draft.objective, currentVersionId: id("wfv"), credentialId: draft.credentialId, steps: draft.steps, createdAt: now() };
    state.workflows.unshift(workflow);
    draft.status = "published";
    draft.publishedWorkflowId = workflow.id;
    audit(state, "user", workflow.name + " workflow olarak yayina alindi.", "workflow", workflow.id);
    return json(workflow, 201);
  }

  match = path.match(/^\\/api\\/automation-drafts\\/([^/]+)$/);
  if (method === "PATCH" && match) {
    const draft = state.automationDrafts.find((item) => item.id === match[1]);
    if (!draft) return error("Taslak bulunamadi.", 404);
    const body = await readJson(request);
    if (Array.isArray(body.steps) && body.steps.length) draft.steps = body.steps;
    draft.credentialId = body.credentialId || draft.credentialId;
    draft.title = body.title || draft.title;
    draft.objective = body.objective || draft.objective;
    draft.approvalGates = draft.steps.filter((step) => step.requiresApproval || step.type === "approval.wait").map((step) => ({ title: step.title, reason: step.approvalPrompt || step.description, riskLevel: step.riskLevel }));
    return json(draft);
  }

  if (method === "GET" && path === "/api/ai/settings") {
    return json({ provider: "template", model: "yerel-guvenli-planlayici", baseUrl: "", hasApiKey: false, updatedAt: now() });
  }

  if (method === "GET" && path === "/api/ai/status") {
    return json({ mode: "local_template", configured: true, modelCount: 1 });
  }

  if (method === "PUT" && path === "/api/ai/settings") {
    const body = await readJson(request);
    if (body.provider !== "template") return error("Bulut onizlemesinde API anahtari saklanmaz. OpenAI, OpenRouter ve Ollama icin yerel uygulamayi kullanin.");
    return json({ provider: "template", model: "yerel-guvenli-planlayici", baseUrl: "", hasApiKey: false, updatedAt: now() });
  }

  if (method === "POST" && path === "/api/ai/automation-plan") {
    const body = await readJson(request);
    if (!body.prompt || body.prompt.length < 12) return error("Otomasyon tarifini biraz daha detaylandirin.");
    return json(buildAiFilePlan(body));
  }

  if (method === "POST" && path === "/api/ai/workflows") {
    const body = await readJson(request);
    if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) return error("Gecerli bir AI workflow taslagi gerekli.");
    const workflow = {
      id: id("wf"), organizationId: ORG_ID, name: body.name, category: body.category || "genel", status: "published",
      trigger: body.trigger || "Manuel baslat", description: body.description, currentVersionId: id("wfv"), source: body.source || "template",
      schedule: body.schedule, steps: body.steps, createdAt: now(),
    };
    state.workflows.unshift(workflow);
    audit(state, "ai", workflow.name + " dogal dil taslagindan workflow olarak olusturuldu.", "workflow", workflow.id);
    return json(workflow, 201);
  }

  match = path.match(/^\\/api\\/workflows\\/([^/]+)\\/export$/);
  if (method === "GET" && match) {
    const workflow = state.workflows.find((item) => item.id === match[1]);
    if (!workflow) return error("Workflow bulunamadi.", 404);
    const pkg = {
      format: "otoflow.automation",
      version: 1,
      exportedAt: now(),
      metadata: { name: workflow.name, description: workflow.description, category: workflow.category, trigger: workflow.trigger, source: workflow.source, schedule: workflow.schedule },
      steps: (workflow.steps || [seedStep("browser.wait", "Teknik kullanici ayari", "Canli ajan sunucusunda adimlari yapilandirin.", false, "low")]).map((step) => ({ ...step, credentialId: undefined })),
      variables: [],
      requiredCredential: workflow.credentialId ? { alias: "primary", label: "Bagli hesap profili" } : undefined,
    };
    return new Response(JSON.stringify(pkg, null, 2), { headers: { "content-type": "application/vnd.otoflow.automation+json; charset=utf-8", "content-disposition": 'attachment; filename="' + workflow.name.replace(/[^a-z0-9_-]+/gi, "-") + '.otomasyon"' } });
  }

  if (method === "POST" && path === "/api/workflows/import") {
    const pkg = await readJson(request);
    if (pkg.format !== "otoflow.automation" || pkg.version !== 1 || !Array.isArray(pkg.steps)) return error("Gecersiz .otomasyon dosyasi.");
    const workflow = { id: id("wf"), organizationId: ORG_ID, name: pkg.metadata.name, category: pkg.metadata.category || "genel", status: pkg.requiredCredential ? "draft" : "published", trigger: pkg.metadata.trigger, description: pkg.metadata.description, currentVersionId: id("wfv"), source: "import", schedule: pkg.metadata.schedule, steps: pkg.steps.map((step) => ({ ...step, id: id("step"), credentialId: undefined })), createdAt: now() };
    state.workflows.unshift(workflow);
    audit(state, "user", workflow.name + " .otomasyon dosyasindan ice aktarildi.", "workflow", workflow.id);
    return json(workflow, 201);
  }

  match = path.match(/^\\/api\\/workflows\\/([^/]+)$/);
  if (method === "PATCH" && match) {
    const workflow = state.workflows.find((item) => item.id === match[1]);
    if (!workflow) return error("Workflow bulunamadi.", 404);
    const body = await readJson(request);
    workflow.credentialId = body.credentialId || workflow.credentialId;
    if (Array.isArray(body.steps)) workflow.steps = body.steps;
    if (body.schedule) workflow.schedule = body.schedule;
    if (body.publish) workflow.status = "published";
    return json(workflow);
  }

  match = path.match(/^\\/api\\/workflows\\/([^/]+)\\/run$/);
  if (method === "POST" && match) {
    const workflow = state.workflows.find((item) => item.id === match[1]);
    if (!workflow) return error("Workflow bulunamadi.", 404);
    if (workflow.status !== "published") return error("Yalnizca yayindaki otomasyonlar calistirilabilir.");
    const body = await readJson(request);
    const configuredApprovalStep = (workflow.steps || []).findIndex((step) => step.requiresApproval || step.type === "approval.wait" || step.riskLevel === "critical");
    const requiresApproval = workflow.id === "wf_invoice" || workflow.id === "wf_customs" || workflow.category === "genel" || configuredApprovalStep >= 0;
    const queueItemId = id("qitem");
    const totalSteps = Math.max(1, (workflow.steps || []).length);
    const job = { id: id("job"), organizationId: ORG_ID, workflowId: workflow.id, queueItemId, workerId: WORKER_ID, status: requiresApproval ? "waiting_approval" : "succeeded", retryCount: 0, maxRetries: 2, currentStepIndex: requiresApproval ? Math.max(0, configuredApprovalStep) : totalSteps, totalSteps, startedAt: now(), completedAt: requiresApproval ? undefined : now(), createdAt: now() };
    state.queueItems.unshift({ id: queueItemId, organizationId: ORG_ID, queueId: QUEUE_ID, workflowId: workflow.id, status: job.status, payloadSummary: body.payloadSummary || "Manuel calistirma", createdAt: job.createdAt });
    state.jobs.unshift(job);
    state.jobLogs.unshift({ id: id("log"), organizationId: ORG_ID, jobId: job.id, ts: now(), level: "info", message: requiresApproval ? "Otomasyon insan onayi bekliyor." : "Otomasyon basariyla tamamlandi." });
    if (requiresApproval) {
      state.approvals.unshift({ id: id("app"), organizationId: ORG_ID, jobId: job.id, title: workflow.name + " icin onay", summary: "Bu otomasyon riskli veya yasal/finansal etkili bir adim iceriyor.", riskLevel: workflow.id === "wf_customs" ? "critical" : "high", status: "pending", diff: [{ label: "Robot ciktisi", before: "Taslak", after: body.payloadSummary || "Demo calistirma" }, { label: "Final aksiyon", before: "Kapali", after: "Onay sonrasi calisacak" }], dueAt: new Date(Date.now() + 86400000).toISOString(), createdAt: now() });
    }
    audit(state, "robot", workflow.name + " icin job olusturuldu: " + job.status + ".", "job", job.id);
    return json(job, 201);
  }

  match = path.match(/^\\/api\\/jobs\\/([^/]+)\\/cancel$/);
  if (method === "POST" && match) {
    const job = state.jobs.find((item) => item.id === match[1]);
    if (!job) return error("Job bulunamadi.", 404);
    job.status = "cancelled";
    job.completedAt = now();
    const queueItem = state.queueItems.find((item) => item.id === job.queueItemId);
    if (queueItem) queueItem.status = "cancelled";
    state.jobLogs.unshift({ id: id("log"), organizationId: ORG_ID, jobId: job.id, ts: now(), level: "warn", message: "Otomasyon kullanici tarafindan iptal edildi." });
    audit(state, "user", "Robot isi iptal edildi.", "job", job.id);
    return json(job);
  }

  match = path.match(/^\\/api\\/approvals\\/([^/]+)\\/(approve|reject)$/);
  if (method === "POST" && match) {
    const approval = state.approvals.find((item) => item.id === match[1]);
    if (!approval) return error("Onay bulunamadi.", 404);
    const approved = match[2] === "approve";
    approval.status = approved ? "approved" : "rejected";
    approval.resolvedAt = now();
    if (approval.jobId) {
      const job = state.jobs.find((item) => item.id === approval.jobId);
      if (job) {
        job.status = approved ? "succeeded" : "failed";
        job.currentStepIndex = approved ? job.totalSteps : job.currentStepIndex;
        job.completedAt = now();
        const queueItem = state.queueItems.find((item) => item.id === job.queueItemId);
        if (queueItem) queueItem.status = job.status;
        state.jobLogs.unshift({ id: id("log"), organizationId: ORG_ID, jobId: job.id, ts: now(), level: approved ? "info" : "error", message: approved ? "Onay alindi; otomasyon tamamlandi." : "Onay reddedildi; otomasyon durduruldu." });
      }
    }
    audit(state, "user", approved ? "Onay gorevi onaylandi." : "Onay gorevi reddedildi.", "approval", approval.id);
    return json(approval);
  }

  if (method === "POST" && path === "/api/documents/upload") {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const type = form?.get("type") || "other";
    const name = typeof file === "object" && file && "name" in file ? file.name : "Yuklenen-Dokuman.pdf";
    const sizeBytes = typeof file === "object" && file && "size" in file ? file.size : 0;
    const doc = { id: id("doc"), organizationId: ORG_ID, name, type, status: "needs_review", source: "upload", mimeType: typeof file === "object" && file && "type" in file ? file.type : "application/octet-stream", sizeBytes, fields: [seedField("party", "Taraf", "Yuklenen dosyadan demo cikarim", 82), seedField("amount", "Tutar", "Dogrulama gerekli", 68), seedField("date", "Tarih", "Dogrulama gerekli", 71)], createdAt: now() };
    state.documents.unshift(doc);
    state.approvals.unshift({ id: id("app"), organizationId: ORG_ID, documentId: doc.id, title: doc.name + " alan dogrulamasi", summary: "Yuklenen dokumanda dusuk guvenli alanlar var.", riskLevel: "medium", status: "pending", diff: doc.fields.map((field) => ({ label: field.label, before: "Yuklenen dosya", after: field.value + " (%" + field.confidence + ")" })), dueAt: new Date(Date.now() + 43200000).toISOString(), createdAt: now() });
    audit(state, "ai", doc.name + " yayin demo API'sinde islendi.", "document", doc.id);
    return json(doc, 201);
  }

  if (method === "POST" && path === "/api/opportunities") {
    const body = await readJson(request);
    const item = opportunity(body.title || "Yeni KOBI otomasyonu", body.department || "Operasyon", Number(body.monthlyVolume || 120), Number(body.minutesPerTask || 7), Number(body.errorRisk || 3), Number(body.feasibility || 80), "fikir", now());
    state.opportunities.unshift(item);
    audit(state, "user", "Yeni otomasyon fikri olusturuldu.", "opportunity", item.id);
    return json(item, 201);
  }

  if (method === "POST" && path === "/api/connectors") {
    const body = await readJson(request);
    if (/(e[-\\s]?imza|pin|sms|otp|banka|mobil imza)/i.test(body.name || "")) return error("E-imza PIN'i, OTP, SMS kodu ve banka sifresi saklanamaz.");
    const credentialId = id("cred");
    const username = String(body.username || "");
    const usernamePreview = username ? username.slice(0, 2) + "***" : undefined;
    const connector = { id: id("con"), organizationId: ORG_ID, type: body.type || "portal", name: body.name || "ERP Hesabi", status: "connected", secretPreview: "********", loginUrl: body.loginUrl, usernamePreview, credentialId, createdAt: now() };
    state.connectors.unshift(connector);
    state.credentialProfiles.unshift({ id: credentialId, connectorId: connector.id, label: connector.name + " hesabi", loginUrl: connector.loginUrl, usernamePreview, createdAt: now() });
    audit(state, "user", connector.name + " onizleme profili eklendi; parola Sites ortaminda saklanmadi.", "connector", connector.id);
    return json(connector, 201);
  }

  if (method === "POST" && path === "/api/compliance/policies") {
    const body = await readJson(request);
    const policy = { id: id("pol"), organizationId: ORG_ID, name: body.name || "Yeni saklama kurali", description: body.description || "Operasyonel saklama ve audit kontrolu.", enabled: true, policyType: body.policyType || "retention", createdAt: now() };
    state.policies.unshift(policy);
    audit(state, "user", policy.name + " politikasi eklendi.", "policy", policy.id);
    return json(policy, 201);
  }

  if (method === "POST" && path === "/api/files") {
    const file = makeCustomsFile(880 + state.files.length + 1);
    state.files.unshift(file);
    return json(file, 201);
  }

  match = path.match(/^\\/api\\/files\\/([^/]+)$/);
  if (method === "GET" && match) {
    const file = state.files.find((item) => item.id === match[1]);
    return file ? json(file) : error("Dosya bulunamadi.", 404);
  }

  match = path.match(/^\\/api\\/files\\/([^/]+)\\/field$/);
  if (method === "PATCH" && match) {
    const file = state.files.find((item) => item.id === match[1]);
    if (!file) return error("Dosya bulunamadi.", 404);
    const body = await readJson(request);
    const doc = file.documents.find((item) => item.type === body.documentType);
    const field = doc?.fields.find((item) => item.key === body.key);
    if (!field) return error("Alan bulunamadi.", 404);
    field.value = body.value || field.value;
    field.confidence = body.confidence || Math.max(field.confidence, 96);
    file.auditLog.unshift({ ts: now(), actor: "user", action: field.label + " alani dogrulandi/guncellendi." });
    return json(file);
  }

  match = path.match(/^\\/api\\/files\\/([^/]+)\\/select-gtip$/);
  if (method === "POST" && match) {
    const file = state.files.find((item) => item.id === match[1]);
    if (!file) return error("Dosya bulunamadi.", 404);
    const body = await readJson(request);
    const item = file.lineItems.find((line) => line.id === body.lineItemId);
    if (!item) return error("Kalem bulunamadi.", 404);
    item.selectedGtip = body.code;
    file.auditLog.unshift({ ts: now(), actor: "user", action: item.description + " icin " + body.code + " GTIP kodu secildi." });
    return json(file);
  }

  match = path.match(/^\\/api\\/files\\/([^/]+)\\/(approve-validation|tax|submit|log)$/);
  if (method === "POST" && match) {
    const file = state.files.find((item) => item.id === match[1]);
    if (!file) return error("Dosya bulunamadi.", 404);
    const action = match[2];
    if (action === "log") {
      const body = await readJson(request);
      file.auditLog.unshift({ ts: now(), actor: body.actor || "bot", action: body.action || "Robot demo adimi kaydedildi." });
      return json(file);
    }
    if (action === "approve-validation" || action === "tax") {
      file.status = "islemde";
      file.taxResult = calculateTax(file);
      file.auditLog.unshift({ ts: now(), actor: action === "tax" ? "ai" : "user", action: "Vergi ve harc hesabi uretildi." });
      return json(file);
    }
    file.status = "tamamlandi";
    file.communicationHistory.unshift({ ts: now(), channel: "email", message: file.customer + " icin " + file.id + " numarali beyanname insan onayiyla tamamlandi." });
    file.auditLog.unshift({ ts: now(), actor: "user", action: "Dosya portala gonderilmis olarak isaretlendi." });
    return json(file);
  }

  return error("API yolu bulunamadi.", 404);
}

function serveAsset(pathname) {
  const asset = ASSETS.get(pathname) || ASSETS.get(pathname.replace(/\\/$/, ""));
  if (!asset) return null;
  const [contentType, base64] = asset;
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      "cache-control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, url);
    return serveAsset(url.pathname) || serveAsset("/index.html") || new Response("OtoFlow AI", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
`;

await mkdir(serverDir, { recursive: true });
await writeFile(join(serverDir, "index.js"), workerSource);
