import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  ApprovalTask,
  AuditActor,
  AuditEvent,
  AutomationDraft,
  AutomationOpportunity,
  CompliancePolicy,
  ConnectorAccount,
  CredentialVaultItem,
  DocumentRecord,
  Job,
  JobRunLog,
  ManualSubscription,
  Membership,
  Organization,
  Plan,
  Queue,
  QueueItem,
  RecorderEvent,
  RecordingSession,
  RetentionRule,
  SaasDashboard,
  User,
  Workflow,
  WorkflowStep,
  WorkflowVersion
} from "../shared/saasTypes";

interface SaasState {
  organizations: Organization[];
  users: User[];
  memberships: Membership[];
  plans: Plan[];
  subscriptions: ManualSubscription[];
  opportunities: AutomationOpportunity[];
  workflows: Workflow[];
  workflowVersions: WorkflowVersion[];
  workers: import("../shared/saasTypes").RobotWorker[];
  queues: Queue[];
  queueItems: QueueItem[];
  jobs: Job[];
  jobLogs: JobRunLog[];
  approvals: ApprovalTask[];
  documents: DocumentRecord[];
  connectors: ConnectorAccount[];
  credentials: CredentialVaultItem[];
  policies: CompliancePolicy[];
  consents: import("../shared/saasTypes").ConsentRecord[];
  retentionRules: RetentionRule[];
  audit: AuditEvent[];
  recordingSessions: RecordingSession[];
  recorderEvents: RecorderEvent[];
  automationDrafts: AutomationDraft[];
}

