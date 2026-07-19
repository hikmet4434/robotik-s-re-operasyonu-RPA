import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { Cron } from "croner";
import type {
  ApprovalTask,
  AgentStepLease,
  AuditActor,
  AuditEvent,
  AiAutomationPlan,
  AiSettings,
  AutomationDraft,
  AutomationPackage,
  AutomationOpportunity,
  CompliancePolicy,
  ConnectorAccount,
  CredentialProfile,
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
  WorkflowSchedule,
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
  llmSettings?: {
    provider: AiSettings["provider"];
    model: string;
    baseUrl: string;
    encryptedApiKey?: string;
    updatedAt: string;
  };
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
const LOCAL_WORKER_ID = "wrk_local_01";

const sensitiveSecretPattern = /(e[-\s]?imza|pin|sms|otp|tek kullanımlık|banka|mobil imza|elektronik imza)/i;
const textLikeMimePattern = /^(text\/|application\/json|application\/csv|text\/csv)/i;

export interface UploadedDocumentInput {
  originalName: string;
  storedFileName: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  type: DocumentRecord["type"];
}

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
    ],
    llmSettings: {
      provider: "template",
      model: "yerel-guvenli-planlayici",
      baseUrl: "",
      updatedAt: createdAt
    }
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
  ensure("credentials", []);
  if (!state.llmSettings) {
    state.llmSettings = { provider: "template", model: "yerel-guvenli-planlayici", baseUrl: "", updatedAt: now() };
    changed = true;
  }
  if (!state.workers.some((worker) => worker.id === LOCAL_WORKER_ID)) {
    state.workers.push({
      id: LOCAL_WORKER_ID,
      organizationId: DEFAULT_ORG_ID,
      name: "Yerel Ajan",
      runtime: "local",
      status: "offline",
      lastSeenAt: new Date(0).toISOString()
    });
    changed = true;
  }
  for (const job of state.jobs) {
    if (typeof job.currentStepIndex !== "number") {
      job.currentStepIndex = job.status === "succeeded" ? 1 : 0;
      changed = true;
    }
    if (typeof job.totalSteps !== "number") {
      const workflow = state.workflows.find((item) => item.id === job.workflowId);
      const version = workflow ? state.workflowVersions.find((item) => item.id === workflow.currentVersionId) : undefined;
      job.totalSteps = version?.steps.length ?? 0;
      changed = true;
    }
  }
  for (const connector of state.connectors) {
    const credential = state.credentials.find((item) => item.connectorId === connector.id);
    if (credential && connector.credentialId !== credential.id) {
      connector.credentialId = credential.id;
      connector.loginUrl = credential.loginUrl;
      connector.usernamePreview = credential.usernamePreview;
      changed = true;
    }
  }
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
  for (const worker of scoped.workers) {
    if (worker.runtime === "local" && Date.now() - new Date(worker.lastSeenAt).getTime() > 45_000) worker.status = "offline";
  }
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
    credentialProfiles: state.credentials
      .filter((item) => item.organizationId === context.organization.id)
      .map(toCredentialProfile),
    policies: scoped.policies,
    audit: scoped.audit.slice(0, 80),
    workers: scoped.workers,
    recordingSessions: scoped.recordingSessions,
    recorderEvents: scoped.recorderEvents.filter((event) => scoped.recordingSessions.some((session) => session.id === event.target || event.target.includes(session.id))),
    automationDrafts: scoped.automationDrafts
  };
}

