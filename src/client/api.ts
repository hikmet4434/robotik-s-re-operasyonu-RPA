import type { Actor, CustomsFile, DashboardPayload } from "../shared/types";
import type {
  ApprovalTask,
  AiAutomationPlan,
  AiRuntimeStatus,
  AiSettings,
  AutomationDraft,
  AutomationPackage,
  AutomationOpportunity,
  CompliancePolicy,
  ConnectorAccount,
  DocumentRecord,
  Job,
  RecorderEvent,
  RecordingSession,
  SaasDashboard,
  Workflow,
  WorkflowStep
} from "../shared/saasTypes";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "İşlem tamamlanamadı." }));
    throw new Error(error.error ?? "İşlem tamamlanamadı.");
  }

  return response.json() as Promise<T>;
}

export const api = {
  dashboard: () => request<SaasDashboard>("/api/dashboard"),
  legacyDashboard: () => request<DashboardPayload>("/api/legacy/dashboard"),
  me: () => request("/api/me"),
  workflows: () => request<Array<Workflow & { version?: { steps: unknown[] } }>>("/api/workflows"),
  recordings: () => request<Array<RecordingSession & { events: RecorderEvent[]; draft?: AutomationDraft }>>("/api/recordings"),
  createRecording: (body: { title: string; goal: string; appName: string }) =>
    request<RecordingSession>("/api/recordings", { method: "POST", body: JSON.stringify(body) }),
  addRecordingEvent: (id: string, body: Omit<RecorderEvent, "id" | "ts">) =>
    request<RecorderEvent>(`/api/recordings/${id}/events`, { method: "POST", body: JSON.stringify(body) }),
  uploadRecordingVideo: (id: string, video: Blob) => {
    const formData = new FormData();
    formData.append("video", video, `screen-${id}.webm`);
    return request<RecordingSession>(`/api/recordings/${id}/video`, { method: "POST", body: formData });
  },
  analyzeRecording: (id: string) => request<AutomationDraft>(`/api/recordings/${id}/analyze`, { method: "POST", body: "{}" }),
  updateAutomationDraft: (id: string, body: { steps: WorkflowStep[]; credentialId?: string; title?: string; objective?: string }) =>
    request<AutomationDraft>(`/api/automation-drafts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  publishAutomationDraft: (id: string) => request<Workflow>(`/api/automation-drafts/${id}/publish`, { method: "POST", body: "{}" }),
  configureWorkflow: (id: string, body: { steps?: WorkflowStep[]; credentialId?: string; publish?: boolean; schedule?: Workflow["schedule"] }) =>
    request<Workflow>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  importAutomation: (body: AutomationPackage) => request<Workflow>("/api/workflows/import", { method: "POST", body: JSON.stringify(body) }),
  exportAutomation: async (id: string) => {
    const response = await fetch(`/api/workflows/${id}/export`);
    if (!response.ok) throw new Error("Otomasyon dosyası indirilemedi.");
    return { blob: await response.blob(), disposition: response.headers.get("content-disposition") };
  },
  runWorkflow: (id: string, payloadSummary: string) =>
    request<Job>(`/api/workflows/${id}/run`, { method: "POST", body: JSON.stringify({ payloadSummary }) }),
  publishWorkflow: (id: string) => request<Workflow>(`/api/workflows/${id}/publish`, { method: "POST", body: "{}" }),
  aiSettings: () => request<AiSettings>("/api/ai/settings"),
  aiStatus: () => request<AiRuntimeStatus>("/api/ai/status"),
  saveAiSettings: (body: { provider: AiSettings["provider"]; model: string; baseUrl: string; apiKey?: string; clearApiKey?: boolean }) =>
    request<AiSettings>("/api/ai/settings", { method: "PUT", body: JSON.stringify(body) }),
  generateAiAutomation: (body: { prompt: string; directoryPath?: string; reportPath?: string; cron?: string; timezone?: string; scheduleLabel?: string; approvalAtEnd?: boolean }) =>
    request<AiAutomationPlan>("/api/ai/automation-plan", { method: "POST", body: JSON.stringify(body) }),
  createAiWorkflow: (body: AiAutomationPlan) => request<Workflow>("/api/ai/workflows", { method: "POST", body: JSON.stringify(body) }),
  jobs: () => request<Array<Job & { logs: unknown[]; workflow?: Workflow }>>("/api/jobs"),
  cancelJob: (id: string) => request<Job>(`/api/jobs/${id}/cancel`, { method: "POST", body: "{}" }),
  retryJob: (id: string) => request<Job>(`/api/jobs/${id}/retry`, { method: "POST", body: "{}" }),
  approvals: () => request<ApprovalTask[]>("/api/approvals"),
  approveTask: (id: string) => request<ApprovalTask>(`/api/approvals/${id}/approve`, { method: "POST", body: "{}" }),
  rejectTask: (id: string) => request<ApprovalTask>(`/api/approvals/${id}/reject`, { method: "POST", body: "{}" }),
  extractDocument: (body: { name: string; type: DocumentRecord["type"] }) =>
    request<DocumentRecord>("/api/documents/extract", { method: "POST", body: JSON.stringify(body) }),
  uploadDocument: (body: { file: File; type: DocumentRecord["type"] }) => {
    const formData = new FormData();
    formData.append("file", body.file);
    formData.append("type", body.type);
    return request<DocumentRecord>("/api/documents/upload", { method: "POST", body: formData });
  },
  updateDocumentField: (id: string, body: { fieldId: string; value: string }) =>
    request<DocumentRecord>(`/api/documents/${id}/fields`, { method: "PATCH", body: JSON.stringify(body) }),
  createOpportunity: (body: Pick<AutomationOpportunity, "title" | "department" | "monthlyVolume" | "minutesPerTask" | "errorRisk" | "feasibility">) =>
    request<AutomationOpportunity>("/api/opportunities", { method: "POST", body: JSON.stringify(body) }),
  updateOpportunity: (id: string, status: AutomationOpportunity["status"]) =>
    request<AutomationOpportunity>(`/api/opportunities/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  createConnector: (body: { type: ConnectorAccount["type"]; name: string; secret?: string; username?: string; password?: string; loginUrl?: string }) =>
    request<ConnectorAccount>("/api/connectors", { method: "POST", body: JSON.stringify(body) }),
  localAgentHealth: async () => {
    const response = await fetch("http://127.0.0.1:4687/health");
    if (!response.ok) throw new Error("Yerel ajan çevrimdışı.");
    return response.json() as Promise<{ ok: boolean; platform: string; recording: boolean }>;
  },
  startDesktopRecording: (sessionId: string) => fetch("http://127.0.0.1:4687/record/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Masaüstü kaydı başlatılamadı.");
    return payload as { ok: boolean; recording: boolean };
  }),
  stopDesktopRecording: () => fetch("http://127.0.0.1:4687/record/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Masaüstü kaydı durdurulamadı.");
    return payload as { ok: boolean; stopped: boolean };
  }),
  createPolicy: (body: Pick<CompliancePolicy, "name" | "description" | "policyType">) =>
    request<CompliancePolicy>("/api/compliance/policies", { method: "POST", body: JSON.stringify(body) }),
  files: () => request<CustomsFile[]>("/api/files"),
  file: (id: string) => request<CustomsFile>(`/api/files/${id}`),
  createFile: () => request<CustomsFile>("/api/files", { method: "POST", body: "{}" }),
  updateField: (id: string, body: { documentType: string; key: string; value: string; confidence?: number }) =>
    request<CustomsFile>(`/api/files/${id}/field`, { method: "PATCH", body: JSON.stringify(body) }),
  selectGtip: (id: string, body: { lineItemId: string; code: string }) =>
    request<CustomsFile>(`/api/files/${id}/select-gtip`, { method: "POST", body: JSON.stringify(body) }),
  approveValidation: (id: string) => request<CustomsFile>(`/api/files/${id}/approve-validation`, { method: "POST", body: "{}" }),
  calculateTax: (id: string) => request<CustomsFile>(`/api/files/${id}/tax`, { method: "POST", body: "{}" }),
  log: (id: string, body: { actor: Actor; action: string }) =>
    request<CustomsFile>(`/api/files/${id}/log`, { method: "POST", body: JSON.stringify(body) }),
  submit: (id: string) => request<CustomsFile>(`/api/files/${id}/submit`, { method: "POST", body: "{}" })
};