const dataDir = path.resolve(process.cwd(), "data");
const dbPath = process.env.SAAS_DATABASE_PATH ? path.resolve(process.env.SAAS_DATABASE_PATH) : path.join(dataDir, "otoflow-saas.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

const DEFAULT_ORG_ID = "org_demo_kobi";
const DEFAULT_USER_ID = "usr_hikmet";
const DEFAULT_WORKER_ID = "wrk_cloud_01";
const DEFAULT_QUEUE_ID = "que_kobi_ops";

const sensitiveSecretPattern = /(e[-\s]?imza|pin|sms|otp|tek kullanımlık|banka|mobil imza|elektronik imza)/i;

function seedState(): SaasState {
  const createdAt = now();
  const workflows = buildSeedWorkflows(createdAt);
  const workflowVersions = workflows.map((workflow, index) => ({
    id: workflow.currentVersionId,
    workflowId: workflow.id,
    version: 1,
    steps: seedSteps(index),
    publishedAt: workflow.status === "published" ? createdAt : undefined
  }));

  return {
    organizations: [
      {
        id: DEFAULT_ORG_ID,
        name: "Demo KOBİ Operasyon A.Ş.",
        taxNumber: "1234567890",
        sector: "Genel KOBİ Hizmetleri",
        createdAt
      }
    ],
    users: [
      {
        id: DEFAULT_USER_ID,
        name: "Hikmet Operasyon",
        email: "hikmet@otoflow.demo",
        createdAt
      }
    ],
    memberships: [{ id: "mem_owner", organizationId: DEFAULT_ORG_ID, userId: DEFAULT_USER_ID, role: "owner" }],
    plans: [
      { code: "starter", name: "Başlangıç", monthlyPriceTRY: 2990, limits: { workflows: 5, monthlyJobs: 150, documents: 250, connectors: 3 } },
      { code: "pro", name: "Pro", monthlyPriceTRY: 7990, limits: { workflows: 25, monthlyJobs: 1200, documents: 2500, connectors: 12 } },
      { code: "agency", name: "Ajans", monthlyPriceTRY: 19900, limits: { workflows: 100, monthlyJobs: 8000, documents: 15000, connectors: 40 } }
    ],
    subscriptions: [
      {
        id: "sub_demo",
        organizationId: DEFAULT_ORG_ID,
        planCode: "pro",
        status: "active",
        renewalNote: "Manuel faturalama - aylık cari mutabakat sonrası yenilenir.",
        currentPeriodEnd: "2026-08-07"
      }
    ],
    opportunities: [
      makeOpportunity("Fatura eklerini oku ve tabloya işle", "Finans", 420, 6, 3, 88, "hazir", createdAt),
      makeOpportunity("Portal siparişlerini indir ve raporla", "Operasyon", 260, 8, 4, 82, "analiz", createdAt),
      makeOpportunity("Cari mutabakat e-postası hazırla", "Muhasebe", 180, 10, 4, 77, "fikir", createdAt),
      makeOpportunity("Gümrük dosyası belge doğrulama", "Lojistik", 95, 18, 5, 73, "hazir", createdAt)
    ],
    workflows,
    workflowVersions,
    workers: [{ id: DEFAULT_WORKER_ID, organizationId: DEFAULT_ORG_ID, name: "Bulut Robot 01", runtime: "cloud", status: "idle", lastSeenAt: createdAt }],
    queues: [{ id: DEFAULT_QUEUE_ID, organizationId: DEFAULT_ORG_ID, name: "KOBİ Operasyon Kuyruğu", description: "Web/API/doküman işleri için varsayılan robot kuyruğu.", createdAt }],
    queueItems: [],
    jobs: [],
    jobLogs: [],
    approvals: [
      {
        id: "app_seed_01",
        organizationId: DEFAULT_ORG_ID,
        title: "Cari mutabakat e-postası gönderimi",
        summary: "Müşteriye gönderilecek yasal bağlayıcı e-posta için insan onayı bekleniyor.",
        riskLevel: "high",
        status: "pending",
        diff: [
          { label: "Alıcı", before: "Taslak", after: "musteri@example.com" },
          { label: "Tutar", before: "Belirsiz", after: "124.500 TL" }
        ],
        dueAt: "2026-07-08T12:00:00.000Z",
        createdAt
      }
    ],
    documents: [
      {
        id: "doc_seed_invoice",
        organizationId: DEFAULT_ORG_ID,
        name: "Fatura-2026-0881.pdf",
        type: "invoice",
        status: "needs_review",
        fields: [
          { id: "fld_01", key: "supplier", label: "Tedarikçi", value: "ABC Tedarik Ltd.", confidence: 96, verified: true },
          { id: "fld_02", key: "total", label: "Toplam Tutar", value: "48.320 TL", confidence: 74, verified: false },
          { id: "fld_03", key: "due_date", label: "Vade", value: "2026-07-28", confidence: 91, verified: false }
        ],
        createdAt
      }
    ],
    connectors: [
      { id: "con_email", organizationId: DEFAULT_ORG_ID, type: "email", name: "Operasyon E-posta", status: "connected", secretPreview: "•••• demo", createdAt },
      { id: "con_sheet", organizationId: DEFAULT_ORG_ID, type: "google_sheets", name: "Finans Tablosu", status: "needs_attention", secretPreview: "OAuth gerekli", createdAt }
    ],
    credentials: [],
    policies: [
      {
        id: "pol_approval",
        organizationId: DEFAULT_ORG_ID,
        name: "Riskli işlemlerde insan onayı",
        description: "Para transferi, resmi beyan, müşteri iletişimi ve yasal bağlayıcı gönderimler onaysız çalışmaz.",
        enabled: true,
        policyType: "approval_gate",
        createdAt
      },
      {
        id: "pol_secret",
        organizationId: DEFAULT_ORG_ID,
        name: "E-imza ve banka secret yasağı",
        description: "E-imza PIN'i, OTP, SMS kodu, banka şifresi ve kişisel elektronik imza credential olarak saklanamaz.",
        enabled: true,
        policyType: "secret_block",
        createdAt
      },
      {
        id: "pol_audit",
        organizationId: DEFAULT_ORG_ID,
        name: "Tam audit izi",
        description: "Robot, kullanıcı, AI ve sistem olayları tenant bazlı audit log'a yazılır.",
        enabled: true,
        policyType: "audit",
        createdAt
      }
    ],
    consents: [
      {
        id: "consent_demo",
        organizationId: DEFAULT_ORG_ID,
        subject: "Demo KOBİ Operasyon A.Ş.",
        purpose: "RPA süreç otomasyonu ve operasyonel kayıt işleme",
        legalBasis: "Sözleşmenin kurulması/ifası ve meşru menfaat",
        acceptedAt: createdAt
      }
    ],
    retentionRules: [
      { id: "ret_docs", organizationId: DEFAULT_ORG_ID, dataType: "Dokümanlar", retentionDays: 730, action: "archive", enabled: true },
      { id: "ret_logs", organizationId: DEFAULT_ORG_ID, dataType: "Robot logları", retentionDays: 365, action: "delete", enabled: true }
    ],
    audit: [
      {
        id: "aud_seed",
        organizationId: DEFAULT_ORG_ID,
        ts: createdAt,
        actor: "system",
        action: "KOBİ SaaS demo tenant, uyum politikaları ve robot kuyruğu oluşturuldu.",
        entityType: "organization",
        entityId: DEFAULT_ORG_ID
      }
    ],
    recordingSessions: [
      {
        id: "rec_seed_daily_report",
        organizationId: DEFAULT_ORG_ID,
        title: "Günlük portal raporu ve e-posta",
        goal: "Portal raporunu indir, özetle ve müşteriye onaylı e-posta hazırla.",
        appName: "Demo Portal + E-posta",
        status: "analyzed",
        screenRecordingStatus: "captured",
        eventCount: 8,
        createdAt,
        updatedAt: createdAt
      }
    ],
    recorderEvents: [],
    automationDrafts: [
      {
        id: "draft_seed_daily_report",
        organizationId: DEFAULT_ORG_ID,
        recordingSessionId: "rec_seed_daily_report",
        title: "Günlük portal raporu ve e-posta otomasyonu",
        objective: "Kullanıcının yaptığı portal raporu alma, özetleme ve e-posta taslağı hazırlama işini tekrar çalıştırılabilir otomasyona çevirir.",
        confidence: 86,
        status: "draft",
        steps: [
          { id: "dst_1", type: "browser.navigate", title: "Portala giriş sayfasını aç", description: "Kullanıcının seçtiği iş uygulamasına gider.", requiresApproval: false, riskLevel: "medium" },
          { id: "dst_2", type: "browser.click", title: "Raporlar sekmesine geç", description: "Rapor menüsünü açar ve ilgili raporu seçer.", requiresApproval: false, riskLevel: "low" },
          { id: "dst_3", type: "browser.extract", title: "Rapor satırlarını oku", description: "Tablodaki tutar, müşteri ve tarih alanlarını çıkarır.", requiresApproval: false, riskLevel: "medium" },
          { id: "dst_4", type: "email.draft", title: "E-posta taslağı hazırla", description: "Rapor özetini müşteri e-postasına dönüştürür.", requiresApproval: false, riskLevel: "medium" },
          { id: "dst_5", type: "approval.wait", title: "Gönderim onayı bekle", description: "Müşteri iletişimi olduğu için insan onayı ister.", requiresApproval: true, riskLevel: "high" },
          { id: "dst_6", type: "email.send_after_approval", title: "Onay sonrası gönder", description: "Onaydan sonra e-postayı gönderir.", requiresApproval: true, riskLevel: "high" }
        ],
        variables: [
          { key: "reportDate", label: "Rapor tarihi", example: "Bugün", source: "Rapor filtre alanı" },
          { key: "recipientEmail", label: "Alıcı e-postası", example: "musteri@example.com", source: "E-posta alıcı alanı" }
        ],
        approvalGates: [{ title: "E-posta gönderimi", reason: "Müşteri iletişimi yasal/ticari sonuç doğurabilir.", riskLevel: "high" }],
        subAutomations: [
          { name: "Portala giriş", purpose: "Uygulamaya giriş ve oturum hazırlığı", stepIds: ["dst_1"] },
          { name: "Rapor hazırlama", purpose: "Sekme dolaşımı, filtre ve rapor çıkarımı", stepIds: ["dst_2", "dst_3"] },
          { name: "E-posta hazırlama", purpose: "Özet ve gönderim onayı", stepIds: ["dst_4", "dst_5", "dst_6"] }
        ],
        createdAt
      }
    ]
  };
}

function buildSeedWorkflows(createdAt: string): Workflow[] {
  return [
    {
      id: "wf_invoice",
      organizationId: DEFAULT_ORG_ID,
      name: "Fatura ekinden veri çıkar ve tabloya işle",
      category: "finans",
      status: "published",
      trigger: "E-posta eki geldiğinde",
      description: "Fatura PDF'lerini okur, düşük güvenli alanları onaya gönderir, onaydan sonra tabloya işler.",
      currentVersionId: "wfv_invoice_1",
      createdAt
    },
    {
      id: "wf_portal",
      organizationId: DEFAULT_ORG_ID,
      name: "Web portal siparişlerini indir",
      category: "operasyon",
      status: "published",
      trigger: "Hafta içi 09:00",
      description: "Web portalına girer, sipariş listesini indirir, rapor üretir ve webhook'a gönderir.",
      currentVersionId: "wfv_portal_1",
      createdAt
    },
    {
      id: "wf_reconcile",
      organizationId: DEFAULT_ORG_ID,
      name: "Cari mutabakat e-postası hazırla",
      category: "finans",
      status: "draft",
      trigger: "Manuel başlat",
      description: "Cari veriyi özetler, e-posta taslağı üretir, gönderim için insan onayı bekler.",
      currentVersionId: "wfv_reconcile_1",
      createdAt
    },
    {
      id: "wf_customs",
      organizationId: DEFAULT_ORG_ID,
      name: "Gümrük/lojistik dosyası doğrula",
      category: "gümrük",
      status: "published",
      trigger: "Dosya yüklendiğinde",
      description: "Fatura, çeki listesi ve konşimento alanlarını çıkarır; GTİP/vergi önerisini insan onayına sunar.",
      currentVersionId: "wfv_customs_1",
      createdAt
    }
  ];
}

function seedSteps(index: number): WorkflowStep[] {
  const common = [
    { id: id("step"), type: "document.extract" as const, title: "Dokümanı oku", description: "PDF/görsel alanlarını confidence skoruyla çıkar.", requiresApproval: false, riskLevel: "medium" as const },
    { id: id("step"), type: "approval.wait" as const, title: "Düşük güvenli alanları onaylat", description: "Confidence <%80 alanlarda iş kutusuna görev aç.", requiresApproval: true, riskLevel: "high" as const },
    { id: id("step"), type: "table.append" as const, title: "Tabloya işle", description: "Onaylanan çıktıyı finans tablosuna ekle.", requiresApproval: false, riskLevel: "low" as const }
  ];

  if (index === 1) {
    return [
      { id: id("step"), type: "browser.navigate", title: "Portala gir", description: "Bulut robot güvenli oturum ile web portalını açar.", requiresApproval: false, riskLevel: "medium" },
      { id: id("step"), type: "browser.extract", title: "Siparişleri çıkar", description: "Sipariş satırlarını normalize eder.", requiresApproval: false, riskLevel: "medium" },
      { id: id("step"), type: "webhook.emit", title: "Raporu gönder", description: "Sonucu dahili webhook'a iletir.", requiresApproval: false, riskLevel: "low" }
    ];
  }

  if (index === 2) {
    return [
      { id: id("step"), type: "http.request", title: "Cari veriyi al", description: "Muhasebe API'sinden cari özetini alır.", requiresApproval: false, riskLevel: "medium" },
      { id: id("step"), type: "email.draft", title: "E-posta taslağı üret", description: "Mutabakat metnini hazırlar.", requiresApproval: false, riskLevel: "medium" },
      { id: id("step"), type: "email.send_after_approval", title: "Onay sonrası gönder", description: "Müşteri iletişimi olduğu için insan onayı zorunludur.", requiresApproval: true, riskLevel: "high" }
    ];
  }

  if (index === 3) {
    return [
      { id: id("step"), type: "document.extract", title: "Gümrük belgelerini oku", description: "Fatura, çeki listesi ve konşimento alanlarını çıkarır.", requiresApproval: false, riskLevel: "medium" },
      { id: id("step"), type: "approval.wait", title: "GTİP/vergi önerisini onaylat", description: "Resmi beyan öncesi müşavir/operasyon onayı bekler.", requiresApproval: true, riskLevel: "critical" },
      { id: id("step"), type: "webhook.emit", title: "Gönderim paketi hazırla", description: "Canlı portal gönderimi yerine onaylı paket üretir.", requiresApproval: false, riskLevel: "medium" }
    ];
  }

  return common;
}

function makeOpportunity(
  title: string,
  department: string,
  monthlyVolume: number,
  minutesPerTask: number,
  errorRisk: number,
  feasibility: number,
  status: AutomationOpportunity["status"],
  createdAt: string
): AutomationOpportunity {
  const roiScore = Math.round(monthlyVolume * minutesPerTask * (1 + errorRisk / 10) * (feasibility / 100));
  return {
    id: id("opp"),
    organizationId: DEFAULT_ORG_ID,
    title,
    department,
    monthlyVolume,
    minutesPerTask,
    errorRisk,
    feasibility,
    roiScore,
    status,
    createdAt
  };
}

function readState(): SaasState {
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get("saas") as { value: string } | undefined;
  if (!row) {
    const seeded = seedState();
    writeState(seeded);
    return seeded;
  }
  const parsed = JSON.parse(row.value) as SaasState;
  return normalizeState(parsed);
}

function normalizeState(state: SaasState): SaasState {
  let changed = false;
  const ensure = <K extends keyof SaasState>(key: K, fallback: SaasState[K]) => {
    if (!state[key]) {
      state[key] = fallback;
      changed = true;
    }
  };
  ensure("recordingSessions", []);
  ensure("recorderEvents", []);
  ensure("automationDrafts", []);
  if (changed) writeState(state);
  return state;
}

function writeState(state: SaasState): void {
  db.prepare(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run("saas", JSON.stringify(state), now());
}

function tenantState(state: SaasState, organizationId: string): SaasState {
  return {
    ...state,
    organizations: state.organizations.filter((item) => item.id === organizationId),
    memberships: state.memberships.filter((item) => item.organizationId === organizationId),
    subscriptions: state.subscriptions.filter((item) => item.organizationId === organizationId),
    opportunities: state.opportunities.filter((item) => item.organizationId === organizationId),
    workflows: state.workflows.filter((item) => item.organizationId === organizationId),
    workflowVersions: state.workflowVersions.filter((version) => state.workflows.some((wf) => wf.organizationId === organizationId && wf.id === version.workflowId)),
    workers: state.workers.filter((item) => item.organizationId === organizationId),
    queues: state.queues.filter((item) => item.organizationId === organizationId),
    queueItems: state.queueItems.filter((item) => item.organizationId === organizationId),
    jobs: state.jobs.filter((item) => item.organizationId === organizationId),
    jobLogs: state.jobLogs.filter((item) => item.organizationId === organizationId),
    approvals: state.approvals.filter((item) => item.organizationId === organizationId),
    documents: state.documents.filter((item) => item.organizationId === organizationId),
    connectors: state.connectors.filter((item) => item.organizationId === organizationId),
    credentials: [],
    policies: state.policies.filter((item) => item.organizationId === organizationId),
    consents: state.consents.filter((item) => item.organizationId === organizationId),
    retentionRules: state.retentionRules.filter((item) => item.organizationId === organizationId),
    audit: state.audit.filter((item) => item.organizationId === organizationId)
    ,
    recordingSessions: state.recordingSessions.filter((item) => item.organizationId === organizationId),
    recorderEvents: state.recorderEvents,
    automationDrafts: state.automationDrafts.filter((item) => item.organizationId === organizationId)
  };
}

export function getCurrentContext() {
  const state = readState();
  const organization = state.organizations.find((item) => item.id === DEFAULT_ORG_ID)!;
  const user = state.users.find((item) => item.id === DEFAULT_USER_ID)!;
  const membership = state.memberships.find((item) => item.organizationId === organization.id && item.userId === user.id)!;
  const subscription = state.subscriptions.find((item) => item.organizationId === organization.id)!;
  const plan = state.plans.find((item) => item.code === subscription.planCode)!;
  return { organization, user, membership, subscription, plan };
}

export function getDashboard(): SaasDashboard {
  const state = readState();
  const context = getCurrentContext();
  const scoped = tenantState(state, context.organization.id);
  const succeeded = scoped.jobs.filter((job) => job.status === "succeeded").length;
  const finished = scoped.jobs.filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status)).length;
  const usage = {
    workflows: scoped.workflows.length,
    monthlyJobs: scoped.jobs.length,
    documents: scoped.documents.length,
    connectors: scoped.connectors.length
  };

  return {
    ...context,
    usage,
    kpis: {
      savedHours: Math.round(scoped.opportunities.reduce((sum, item) => sum + (item.monthlyVolume * item.minutesPerTask) / 60, 0)),
      successRate: finished === 0 ? 100 : Math.round((succeeded / finished) * 100),
      pendingApprovals: scoped.approvals.filter((item) => item.status === "pending").length,
      slaBreaches: scoped.approvals.filter((item) => item.status === "pending" && new Date(item.dueAt).getTime() < Date.now()).length,
      activeRobots: scoped.workers.filter((item) => item.status !== "offline").length
    },
    opportunities: scoped.opportunities,
    workflows: scoped.workflows,
    jobs: scoped.jobs,
    approvals: scoped.approvals,
    documents: scoped.documents,
    connectors: scoped.connectors,
    policies: scoped.policies,
    audit: scoped.audit.slice(0, 80),
    workers: scoped.workers,
    recordingSessions: scoped.recordingSessions,
    recorderEvents: scoped.recorderEvents.filter((event) => scoped.recordingSessions.some((session) => session.id === event.target || event.target.includes(session.id))),
    automationDrafts: scoped.automationDrafts
  };
}