function toCredentialProfile(item: CredentialVaultItem): CredentialProfile {
  return {
    id: item.id,
    connectorId: item.connectorId,
    label: item.label,
    loginUrl: item.loginUrl,
    usernamePreview: item.usernamePreview,
    createdAt: item.createdAt
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

export function attachRecordingVideo(sessionId: string, input: { fileName: string; mimeType: string; sizeBytes: number }) {
  const state = readState();
  const session = findTenantRecord(state.recordingSessions, sessionId);
  session.videoFileName = input.fileName;
  session.videoMimeType = input.mimeType;
  session.videoSizeBytes = input.sizeBytes;
  session.screenRecordingStatus = "captured";
  session.updatedAt = now();
  audit(state, "user", `${session.title} ekran kaydı güvenli dosya alanına kaydedildi.`, "recording_session", session.id);
  writeState(state);
  return session;
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

export function updateAutomationDraft(
  draftId: string,
  input: { steps: WorkflowStep[]; credentialId?: string; title?: string; objective?: string }
) {
  const state = readState();
  const draft = findTenantRecord(state.automationDrafts, draftId);
  if (input.credentialId) findTenantRecord(state.credentials, input.credentialId);
  draft.steps = input.steps.map((step) => ({
    ...step,
    credentialId: step.credentialId ?? input.credentialId,
    approvalPrompt: step.requiresApproval ? step.approvalPrompt || `${step.title} çalışmadan önce onaylıyor musunuz?` : undefined
  }));
  draft.credentialId = input.credentialId;
  if (input.title) draft.title = input.title;
  if (input.objective) draft.objective = input.objective;
  draft.approvalGates = draft.steps
    .filter((step) => step.requiresApproval || step.type === "approval.wait")
    .map((step) => ({ title: step.title, reason: step.approvalPrompt || step.description, riskLevel: step.riskLevel }));
  audit(state, "user", `${draft.title} için çalışma adımları ve onay noktaları yapılandırıldı.`, "automation_draft", draft.id);
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
    credentialId: draft.credentialId,
    source: "recorder",
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
  const actionableEvents = events.filter((event) => !["screen.start", "screen.stop", "tab.switch"].includes(event.type));
  const steps = actionableEvents.map((event) => stepFromRecorderEvent(event));
  if (steps.length === 0) {
    steps.push(makeStep("browser.wait", "Uygulamanın hazır olmasını bekle", "Kayda çalıştırılabilir olay eklenmedi; teknik kullanıcı bu adımı düzenleyebilir.", false, "low", { timeoutMs: 1000 }));
  }

  const variables = [
    ...uniqueEvents(events, "input")
      .filter((event) => event.value !== "MASKED_SECRET")
      .map((event, index) => ({ key: `input_${index + 1}`, label: event.label, example: event.value ?? "Kullanıcı girişi", source: event.appArea })),
    ...uniqueEvents(events, "report.filter").map((event, index) => ({ key: `filter_${index + 1}`, label: event.label, example: event.value ?? "Filtre", source: "Rapor filtresi" })),
    ...uniqueEvents(events, "email.draft").map((event, index) => ({ key: `email_${index + 1}`, label: event.label, example: event.value ?? "E-posta taslağı", source: "E-posta ekranı" }))
  ].slice(0, 8);

  const stepIds = steps.map((step) => step.id);
  const hasLogin = events.some((event) => event.type === "app.login" || /login|giriş/i.test(event.appArea));
  const hasReport = events.some((event) => event.type.startsWith("report."));
  const hasEmail = events.some((event) => event.type.startsWith("email."));
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
    approvalGates: steps
      .filter((step) => step.requiresApproval)
      .map((step) => ({ title: step.title, reason: step.approvalPrompt || step.description, riskLevel: step.riskLevel })),
    subAutomations,
    createdAt: now()
  };
}

function stepFromRecorderEvent(event: RecorderEvent): WorkflowStep {
  const selector = event.selectorHint && !["local-agent", "display-media"].includes(event.selectorHint) ? event.selectorHint : undefined;
  const common = {
    title: event.label,
    description: `${event.appArea} alanında kaydedilen gerçek kullanıcı adımı.`,
    requiresApproval: false,
    riskLevel: "low" as const
  };

  if (event.type === "navigation") {
    return makeStep("browser.navigate", event.label, common.description, false, "low", { url: event.value || event.target.split(":").slice(1).join(":") });
  }
  if (event.type === "input") {
    const password = event.value === "MASKED_SECRET" || /şifre|sifre|password/i.test(event.label + event.target);
    const username = /kullanıcı|kullanici|username|e-?posta|email/i.test(event.label + event.target) && !password;
    return makeStep("browser.type", event.label, common.description, false, password ? "medium" : "low", {
      selector,
      value: password || username ? undefined : event.value,
      credentialField: password ? "password" : username ? "username" : undefined
    });
  }
  if (event.type === "select" || event.type === "report.filter") {
    const isSelect = selector?.includes("select") || event.type === "select";
    return makeStep(isSelect ? "browser.select" : "browser.type", event.label, common.description, false, "low", {
      selector,
      ...(isSelect ? { option: event.value } : { value: event.value })
    });
  }
  if (event.region && (event.type === "note" || event.selectorHint === "local-agent" || /desktop|screen/i.test(event.target))) {
    return makeStep("desktop.click", event.label, common.description, false, "medium", {
      appName: event.appArea,
      x: Math.round(event.region.x + event.region.w / 2),
      y: Math.round(event.region.y + event.region.h / 2)
    });
  }
  if (event.type === "report.open" || event.type === "report.export" || event.type === "file.download" || event.type === "file.upload") {
    return makeStep("browser.click", event.label, common.description, false, "medium", { selector });
  }
  if (event.type === "email.read" || event.type === "email.summarize") {
    return makeStep("browser.extract", event.label, common.description, false, "medium", { selector, outputKey: `output_${event.id}` });
  }
  if (event.type === "email.draft") {
    return makeStep("browser.type", event.label, common.description, false, "medium", { selector, value: event.value });
  }

  const isFinalAction = event.type === "email.send" || /gönder|onayla|ödeme|beyan/i.test(event.label);
  return makeStep("browser.click", event.label, common.description, isFinalAction, isFinalAction ? "high" : "low", { selector }, isFinalAction ? `${event.label} adımının çalışmasına onay veriyor musunuz?` : undefined);
}

function makeStep(
  type: WorkflowStep["type"],
  title: string,
  description: string,
  requiresApproval: boolean,
  riskLevel: WorkflowStep["riskLevel"],
  parameters?: WorkflowStep["parameters"],
  approvalPrompt?: string
): WorkflowStep {
  return { id: id("step"), type, title, description, requiresApproval, riskLevel, parameters, approvalPrompt };
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

export function getAiSettings(): AiSettings {
  const settings = readState().llmSettings!;
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    hasApiKey: Boolean(settings.encryptedApiKey),
    updatedAt: settings.updatedAt
  };
}

export function getAiRuntimeSettings() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterApiKey) {
    const models = [
      process.env.OPENROUTER_MODEL_PRIMARY || "z-ai/glm-5.2",
      process.env.OPENROUTER_MODEL_FALLBACK_1 || "moonshotai/kimi-k3",
      process.env.OPENROUTER_MODEL_FALLBACK_2 || "deepseek/deepseek-v4-pro"
    ];
    return {
      provider: "openrouter" as const,
      model: models[0],
      models,
      baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      hasApiKey: true,
      updatedAt: now(),
      apiKey: openRouterApiKey
    };
  }
  const settings = readState().llmSettings!;
  return {
    ...getAiSettings(),
    models: [settings.model],
    apiKey: settings.encryptedApiKey ? decryptSecret(settings.encryptedApiKey) : undefined
  };
}

