export type Role = "owner" | "admin" | "operator" | "viewer" | "auditor";
export type PlanCode = "starter" | "pro" | "agency";
export type OpportunityStatus = "fikir" | "analiz" | "hazir" | "canli" | "beklemede";
export type WorkflowStatus = "draft" | "published" | "paused";
export type JobStatus = "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ConnectorStatus = "connected" | "needs_attention" | "disabled";
export type AuditActor = "system" | "robot" | "user" | "ai";

export type WorkflowStepType =
  | "browser.navigate"
  | "browser.click"
  | "browser.type"
  | "browser.extract"
  | "http.request"
  | "document.extract"
  | "approval.wait"
  | "email.draft"
  | "email.send_after_approval"
  | "table.append"
  | "condition"
  | "webhook.emit";

export type RecorderEventType =
  | "screen.start"
  | "screen.stop"
  | "app.login"
  | "navigation"
  | "tab.switch"
  | "click"
  | "input"
  | "select"
  | "report.open"
  | "report.filter"
  | "report.export"
  | "email.read"
  | "email.summarize"
  | "email.draft"
  | "email.send"
  | "file.download"
  | "file.upload"
  | "note";

export interface RecorderEvent {
  id: string;
  ts: string;
  type: RecorderEventType;
  label: string;
  target: string;
  value?: string;
  appArea: string;
  selectorHint?: string;
  region?: { x: number; y: number; w: number; h: number };
}

export interface RecordingSession {
  id: string;
  organizationId: string;
  title: string;
  goal: string;
  appName: string;
  status: "draft" | "recording" | "analyzed" | "published";
  screenRecordingStatus: "not_started" | "recording" | "captured";
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationDraft {
  id: string;
  organizationId: string;
  recordingSessionId: string;
  title: string;
  objective: string;
  confidence: number;
  status: "draft" | "published";
  steps: WorkflowStep[];
  variables: { key: string; label: string; example: string; source: string }[];
  approvalGates: { title: string; reason: string; riskLevel: RiskLevel }[];
  subAutomations: { name: string; purpose: string; stepIds: string[] }[];
  createdAt: string;
  publishedWorkflowId?: string;
}

export interface Organization {
  id: string;
  name: string;
  taxNumber: string;
  sector: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
}

export interface PlanLimit {
  workflows: number;
  monthlyJobs: number;
  documents: number;
  connectors: number;
}

export interface Plan {
  code: PlanCode;
  name: string;
  monthlyPriceTRY: number;
  limits: PlanLimit;
}

export interface ManualSubscription {
  id: string;
  organizationId: string;
  planCode: PlanCode;
  status: "active" | "trial" | "past_due";
  renewalNote: string;
  currentPeriodEnd: string;
}

export interface AutomationOpportunity {
  id: string;
  organizationId: string;
  title: string;
  department: string;
  monthlyVolume: number;
  minutesPerTask: number;
  errorRisk: number;
  feasibility: number;
  roiScore: number;
  status: OpportunityStatus;
  createdAt: string;
}

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  title: string;
  description: string;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  steps: WorkflowStep[];
  publishedAt?: string;
}

export interface Workflow {
  id: string;
  organizationId: string;
  name: string;
  category: "finans" | "operasyon" | "gümrük" | "satış" | "genel";
  status: WorkflowStatus;
  trigger: string;
  description: string;
  currentVersionId: string;
  createdAt: string;
}

export interface RobotWorker {
  id: string;
  organizationId: string;
  name: string;
  runtime: "cloud";
  status: "idle" | "running" | "offline";
  lastSeenAt: string;
}

export interface Queue {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface QueueItem {
  id: string;
  organizationId: string;
  queueId: string;
  workflowId: string;
  status: JobStatus;
  payloadSummary: string;
  createdAt: string;
}

export interface Job {
  id: string;
  organizationId: string;
  workflowId: string;
  queueItemId: string;
  workerId: string;
  status: JobStatus;
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface JobRunLog {
  id: string;
  organizationId: string;
  jobId: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ApprovalTask {
  id: string;
  organizationId: string;
  jobId?: string;
  documentId?: string;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  diff: { label: string; before: string; after: string }[];
  dueAt: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface SaasExtractedField {
  id: string;
  key: string;
  label: string;
  value: string;
  confidence: number;
  verified: boolean;
}

export interface DocumentRecord {
  id: string;
  organizationId: string;
  name: string;
  type: "invoice" | "order" | "customs" | "reconciliation" | "other";
  status: "extracted" | "needs_review" | "approved";
  source?: "demo" | "upload" | "email" | "connector";
  mimeType?: string;
  sizeBytes?: number;
  storedFileName?: string;
  fields: SaasExtractedField[];
  createdAt: string;
}

export interface ConnectorAccount {
  id: string;
  organizationId: string;
  type: "email" | "google_sheets" | "webhook" | "portal" | "csv";
  name: string;
  status: ConnectorStatus;
  secretPreview?: string;
  createdAt: string;
}

export interface CredentialVaultItem {
  id: string;
  organizationId: string;
  connectorId: string;
  label: string;
  encryptedSecret: string;
  createdAt: string;
}

export interface CompliancePolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  enabled: boolean;
  policyType: "approval_gate" | "retention" | "secret_block" | "audit";
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  organizationId: string;
  subject: string;
  purpose: string;
  legalBasis: string;
  acceptedAt: string;
}

export interface RetentionRule {
  id: string;
  organizationId: string;
  dataType: string;
  retentionDays: number;
  action: "archive" | "delete";
  enabled: boolean;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  ts: string;
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: string;
}

export interface SaasDashboard {
  organization: Organization;
  user: User;
  membership: Membership;
  plan: Plan;
  subscription: ManualSubscription;
  usage: {
    workflows: number;
    monthlyJobs: number;
    documents: number;
    connectors: number;
  };
  kpis: {
    savedHours: number;
    successRate: number;
    pendingApprovals: number;
    slaBreaches: number;
    activeRobots: number;
  };
  opportunities: AutomationOpportunity[];
  workflows: Workflow[];
  jobs: Job[];
  approvals: ApprovalTask[];
  documents: DocumentRecord[];
  connectors: ConnectorAccount[];
  policies: CompliancePolicy[];
  audit: AuditEvent[];
  workers: RobotWorker[];
  recordingSessions: RecordingSession[];
  recorderEvents: RecorderEvent[];
  automationDrafts: AutomationDraft[];
}