export function listRecordings() {
  const state = tenantState(readState(), DEFAULT_ORG_ID);
  return state.recordingSessions.map((session) => ({
    ...session,
    events: readState().recorderEvents.filter((event) => event.target.startsWith(`${session.id}:`)),
    draft: state.automationDrafts.find((draft) => draft.recordingSessionId === session.id)
  }));
}

export function createRecordingSession(input: { title: string; goal: string; appName: string }) {
  const state = readState();
  const ts = now();
  const session: RecordingSession = {
    id: id("rec"),
    organizationId: DEFAULT_ORG_ID,
    title: input.title,
    goal: input.goal,
    appName: input.appName,
    status: "recording",
    screenRecordingStatus: "not_started",
    eventCount: 0,
    createdAt: ts,
    updatedAt: ts
  };
  state.recordingSessions.unshift(session);
  audit(state, "user", `${session.title} için iş kaydı başlatıldı.`, "recording_session", session.id);
  writeState(state);
  return session;
}

export function appendRecordingEvent(sessionId: string, input: Omit<RecorderEvent, "id" | "ts">) {
  const state = readState();
  const session = findTenantRecord(state.recordingSessions, sessionId);
  const event: RecorderEvent = {
    id: id("evt"),
    ts: now(),
    ...input,
    target: `${session.id}:${input.target}`
  };
  state.recorderEvents.push(event);
  session.eventCount += 1;
  session.updatedAt = event.ts;
  if (input.type === "screen.start") session.screenRecordingStatus = "recording";
  if (input.type === "screen.stop") session.screenRecordingStatus = "captured";
  audit(state, "system", `Recorder olayı yakalandı: ${event.label}.`, "recording_event", event.id);
  writeState(state);
  return event;
}