export function saveAiSettings(input: { provider: AiSettings["provider"]; model: string; baseUrl: string; apiKey?: string; clearApiKey?: boolean }) {
  const state = readState();
  const existing = state.llmSettings;
  state.llmSettings = {
    provider: input.provider,
    model: input.model.trim(),
    baseUrl: input.baseUrl.trim().replace(/\/$/, ""),
    encryptedApiKey: input.clearApiKey ? undefined : input.apiKey ? encryptSecret(input.apiKey.trim()) : existing?.encryptedApiKey,
    updatedAt: now()
  };
  audit(state, "user", `${input.provider} LLM bağlantı ayarı güncellendi; secret değeri şifreli kasada tutuluyor.`, "llm_settings", "primary");
  writeState(state);
  return getAiSettings();
}

function nextScheduleRun(schedule: WorkflowSchedule, from: Date = new Date()) {
  if (!schedule.enabled) return undefined;
  const cron = new Cron(schedule.cron, { timezone: schedule.timezone, paused: true });
  return cron.nextRun(from)?.toISOString();
}

export function createWorkflowFromAiPlan(plan: AiAutomationPlan) {
  const state = readState();
  const ts = now();
  const workflowId = id("wf");
  const versionId = id("wfv");
  const schedule = { ...plan.schedule, nextRunAt: nextScheduleRun(plan.schedule) };
  const workflow: Workflow = {
    id: workflowId,
    organizationId: DEFAULT_ORG_ID,
    name: plan.name,
    category: plan.category,
    status: "published",
    trigger: plan.trigger,
    description: plan.description,
    currentVersionId: versionId,
    source: plan.source,
    schedule,
    createdAt: ts
  };
  state.workflows.unshift(workflow);
  state.workflowVersions.unshift({ id: versionId, workflowId, version: 1, steps: plan.steps, publishedAt: ts });
  audit(state, "ai", `${workflow.name} doğal dil taslağından workflow olarak oluşturuldu.`, "workflow", workflow.id);
  writeState(state);
  return workflow;
}