export function analyzeRecording(sessionId: string) {
  const state = readState();
  const session = findTenantRecord(state.recordingSessions, sessionId);
  const events = state.recorderEvents.filter((event) => event.target.startsWith(`${session.id}:`));
  const draft = buildAutomationDraft(session, events);
  state.automationDrafts = state.automationDrafts.filter((item) => item.recordingSessionId !== session.id);
  state.automationDrafts.unshift(draft);
  session.status = "analyzed";
  session.updatedAt = now();
  audit(state, "ai", `${session.title} kaydı analiz edildi ve otomasyon taslağı üretildi.`, "automation_draft", draft.id);
  writeState(state);
  return draft;
}

export function publishAutomationDraft(draftId: string) {
  const state = readState();
  const draft = findTenantRecord(state.automationDrafts, draftId);
  const ts = now();
  const workflowId = id("wf");
  const versionId = id("wfv");
  const workflow: Workflow = {
    id: workflowId,
    organizationId: DEFAULT_ORG_ID,
    name: draft.title,
    category: "genel",
    status: "published",
    trigger: "Recorder Studio kaydından üretildi",
    description: draft.objective,
    currentVersionId: versionId,
    createdAt: ts
  };
  const version: WorkflowVersion = {
    id: versionId,
    workflowId,
    version: 1,
    steps: draft.steps,
    publishedAt: ts
  };
  state.workflows.unshift(workflow);
  state.workflowVersions.unshift(version);
  draft.status = "published";
  draft.publishedWorkflowId = workflow.id;
  const session = state.recordingSessions.find((item) => item.id === draft.recordingSessionId);
  if (session) {
    session.status = "published";
    session.updatedAt = ts;
  }
  audit(state, "user", `${draft.title} workflow olarak yayına alındı.`, "workflow", workflow.id);
  writeState(state);
  return workflow;
}