export function runDueSchedules(reference = new Date()) {
  const dueIds = readState().workflows
    .filter((workflow) => workflow.status === "published" && workflow.schedule?.enabled && workflow.schedule.nextRunAt && new Date(workflow.schedule.nextRunAt).getTime() <= reference.getTime())
    .map((workflow) => workflow.id);
  const started: string[] = [];
  for (const workflowId of dueIds) {
    try {
      runWorkflow(workflowId, "Zamanlanmış otomatik çalıştırma");
      const state = readState();
      const workflow = state.workflows.find((item) => item.id === workflowId);
      if (workflow?.schedule) {
        workflow.schedule.lastRunAt = reference.toISOString();
        workflow.schedule.nextRunAt = nextScheduleRun(workflow.schedule, new Date(reference.getTime() + 1000));
        writeState(state);
        started.push(workflowId);
      }
    } catch (error) {
      const state = readState();
      audit(state, "system", `Zamanlanmış workflow başlatılamadı: ${sanitizeLog(error instanceof Error ? error.message : "Bilinmeyen hata")}`, "workflow", workflowId);
      writeState(state);
    }
  }
  return started;
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
  if (!version || version.steps.length === 0) throw new Error("Workflow içinde çalıştırılabilir adım bulunamadı.");
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
    workerId: LOCAL_WORKER_ID,
    status: "queued",
    retryCount: 0,
    maxRetries: 2,
    currentStepIndex: 0,
    totalSteps: version.steps.length,
    createdAt
  };

  state.queueItems.unshift(queueItem);
  state.jobs.unshift(job);
  state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: createdAt, level: "info", message: `${workflow.name} yerel ajan kuyruğuna alındı.` });
  queueJobAtCurrentStep(state, job, workflow, version.steps, payloadSummary);

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
      const workflow = state.workflows.find((item) => item.id === job.workflowId);
      const version = workflow ? state.workflowVersions.find((item) => item.id === workflow.currentVersionId) : undefined;
      if (!approved || !workflow || !version) {
        job.status = "failed";
        job.lastError = approved ? "Workflow sürümü bulunamadı." : "Teknik kullanıcı onayı reddetti.";
        job.completedAt = now();
        syncQueueItem(state, job);
      } else {
        if (approval.resumeAction === "advance") job.currentStepIndex += 1;
        queueJobAtCurrentStep(state, job, workflow, version.steps, "Onay sonrası devam");
      }
      state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: now(), level: approved ? "info" : "error", message: approved ? "İnsan onayı alındı; robot kuyruğa geri döndü." : "İnsan onayı reddedildi; robot işi durduruldu." });
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

function queueJobAtCurrentStep(state: SaasState, job: Job, workflow: Workflow, steps: WorkflowStep[], payloadSummary: string) {
  const step = steps[job.currentStepIndex];
  if (!step) {
    job.status = "succeeded";
    job.completedAt = now();
    job.leaseExpiresAt = undefined;
    syncQueueItem(state, job);
    state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: now(), level: "info", message: "Workflow bütün adımlarıyla başarıyla tamamlandı." });
    return;
  }

  const existingApproval = state.approvals.find((item) => item.jobId === job.id && item.stepIndex === job.currentStepIndex);
  const needsGate = step.type === "approval.wait" || step.requiresApproval || step.riskLevel === "critical";
  if (needsGate && existingApproval?.status !== "approved") {
    job.status = existingApproval?.status === "rejected" ? "failed" : "waiting_approval";
    if (!existingApproval) {
      state.approvals.unshift({
        id: id("app"),
        organizationId: DEFAULT_ORG_ID,
        jobId: job.id,
        title: step.title,
        summary: step.approvalPrompt || `${workflow.name} içindeki ${job.currentStepIndex + 1}. adım çalışmadan önce teknik kullanıcı onayı gerekiyor.`,
        riskLevel: step.riskLevel === "low" ? "medium" : step.riskLevel,
        status: "pending",
        stepIndex: job.currentStepIndex,
        resumeAction: step.type === "approval.wait" ? "advance" : "execute",
        diff: [
          { label: "Workflow", before: "Beklemede", after: workflow.name },
          { label: "Çalışacak adım", before: "Kapalı", after: `${job.currentStepIndex + 1}. ${step.title}` },
          { label: "İş girdisi", before: "Kuyruk", after: payloadSummary }
        ],
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now()
      });
      state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: now(), level: "warn", message: `${job.currentStepIndex + 1}. adım için teknik kullanıcı onayı bekleniyor.` });
    }
  } else {
    job.status = "queued";
  }
  syncQueueItem(state, job);
}