function buildAutomationDraft(session: RecordingSession, events: RecorderEvent[]): AutomationDraft {
  const hasLogin = events.some((event) => event.type === "app.login");
  const hasReport = events.some((event) => event.type.startsWith("report."));
  const hasEmail = events.some((event) => event.type.startsWith("email."));
  const hasDownload = events.some((event) => event.type === "file.download");
  const hasNavigation = events.some((event) => event.type === "navigation" || event.type === "tab.switch");
  const steps: WorkflowStep[] = [];

  if (hasLogin) steps.push(makeStep("browser.navigate", "Uygulamaya giriş yap", "Kullanıcının kaydettiği uygulama giriş akışını tekrarlar.", false, "medium"));
  if (hasNavigation) steps.push(makeStep("browser.click", "Sekmeler arasında dolaş", "Kayıtta görülen menü/sekme geçişlerini kararlı selector önerileriyle uygular.", false, "low"));
  if (hasReport) {
    steps.push(makeStep("browser.extract", "Raporu filtrele ve oku", "Rapor ekranındaki filtreleri uygular, tablo verilerini çıkarır.", false, "medium"));
    if (hasDownload) steps.push(makeStep("browser.click", "Raporu indir", "Kullanıcının indirdiği raporu tekrar üretir ve dosyayı kaydeder.", false, "medium"));
  }
  if (hasEmail) {
    steps.push(makeStep("email.draft", "E-posta özetini hazırla", "Okunan rapor veya e-postaları kısa müşteri/ekip özetine dönüştürür.", false, "medium"));
    steps.push(makeStep("approval.wait", "Gönderim için insan onayı bekle", "Müşteri iletişimi olduğu için final gönderim onaysız çalışmaz.", true, "high"));
    steps.push(makeStep("email.send_after_approval", "Onay sonrası e-postayı gönder", "Onay alındıktan sonra e-posta gönderimini tamamlar.", true, "high"));
  }
  if (steps.length === 0) {
    steps.push(makeStep("browser.click", "Kaydedilen tıklamaları tekrar et", "Kayıttaki temel tıklama ve form adımlarını otomasyon taslağına çevirir.", false, "medium"));
  }

  const variables = [
    ...uniqueEvents(events, "input").map((event, index) => ({ key: `input_${index + 1}`, label: event.label, example: event.value ?? "Kullanıcı girişi", source: event.appArea })),
    ...uniqueEvents(events, "report.filter").map((event, index) => ({ key: `filter_${index + 1}`, label: event.label, example: event.value ?? "Filtre", source: "Rapor filtresi" })),
    ...uniqueEvents(events, "email.draft").map((event, index) => ({ key: `email_${index + 1}`, label: event.label, example: event.value ?? "E-posta taslağı", source: "E-posta ekranı" }))
  ].slice(0, 8);

  const stepIds = steps.map((step) => step.id);
  const subAutomations = [
    ...(hasLogin ? [{ name: "Uygulamaya giriş", purpose: "Login ve oturum hazırlığı", stepIds: stepIds.slice(0, 1) }] : []),
    ...(hasReport ? [{ name: "Rapor hazırlama", purpose: "Sekme dolaşımı, filtreleme, rapor okuma ve indirme", stepIds: stepIds.filter((_, index) => index <= 3) }] : []),
    ...(hasEmail ? [{ name: "E-posta özeti ve gönderim", purpose: "Özet üretimi, insan onayı ve gönderim", stepIds: stepIds.slice(-3) }] : []),
    { name: "Uçtan uca süreç", purpose: "Kaydedilen küçük otomasyonların birleşik akışı", stepIds }
  ];

  return {
    id: id("draft"),
    organizationId: DEFAULT_ORG_ID,
    recordingSessionId: session.id,
    title: `${session.title} otomasyonu`,
    objective: session.goal,
    confidence: Math.min(94, Math.max(68, 62 + events.length * 4)),
    status: "draft",
    steps,
    variables,
    approvalGates: hasEmail
      ? [{ title: "E-posta gönderimi", reason: "Müşteri veya üçüncü kişi iletişimi insan onayı gerektirir.", riskLevel: "high" }]
      : [],
    subAutomations,
    createdAt: now()
  };
}

function makeStep(type: WorkflowStep["type"], title: string, description: string, requiresApproval: boolean, riskLevel: WorkflowStep["riskLevel"]): WorkflowStep {
  return { id: id("step"), type, title, description, requiresApproval, riskLevel };
}

function uniqueEvents(events: RecorderEvent[], type: RecorderEvent["type"]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (event.type !== type || seen.has(event.label)) return false;
    seen.add(event.label);
    return true;
  });
}

export function getWorkflows() {
  const state = readState();
  const scoped = tenantState(state, DEFAULT_ORG_ID);
  return scoped.workflows.map((workflow) => ({
    ...workflow,
    version: scoped.workflowVersions.find((version) => version.id === workflow.currentVersionId)
  }));
}

export function createOpportunity(input: Pick<AutomationOpportunity, "title" | "department" | "monthlyVolume" | "minutesPerTask" | "errorRisk" | "feasibility">) {
  const state = readState();
  const opportunity = makeOpportunity(input.title, input.department, input.monthlyVolume, input.minutesPerTask, input.errorRisk, input.feasibility, "fikir", now());
  state.opportunities.unshift(opportunity);
  audit(state, "user", "Yeni otomasyon fikri oluşturuldu.", "opportunity", opportunity.id);
  writeState(state);
  return opportunity;
}

export function publishWorkflow(workflowId: string) {
  const state = readState();
  const workflow = findTenantRecord(state.workflows, workflowId);
  workflow.status = "published";
  const version = state.workflowVersions.find((item) => item.id === workflow.currentVersionId);
  if (version) version.publishedAt = now();
  audit(state, "user", `${workflow.name} yayına alındı.`, "workflow", workflow.id);
  writeState(state);
  return workflow;
}