function syncQueueItem(state: SaasState, job: Job) {
  state.queueItems = state.queueItems.map((item) => (item.id === job.queueItemId ? { ...item, status: job.status } : item));
}

export function heartbeatLocalAgent(input: { name?: string; platform?: string }) {
  const state = readState();
  let worker = state.workers.find((item) => item.id === LOCAL_WORKER_ID);
  if (!worker) {
    worker = { id: LOCAL_WORKER_ID, organizationId: DEFAULT_ORG_ID, name: input.name || "Yerel Ajan", runtime: "local", status: "idle", lastSeenAt: now() };
    state.workers.push(worker);
  }
  worker.name = input.name || worker.name;
  worker.status = state.jobs.some((job) => job.workerId === worker!.id && job.status === "running") ? "running" : "idle";
  worker.lastSeenAt = now();
  writeState(state);
  return { ...worker, platform: input.platform };
}

export function leaseNextAgentStep(): AgentStepLease | null {
  const state = readState();
  const ts = Date.now();
  let recoveredStaleLease = false;
  for (const stale of state.jobs.filter((job) => job.status === "running" && job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < ts)) {
    stale.status = "queued";
    stale.leaseExpiresAt = undefined;
    syncQueueItem(state, stale);
    state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: stale.id, ts: now(), level: "warn", message: "Ajan kira süresi doldu; adım yeniden kuyruğa alındı." });
    recoveredStaleLease = true;
  }

  const job = state.jobs.find((item) => item.status === "queued");
  if (!job) {
    if (recoveredStaleLease) writeState(state);
    return null;
  }
  const workflow = findTenantRecord(state.workflows, job.workflowId);
  const version = state.workflowVersions.find((item) => item.id === workflow.currentVersionId);
  const step = version?.steps[job.currentStepIndex];
  if (!version || !step) {
    job.status = "failed";
    job.lastError = "Çalıştırılacak workflow adımı bulunamadı.";
    job.completedAt = now();
    syncQueueItem(state, job);
    writeState(state);
    return null;
  }

  job.status = "running";
  job.workerId = LOCAL_WORKER_ID;
  job.startedAt ||= now();
  job.leaseExpiresAt = new Date(Date.now() + 90_000).toISOString();
  syncQueueItem(state, job);
  const worker = state.workers.find((item) => item.id === LOCAL_WORKER_ID);
  if (worker) {
    worker.status = "running";
    worker.lastSeenAt = now();
  }
  const resolvedValue = resolveStepCredential(state, workflow, step);
  state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: now(), level: "info", message: `${job.currentStepIndex + 1}/${version.steps.length} adımı yerel ajan tarafından alındı: ${step.title}.` });
  writeState(state);
  return { jobId: job.id, workflowName: workflow.name, stepIndex: job.currentStepIndex, totalSteps: version.steps.length, step, resolvedValue, outputs: job.outputs || {} };
}

export function completeAgentStep(input: { jobId: string; stepIndex: number; summary?: string; output?: unknown }) {
  const state = readState();
  const job = findTenantRecord(state.jobs, input.jobId);
  if (job.status !== "running" || job.currentStepIndex !== input.stepIndex) throw new Error("Bu adım artık aktif değil veya başka bir ajan tarafından tamamlandı.");
  const workflow = findTenantRecord(state.workflows, job.workflowId);
  const version = state.workflowVersions.find((item) => item.id === workflow.currentVersionId);
  if (!version) throw new Error("Workflow sürümü bulunamadı.");
  const completedTitle = version.steps[input.stepIndex]?.title || `${input.stepIndex + 1}. adım`;
  const outputKey = version.steps[input.stepIndex]?.parameters?.outputKey;
  if (outputKey && input.output !== undefined) job.outputs = { ...(job.outputs || {}), [outputKey]: input.output };
  job.currentStepIndex += 1;
  job.retryCount = 0;
  job.leaseExpiresAt = undefined;
  state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: now(), level: "info", message: `${completedTitle} tamamlandı${input.summary ? `: ${sanitizeLog(input.summary)}` : "."}` });
  queueJobAtCurrentStep(state, job, workflow, version.steps, input.summary || completedTitle);
  const worker = state.workers.find((item) => item.id === LOCAL_WORKER_ID);
  if (worker) worker.status = job.status === "running" ? "running" : "idle";
  audit(state, "robot", `${workflow.name} workflow adımı tamamlandı.`, "job", job.id);
  writeState(state);
  return job;
}