export function runWorkflow(workflowId: string, payloadSummary = "Manuel test çalıştırması") {
  const state = readState();
  const dashboard = getDashboard();
  if (dashboard.usage.monthlyJobs >= dashboard.plan.limits.monthlyJobs) {
    throw new Error("Plan limiti aşıldı: aylık robot işi sınırına ulaşıldı.");
  }

  const workflow = findTenantRecord(state.workflows, workflowId);
  if (workflow.status !== "published") {
    throw new Error("Yalnızca yayındaki otomasyonlar çalıştırılabilir.");
  }

  const version = state.workflowVersions.find((item) => item.id === workflow.currentVersionId);
  const requiresApproval = version?.steps.some((step) => step.requiresApproval || step.riskLevel === "critical") ?? false;
  const createdAt = now();
  const queueItem: QueueItem = {
    id: id("qitem"),
    organizationId: DEFAULT_ORG_ID,
    queueId: DEFAULT_QUEUE_ID,
    workflowId: workflow.id,
    status: "queued",
    payloadSummary,
    createdAt
  };
  const job: Job = {
    id: id("job"),
    organizationId: DEFAULT_ORG_ID,
    workflowId: workflow.id,
    queueItemId: queueItem.id,
    workerId: DEFAULT_WORKER_ID,
    status: requiresApproval ? "waiting_approval" : "succeeded",
    retryCount: 0,
    maxRetries: 2,
    startedAt: createdAt,
    completedAt: requiresApproval ? undefined : createdAt,
    createdAt
  };

  queueItem.status = job.status;
  state.queueItems.unshift(queueItem);
  state.jobs.unshift(job);
  state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: createdAt, level: "info", message: `${workflow.name} bulut robota alındı.` });
  state.jobLogs.unshift({
    id: id("log"),
    organizationId: DEFAULT_ORG_ID,
    jobId: job.id,
    ts: createdAt,
    level: requiresApproval ? "warn" : "info",
    message: requiresApproval ? "Policy gate tetiklendi: insan onayı bekleniyor." : "Robot işi başarıyla tamamlandı."
  });

  if (requiresApproval) {
    state.approvals.unshift({
      id: id("app"),
      organizationId: DEFAULT_ORG_ID,
      jobId: job.id,
      title: `${workflow.name} için onay`,
      summary: "Bu otomasyon riskli veya yasal/finansal etkili bir adım içeriyor. İnsan onayı olmadan final aksiyon çalışmaz.",
      riskLevel: version?.steps.some((step) => step.riskLevel === "critical") ? "critical" : "high",
      status: "pending",
      diff: [
        { label: "Robot çıktısı", before: "Taslak", after: payloadSummary },
        { label: "Final aksiyon", before: "Kapalı", after: "Onay sonrası çalışacak" }
      ],
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt
    });
  }

  audit(state, "robot", `${workflow.name} için job oluşturuldu: ${job.status}.`, "job", job.id);
  writeState(state);
  return job;
}

export function cancelJob(jobId: string) {
  const state = readState();
  const job = findTenantRecord(state.jobs, jobId);
  job.status = "cancelled";
  job.completedAt = now();
  state.queueItems = state.queueItems.map((item) => (item.id === job.queueItemId ? { ...item, status: "cancelled" } : item));
  state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId, ts: now(), level: "warn", message: "Job kullanıcı tarafından iptal edildi." });
  audit(state, "user", "Robot işi iptal edildi.", "job", jobId);
  writeState(state);
  return job;
}

export function resolveApproval(approvalId: string, approved: boolean) {
  const state = readState();
  const approval = findTenantRecord(state.approvals, approvalId);
  approval.status = approved ? "approved" : "rejected";
  approval.resolvedAt = now();

  if (approval.jobId) {
    const job = state.jobs.find((item) => item.id === approval.jobId && item.organizationId === DEFAULT_ORG_ID);
    if (job) {
      job.status = approved ? "succeeded" : "failed";
      job.completedAt = now();
      state.queueItems = state.queueItems.map((item) => (item.id === job.queueItemId ? { ...item, status: job.status } : item));
      state.jobLogs.unshift({
        id: id("log"),
        organizationId: DEFAULT_ORG_ID,
        jobId: job.id,
        ts: now(),
        level: approved ? "info" : "error",
        message: approved ? "İnsan onayı alındı; robot final adımı tamamladı." : "İnsan onayı reddedildi; robot işi durduruldu."
      });
    }
  }

  if (approval.documentId && approved) {
    state.documents = state.documents.map((doc) =>
      doc.id === approval.documentId
        ? { ...doc, status: "approved", fields: doc.fields.map((field) => ({ ...field, verified: true, confidence: Math.max(field.confidence, 96) })) }
        : doc
    );
  }

  audit(state, "user", approved ? "Onay görevi onaylandı." : "Onay görevi reddedildi.", "approval", approval.id);
  writeState(state);
  return approval;
}

export function extractDocument(input: { name: string; type: DocumentRecord["type"] }) {
  const state = readState();
  const dashboard = getDashboard();
  if (dashboard.usage.documents >= dashboard.plan.limits.documents) {
    throw new Error("Plan limiti aşıldı: doküman sınırına ulaşıldı.");
  }

  const lowConfidence = input.name.toLocaleLowerCase("tr-TR").includes("mutabakat") || input.type === "invoice";
  const document: DocumentRecord = {
    id: id("doc"),
    organizationId: DEFAULT_ORG_ID,
    name: input.name,
    type: input.type,
    status: lowConfidence ? "needs_review" : "extracted",
    fields: [
      { id: id("fld"), key: "party", label: "Taraf", value: input.type === "customs" ? "ABC Dış Ticaret A.Ş." : "Demo Müşteri Ltd.", confidence: 96, verified: true },
      { id: id("fld"), key: "amount", label: "Tutar", value: input.type === "invoice" ? "48.320 TL" : "12.400 TL", confidence: lowConfidence ? 76 : 92, verified: false },
      { id: id("fld"), key: "date", label: "Tarih", value: "2026-07-07", confidence: 94, verified: false }
    ],
    createdAt: now()
  };
  state.documents.unshift(document);

  if (document.fields.some((field) => field.confidence < 80)) {
    state.approvals.unshift({
      id: id("app"),
      organizationId: DEFAULT_ORG_ID,
      documentId: document.id,
      title: `${document.name} alan doğrulaması`,
      summary: "Düşük güvenli doküman alanı bulundu. Onay verilmeden otomasyon final aksiyona geçemez.",
      riskLevel: "medium",
      status: "pending",
      diff: document.fields.map((field) => ({ label: field.label, before: "OCR/AI çıkarımı", after: `${field.value} (%${field.confidence})` })),
      dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      createdAt: now()
    });
  }

  audit(state, "ai", `${document.name} için doküman alanları çıkarıldı.`, "document", document.id);
  writeState(state);
  return document;
}

export function updateDocumentField(documentId: string, fieldId: string, value: string) {
  const state = readState();
  const document = findTenantRecord(state.documents, documentId);
  document.fields = document.fields.map((field) => (field.id === fieldId ? { ...field, value, verified: true, confidence: Math.max(field.confidence, 96) } : field));
  document.status = document.fields.every((field) => field.verified || field.confidence >= 80) ? "approved" : "needs_review";
  audit(state, "user", "Doküman alanı doğrulandı.", "document", document.id);
  writeState(state);
  return document;
}

export function createConnector(input: { type: ConnectorAccount["type"]; name: string; secret: string }) {
  if (sensitiveSecretPattern.test(input.name) || sensitiveSecretPattern.test(input.secret)) {
    throw new Error("Güvenlik politikası: e-imza PIN'i, OTP, SMS kodu, banka şifresi veya kişisel elektronik imza saklanamaz.");
  }

  const state = readState();
  const dashboard = getDashboard();
  if (dashboard.usage.connectors >= dashboard.plan.limits.connectors) {
    throw new Error("Plan limiti aşıldı: bağlayıcı sınırına ulaşıldı.");
  }

  const connector: ConnectorAccount = {
    id: id("con"),
    organizationId: DEFAULT_ORG_ID,
    type: input.type,
    name: input.name,
    status: "connected",
    secretPreview: maskSecret(input.secret),
    createdAt: now()
  };
  state.connectors.unshift(connector);
  state.credentials.unshift({
    id: id("cred"),
    organizationId: DEFAULT_ORG_ID,
    connectorId: connector.id,
    label: `${input.name} secret`,
    encryptedSecret: encryptSecret(input.secret),
    createdAt: now()
  });
  audit(state, "user", `${input.name} bağlayıcısı eklendi ve secret maskelendi.`, "connector", connector.id);
  writeState(state);
  return connector;
}

export function listJobs() {
  const state = readState();
  return tenantState(state, DEFAULT_ORG_ID).jobs.map((job) => ({
    ...job,
    workflow: state.workflows.find((workflow) => workflow.id === job.workflowId),
    logs: state.jobLogs.filter((log) => log.jobId === job.id)
  }));
}

export function listQueues() {
  const state = readState();
  const scoped = tenantState(state, DEFAULT_ORG_ID);
  return scoped.queues.map((queue) => ({
    ...queue,
    items: scoped.queueItems.filter((item) => item.queueId === queue.id)
  }));
}

export function createQueueItem(queueId: string, workflowId: string, payloadSummary: string) {
  const state = readState();
  findTenantRecord(state.queues, queueId);
  findTenantRecord(state.workflows, workflowId);
  const queueItem: QueueItem = {
    id: id("qitem"),
    organizationId: DEFAULT_ORG_ID,
    queueId,
    workflowId,
    status: "queued",
    payloadSummary,
    createdAt: now()
  };
  state.queueItems.unshift(queueItem);
  audit(state, "user", "Kuyruğa yeni iş kalemi eklendi.", "queue_item", queueItem.id);
  writeState(state);
  return queueItem;
}

export function listCompliance() {
  const state = tenantState(readState(), DEFAULT_ORG_ID);
  return {
    policies: state.policies,
    consents: state.consents,
    retentionRules: state.retentionRules,
    audit: state.audit
  };
}

export function createPolicy(input: Pick<CompliancePolicy, "name" | "description" | "policyType">) {
  const state = readState();
  const policy: CompliancePolicy = { id: id("pol"), organizationId: DEFAULT_ORG_ID, enabled: true, createdAt: now(), ...input };
  state.policies.unshift(policy);
  audit(state, "user", `${policy.name} uyum politikası oluşturuldu.`, "policy", policy.id);
  writeState(state);
  return policy;
}

function audit(state: SaasState, actor: AuditActor, action: string, entityType: string, entityId: string) {
  state.audit.unshift({ id: id("aud"), organizationId: DEFAULT_ORG_ID, ts: now(), actor, action, entityType, entityId });
}

function findTenantRecord<T extends { id: string; organizationId: string }>(records: T[], recordId: string): T {
  const record = records.find((item) => item.id === recordId && item.organizationId === DEFAULT_ORG_ID);
  if (!record) throw new Error("Kayıt bulunamadı veya tenant erişimi yok.");
  return record;
}

function maskSecret(secret: string) {
  if (!secret) return "Boş secret";
  return `${"•".repeat(Math.min(8, secret.length))} ${secret.slice(-3)}`;
}

function encryptSecret(secret: string) {
  const key = crypto.createHash("sha256").update(process.env.CREDENTIAL_VAULT_KEY ?? "otoflow-local-development-key").digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}