export function failAgentStep(input: { jobId: string; stepIndex: number; error: string }) {
  const state = readState();
  const job = findTenantRecord(state.jobs, input.jobId);
  if (job.currentStepIndex !== input.stepIndex) throw new Error("Hata bildirilen adım artık aktif değil.");
  job.retryCount += 1;
  job.lastError = sanitizeLog(input.error);
  job.leaseExpiresAt = undefined;
  job.status = job.retryCount <= job.maxRetries ? "queued" : "failed";
  if (job.status === "failed") job.completedAt = now();
  syncQueueItem(state, job);
  state.jobLogs.unshift({ id: id("log"), organizationId: DEFAULT_ORG_ID, jobId: job.id, ts: now(), level: "error", message: `Adım hatası (${job.retryCount}/${job.maxRetries}): ${job.lastError}` });
  const worker = state.workers.find((item) => item.id === LOCAL_WORKER_ID);
  if (worker) worker.status = "idle";
  writeState(state);
  return job;
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

export function extractUploadedDocument(input: UploadedDocumentInput) {
  const state = readState();
  const dashboard = getDashboard();
  if (dashboard.usage.documents >= dashboard.plan.limits.documents) {
    throw new Error("Plan limiti aşıldı: doküman sınırına ulaşıldı.");
  }

  const extractedText = readExtractableText(input);
  const fields = buildFieldsFromUploadedDocument(input, extractedText);
  const needsReview = fields.some((field) => field.confidence < 80);
  const document: DocumentRecord = {
    id: id("doc"),
    organizationId: DEFAULT_ORG_ID,
    name: input.originalName,
    type: input.type,
    status: needsReview ? "needs_review" : "extracted",
    source: "upload",
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    storedFileName: input.storedFileName,
    fields,
    createdAt: now()
  };
  state.documents.unshift(document);

  if (needsReview) {
    state.approvals.unshift({
      id: id("app"),
      organizationId: DEFAULT_ORG_ID,
      documentId: document.id,
      title: `${document.name} gerçek veri doğrulaması`,
      summary: "Yüklenen gerçek dokümanda düşük güvenli veya OCR bekleyen alan var. Onay verilmeden final otomasyon adımı çalışmaz.",
      riskLevel: input.type === "customs" ? "high" : "medium",
      status: "pending",
      diff: document.fields.map((field) => ({ label: field.label, before: "Yüklenen dosya", after: `${field.value} (%${field.confidence})` })),
      dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      createdAt: now()
    });
  }

  audit(state, "ai", `${document.name} gerçek dosyadan işlendi; kaynak=${input.mimeType}.`, "document", document.id);
  writeState(state);
  return document;
}

function readExtractableText(input: UploadedDocumentInput) {
  if (!textLikeMimePattern.test(input.mimeType)) {
    return "";
  }

  try {
    return fs.readFileSync(input.path, "utf8").slice(0, 80_000);
  } catch {
    return "";
  }
}

function buildFieldsFromUploadedDocument(input: UploadedDocumentInput, text: string): import("../shared/saasTypes").SaasExtractedField[] {
  const normalized = text.replace(/\r/g, "\n");
  const isTextExtracted = normalized.trim().length > 0;
  const fallbackConfidence = isTextExtracted ? 68 : 42;
  const sourceLabel = isTextExtracted ? "Metinden çıkarıldı" : "OCR bekliyor";
  const fields: import("../shared/saasTypes").SaasExtractedField[] = [
    makeExtractedField("party", "Taraf", extractParty(normalized) ?? `${sourceLabel}: ${input.originalName}`, isTextExtracted ? 82 : fallbackConfidence),
    makeExtractedField("amount", "Tutar", extractAmount(normalized) ?? "Doğrulama gerekli", extractAmount(normalized) ? 86 : fallbackConfidence),
    makeExtractedField("date", "Tarih", extractDate(normalized) ?? "Doğrulama gerekli", extractDate(normalized) ? 88 : fallbackConfidence)
  ];

  const documentNo = extractDocumentNo(normalized);
  if (documentNo) {
    fields.push(makeExtractedField("document_no", "Belge No", documentNo, 84));
  }

  if (!isTextExtracted) {
    fields.push(makeExtractedField("ocr_status", "İşleme Notu", "PDF/görsel içeriği yüklendi; OCR/AI sağlayıcısı bağlanınca otomatik okunacak.", 42));
  }

  return fields;
}

function makeExtractedField(key: string, label: string, value: string, confidence: number): import("../shared/saasTypes").SaasExtractedField {
  return {
    id: id("fld"),
    key,
    label,
    value,
    confidence,
    verified: confidence >= 95
  };
}

function extractAmount(text: string) {
  const labeled = text.match(/(?:genel\s*toplam|toplam\s*tutar|toplam|tutar|amount|total)\s*[:=-]?\s*([0-9][0-9.,\s]*(?:TL|TRY|USD|EUR|₺|\$|€)?)/i);
  if (labeled?.[1]) return labeled[1].replace(/\s+/g, " ").trim();

  const moneyMatches = [...text.matchAll(/([0-9]{1,3}(?:[.,\s][0-9]{3})*(?:[.,][0-9]{2})?\s*(?:TL|TRY|USD|EUR|₺|\$|€))/gi)].map((match) => match[1].trim());
  return moneyMatches.at(-1);
}

function extractDate(text: string) {
  const labeled = text.match(/(?:tarih|date|fatura\s*tarihi|belge\s*tarihi)\s*[:=-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  if (labeled?.[1]) return labeled[1].trim();
  return text.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)?.[1];
}

function extractParty(text: string) {
  const labeled = text.match(/(?:tedarikçi|m[üu]şteri|cari|firma|alıcı|satıcı|customer|supplier)\s*[:=-]\s*(.+)/i);
  if (labeled?.[1]) return labeled[1].slice(0, 120).trim();

  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length >= 4 && line.length <= 120 && /(ltd|limited|a\.ş|anonim|ticaret|sanayi|company|inc|llc)/i.test(line));
}

function extractDocumentNo(text: string) {
  return text.match(/(?:fatura|belge|evrak|sipariş|order|invoice)\s*(?:no|numarası|number|#)\s*[:=-]?\s*([A-Z0-9-]{3,40})/i)?.[1];
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

export function createConnector(input: {
  type: ConnectorAccount["type"];
  name: string;
  secret?: string;
  username?: string;
  password?: string;
  loginUrl?: string;
}) {
  if (sensitiveSecretPattern.test(input.name)) {
    throw new Error("Güvenlik politikası: e-imza PIN'i, OTP, SMS kodu, banka şifresi veya kişisel elektronik imza saklanamaz.");
  }
  const payload: { username?: string; password?: string; secret?: string } = input.username || input.password
    ? { username: input.username ?? "", password: input.password ?? "" }
    : { secret: input.secret ?? "" };
  if (!payload.username && !payload.password && !payload.secret) throw new Error("Hesap için kullanıcı bilgisi veya secret gerekli.");

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
    secretPreview: maskSecret(input.password || input.secret || ""),
    loginUrl: input.loginUrl,
    usernamePreview: input.username ? maskUsername(input.username) : undefined,
    createdAt: now()
  };
  const credential: CredentialVaultItem = {
    id: id("cred"),
    organizationId: DEFAULT_ORG_ID,
    connectorId: connector.id,
    label: `${input.name} hesabı`,
    encryptedSecret: encryptSecret(JSON.stringify(payload)),
    loginUrl: input.loginUrl,
    usernamePreview: connector.usernamePreview,
    createdAt: now()
  };
  connector.credentialId = credential.id;
  state.connectors.unshift(connector);
  state.credentials.unshift(credential);
  audit(state, "user", `${input.name} hesap profili eklendi; hassas alanlar şifrelenerek kasaya alındı.`, "connector", connector.id);
  writeState(state);
  return connector;
}

export function listCredentialProfiles() {
  return readState().credentials.filter((item) => item.organizationId === DEFAULT_ORG_ID).map(toCredentialProfile);
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
  return `${"•".repeat(Math.min(12, Math.max(6, secret.length)))}`;
}

function maskUsername(username: string) {
  const [name, domain] = username.split("@");
  const maskedName = name.length < 3 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
  return domain ? `${maskedName}@${domain}` : maskedName;
}

function encryptSecret(secret: string) {
  const key = crypto.createHash("sha256").update(vaultKey()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Kasa kaydı geçersiz.");
  const key = crypto.createHash("sha256").update(vaultKey()).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
}

function vaultKey() {
  const configured = process.env.CREDENTIAL_VAULT_KEY;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("CREDENTIAL_VAULT_KEY üretim ortamında zorunludur.");
  return "otoflow-local-development-key";
}

function resolveStepCredential(state: SaasState, workflow: Workflow, step: WorkflowStep) {
  const field = step.parameters?.credentialField;
  if (!field) return step.parameters?.value;
  const credentialId = step.credentialId || workflow.credentialId;
  if (!credentialId) throw new Error(`${step.title} için hesap profili bağlanmamış.`);
  const credential = findTenantRecord(state.credentials, credentialId);
  const decrypted = decryptSecret(credential.encryptedSecret);
  let payload: { username?: string; password?: string; secret?: string };
  try {
    payload = JSON.parse(decrypted) as typeof payload;
  } catch {
    payload = { secret: decrypted };
  }
  const value = payload[field] || (field === "password" ? payload.secret : undefined);
  if (!value) throw new Error(`${credential.label} içinde ${field === "username" ? "kullanıcı adı" : "şifre"} bulunamadı.`);
  return value;
}

function sanitizeLog(value: string) {
  return value
    .replace(/(password|şifre|sifre|secret|token|otp|pin)\s*[:=]\s*\S+/gi, "$1=••••••")
    .slice(0, 500);
}

export function exportAutomationPackage(workflowId: string): AutomationPackage {
  const state = readState();
  const workflow = findTenantRecord(state.workflows, workflowId);
  const version = state.workflowVersions.find((item) => item.id === workflow.currentVersionId);
  if (!version) throw new Error("Workflow sürümü bulunamadı.");
  const credential = workflow.credentialId ? state.credentials.find((item) => item.id === workflow.credentialId) : undefined;
  return {
    format: "otoflow.automation",
    version: 1,
    exportedAt: now(),
    metadata: { name: workflow.name, description: workflow.description, category: workflow.category, trigger: workflow.trigger, source: workflow.source, schedule: workflow.schedule },
    steps: version.steps.map((step) => ({ ...step, credentialId: undefined })),
    variables: [],
    requiredCredential: credential ? { alias: "primary", label: credential.label, loginUrl: credential.loginUrl } : undefined
  };
}

export function importAutomationPackage(pkg: AutomationPackage) {
  const state = readState();
  const workflowId = id("wf");
  const versionId = id("wfv");
  const createdAt = now();
  const workflow: Workflow = {
    id: workflowId,
    organizationId: DEFAULT_ORG_ID,
    name: pkg.metadata.name,
    description: pkg.metadata.description,
    category: pkg.metadata.category,
    trigger: pkg.metadata.trigger,
    status: pkg.requiredCredential ? "draft" : "published",
    currentVersionId: versionId,
    source: "import",
    schedule: pkg.metadata.schedule ? { ...pkg.metadata.schedule, nextRunAt: nextScheduleRun(pkg.metadata.schedule) } : undefined,
    createdAt
  };
  const steps = pkg.steps.map((step) => ({ ...step, id: id("step"), credentialId: undefined }));
  state.workflows.unshift(workflow);
  state.workflowVersions.unshift({ id: versionId, workflowId, version: 1, steps, publishedAt: workflow.status === "published" ? createdAt : undefined });
  audit(state, "user", `${workflow.name} .otomasyon dosyasından içe aktarıldı.`, "workflow", workflow.id);
  writeState(state);
  return workflow;
}

export function updateWorkflowConfiguration(workflowId: string, input: { steps?: WorkflowStep[]; credentialId?: string; publish?: boolean; schedule?: WorkflowSchedule }) {
  const state = readState();
  const workflow = findTenantRecord(state.workflows, workflowId);
  if (input.credentialId) findTenantRecord(state.credentials, input.credentialId);
  const version = state.workflowVersions.find((item) => item.id === workflow.currentVersionId);
  if (!version) throw new Error("Workflow sürümü bulunamadı.");
  if (input.steps) version.steps = input.steps.map((step) => ({ ...step, credentialId: step.credentialId || input.credentialId }));
  if (input.credentialId) workflow.credentialId = input.credentialId;
  if (input.schedule) workflow.schedule = { ...input.schedule, nextRunAt: nextScheduleRun(input.schedule) };
  if (input.publish) {
    workflow.status = "published";
    version.publishedAt = now();
  }
  audit(state, "user", `${workflow.name} çalışma ayarları güncellendi.`, "workflow", workflow.id);
  writeState(state);
  return { ...workflow, version };
}
