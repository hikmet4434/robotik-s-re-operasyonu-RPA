import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileSearch,
  Gauge,
  GitBranch,
  KeyRound,
  LockKeyhole,
  MailCheck,
  Play,
  Plus,
  Radio,
  ScreenShare,
  ShieldCheck,
  Sparkles,
  Table2,
  TimerReset,
  Upload
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type {
  ApprovalTask,
  AutomationDraft,
  AutomationOpportunity,
  ConnectorAccount,
  DocumentRecord,
  Job,
  RecorderEvent,
  RecordingSession,
  SaasDashboard,
  Workflow
} from "../../shared/saasTypes";
import { api } from "../api";
import { formatDate, formatNumber } from "../utils";

type Tab = "dashboard" | "recorder" | "workflows" | "jobs" | "approvals" | "documents" | "opportunities" | "connectors" | "compliance";

const tabLabels: Record<Tab, string> = {
  dashboard: "Genel Bakış",
  recorder: "Recorder Studio",
  workflows: "Otomasyonlar",
  jobs: "Robot İşleri",
  approvals: "Onaylar",
  documents: "Dokümanlar",
  opportunities: "Fikir Havuzu",
  connectors: "Entegrasyonlar",
  compliance: "Uyum"
};

export function DashboardPage() {
  const [data, setData] = useState<SaasDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [message, setMessage] = useState<string | null>(null);
  const location = useLocation();

  async function refresh() {
    setData(await api.dashboard());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const byPath: Record<string, Tab> = {
      "/dashboard": "dashboard",
      "/recorder": "recorder",
      "/workflows": "workflows",
      "/jobs": "jobs",
      "/approvals": "approvals",
      "/documents": "documents",
      "/opportunities": "opportunities",
      "/connectors": "connectors",
      "/compliance": "compliance"
    };
    setActiveTab(byPath[location.pathname] ?? "dashboard");
  }, [location.pathname]);

  async function runWorkflow(workflow: Workflow) {
    setMessage(null);
    try {
      await api.runWorkflow(workflow.id, `${workflow.name} için KOBİ demo çalıştırması`);
      setMessage(`${workflow.name} robot kuyruğuna alındı.`);
      await refresh();
      setActiveTab("jobs");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Robot çalıştırılamadı.");
    }
  }

  async function approve(task: ApprovalTask, approved: boolean) {
    setMessage(null);
    if (approved) await api.approveTask(task.id);
    else await api.rejectTask(task.id);
    setMessage(approved ? "Onay verildi; robot kaldığı yerden devam etti." : "Onay reddedildi; robot işi durduruldu.");
    await refresh();
  }

  if (!data) return <div className="panel p-6 muted">SaaS konsolu yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <Hero data={data} />

      <div className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {(Object.keys(tabLabels) as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${activeTab === tab ? "bg-teal-50 text-brand ring-1 ring-teal-100" : "text-muted hover:bg-white hover:text-ink"}`}>
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</div> : null}

      {activeTab === "dashboard" ? <Overview data={data} setTab={setActiveTab} /> : null}
      {activeTab === "recorder" ? <RecorderStudio refreshDashboard={refresh} /> : null}
      {activeTab === "workflows" ? <Workflows data={data} onRun={runWorkflow} /> : null}
      {activeTab === "jobs" ? <Jobs data={data} refresh={refresh} /> : null}
      {activeTab === "approvals" ? <Approvals data={data} onResolve={approve} /> : null}
      {activeTab === "documents" ? <Documents data={data} refresh={refresh} /> : null}
      {activeTab === "opportunities" ? <Opportunities data={data} refresh={refresh} /> : null}
      {activeTab === "connectors" ? <Connectors data={data} refresh={refresh} setMessage={setMessage} /> : null}
      {activeTab === "compliance" ? <Compliance data={data} refresh={refresh} /> : null}
    </div>
  );
}

function RecorderStudio({ refreshDashboard }: { refreshDashboard: () => Promise<void> }) {
  const [title, setTitle] = useState("Günlük rapor indir ve e-posta hazırla");
  const [goal, setGoal] = useState("Portala gir, günlük satış raporunu filtrele, raporu indir, e-postaları özetle ve müşteriye onaylı e-posta taslağı hazırla.");
  const [appName, setAppName] = useState("Demo Portal + E-posta");
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [events, setEvents] = useState<RecorderEvent[]>([]);
  const [draft, setDraft] = useState<AutomationDraft | null>(null);
  const [activeArea, setActiveArea] = useState<"login" | "reports" | "email">("login");
  const [screenStatus, setScreenStatus] = useState<"idle" | "recording" | "captured" | "unsupported">("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function startSession() {
    const created = await api.createRecording({ title, goal, appName });
    setSession(created);
    setEvents([]);
    setDraft(null);
    setMessage("Kayıt oturumu başladı. Şimdi işi normal yapar gibi demo çalışma alanında ilerle.");
  }

  async function capture(event: Omit<RecorderEvent, "id" | "ts">) {
    if (!session) {
      setMessage("Önce kayıt oturumu başlat.");
      return;
    }
    const saved = await api.addRecordingEvent(session.id, event);
    setEvents((current) => [...current, saved]);
  }

  async function startScreenRecording() {
    if (!session) {
      setMessage("Ekran kaydı için önce kayıt oturumu başlat.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setScreenStatus("unsupported");
      setMessage("Bu tarayıcı ortamı ekran kaydı API'sini desteklemiyor. Olay kaydı yine çalışır.");
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: "video/webm" });
      setVideoUrl(URL.createObjectURL(blob));
      setScreenStatus("captured");
    };
    recorder.start();
    setMediaRecorder(recorder);
    setScreenStatus("recording");
    await capture({ type: "screen.start", label: "Ekran kaydı başladı", target: "screen", appArea: "Recorder", value: "webm", selectorHint: "display-media" });
  }

  async function stopScreenRecording() {
    mediaRecorder?.stop();
    setMediaRecorder(null);
    setScreenStatus("captured");
    await capture({ type: "screen.stop", label: "Ekran kaydı durdu", target: "screen", appArea: "Recorder", value: "captured", selectorHint: "display-media" });
  }

  async function analyze() {
    if (!session) return;
    const generated = await api.analyzeRecording(session.id);
    setDraft(generated);
    setMessage("AI analizi tamamlandı: iş adımları, değişkenler, onay kapıları ve alt otomasyonlar çıkarıldı.");
  }

  async function publish() {
    if (!draft) return;
    await api.publishAutomationDraft(draft.id);
    await refreshDashboard();
    setMessage("Taslak workflow olarak yayınlandı. Otomasyonlar sekmesinde çalıştırılabilir.");
  }

  return (
    <div className="space-y-6">
      <RecorderInstallPanel />

      <section className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
              <Radio size={14} />
              İş Kaydet → AI Anla → Otomasyon Oluştur
            </div>
            <h2 className="text-xl font-bold">Recorder Studio</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Kullanıcı işi normal yapar; sistem tıklama, alan seçimi, sekme, rapor, e-posta ve ekran kaydı metadata’sını toplar. AI bunu küçük otomasyonlara ve birleşik workflow’a dönüştürür.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary" onClick={() => void startScreenRecording()} disabled={screenStatus === "recording"}>
              <ScreenShare size={16} />
              Ekran Kaydı
            </button>
            <button className="button-secondary" onClick={() => void stopScreenRecording()} disabled={screenStatus !== "recording"}>
              Durdur
            </button>
            <button className="button-primary" onClick={() => void startSession()}>
              <Radio size={16} />
              İşi Kaydet
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-3">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="İş adı" />
            <input className="input" value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="Uygulama adı" />
          </div>
          <textarea className="input min-h-28" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Bu işin amacı nedir?" />
        </div>
        {message ? <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-100">{message}</div> : null}
        {videoUrl ? (
          <video className="mt-4 max-h-64 w-full rounded-lg border border-line bg-black" src={videoUrl} controls />
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="section-title">Demo Çalışma Alanı</h2>
              <p className="muted">Gerçek üründe bu katman Chrome extension ve yerel ajan ile harici uygulamaları da izler.</p>
            </div>
            <StatusPill value={session ? "recording" : "idle"} />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button className={`button-secondary ${activeArea === "login" ? "bg-teal-50 text-brand" : ""}`} onClick={() => { setActiveArea("login"); void capture({ type: "tab.switch", label: "Giriş sekmesine geç", target: "tab-login", appArea: "Demo Portal", selectorHint: "[data-tab=login]" }); }}>Giriş</button>
            <button className={`button-secondary ${activeArea === "reports" ? "bg-teal-50 text-brand" : ""}`} onClick={() => { setActiveArea("reports"); void capture({ type: "tab.switch", label: "Raporlar sekmesine geç", target: "tab-reports", appArea: "Demo Portal", selectorHint: "[data-tab=reports]" }); }}>Raporlar</button>
            <button className={`button-secondary ${activeArea === "email" ? "bg-teal-50 text-brand" : ""}`} onClick={() => { setActiveArea("email"); void capture({ type: "tab.switch", label: "E-posta sekmesine geç", target: "tab-email", appArea: "E-posta", selectorHint: "[data-tab=email]" }); }}>E-posta</button>
          </div>

          {activeArea === "login" ? <RecorderLogin capture={capture} /> : null}
          {activeArea === "reports" ? <RecorderReports capture={capture} /> : null}
          {activeArea === "email" ? <RecorderEmail capture={capture} /> : null}
        </section>

        <section className="panel overflow-hidden">
          <TableHeader title="Yakalanan İş Adımları" subtitle={`${events.length} olay · ${screenStatus === "recording" ? "ekran kaydı sürüyor" : screenStatus === "captured" ? "ekran kaydı hazır" : "ekran kaydı opsiyonel"}`} />
          <div className="max-h-[520px] overflow-y-auto p-4">
            {events.length === 0 ? <div className="rounded-md bg-slate-50 p-4 text-sm text-muted ring-1 ring-line">Kayıt başlayınca tıklamalar, inputlar ve rapor/e-posta adımları burada görünür.</div> : null}
            <div className="space-y-2">
              {events.map((event, index) => (
                <div key={event.id} className="rounded-md border border-line bg-white p-3">
                  <div className="text-xs font-semibold text-brand">{index + 1}. {event.type}</div>
                  <div className="mt-1 text-sm font-medium">{event.label}</div>
                  <div className="mt-1 text-xs text-muted">{event.appArea} · {event.value ?? event.selectorHint ?? event.target}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-line p-4">
            <button className="button-primary w-full" disabled={!session || events.length === 0} onClick={() => void analyze()}>
              <Sparkles size={16} />
              AI ile Otomasyona Çevir
            </button>
          </div>
        </section>
      </div>

      {draft ? <AutomationDraftPanel draft={draft} onPublish={publish} /> : null}
    </div>
  );
}

function RecorderInstallPanel() {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-800">
            <Radio size={19} />
          </div>
          <div>
            <h2 className="font-bold">Chrome Recorder Extension</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Dış web uygulamalarında tıklama, input, seçim, form, URL ve sekme olaylarını yakalar. Secret/PIN/OTP alanlarını maskeler.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm ring-1 ring-line">
          Klasör: <span className="font-mono">extension/chrome-recorder</span>
        </div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Chrome’da <span className="font-mono">chrome://extensions</span> aç.</li>
          <li>Developer mode’u aç.</li>
          <li>Load unpacked ile extension klasörünü seç.</li>
          <li>Popup’tan kayıt oturumunu seçip kaydı başlat.</li>
        </ol>
      </div>

      <div className="panel p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-brand">
            <Bot size={19} />
          </div>
          <div>
            <h2 className="font-bold">Local Agent Bridge</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Masaüstü/ERP/Excel gibi browser dışı işler için yerel event bridge. Sonraki fazda OCR ve accessibility adapterleri buraya bağlanır.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm ring-1 ring-line">
          Klasör: <span className="font-mono">agents/local-agent</span>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{`cd agents/local-agent
OTOFLOW_RECORDING_SESSION_ID=rec_xxxxx npm start`}</pre>
      </div>
    </section>
  );
}

function RecorderLogin({ capture }: { capture: (event: Omit<RecorderEvent, "id" | "ts">) => Promise<void> }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <h3 className="font-bold">Uygulama Girişi</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="Kullanıcı adı" onChange={(event) => void capture({ type: "input", label: "Kullanıcı adı girildi", target: "username", value: event.target.value, appArea: "Giriş", selectorHint: "input[name=username]" })} />
        <input className="input" placeholder="Şifre/PIN kaydedilmez" type="password" onChange={() => void capture({ type: "input", label: "Şifre alanı kullanıldı", target: "password", value: "MASKED_SECRET", appArea: "Giriş", selectorHint: "input[type=password]" })} />
      </div>
      <button className="button-primary mt-4" onClick={() => void capture({ type: "app.login", label: "Uygulamaya giriş yapıldı", target: "login-button", appArea: "Giriş", selectorHint: "button:has-text('Giriş')" })}>
        Giriş Yap
      </button>
    </div>
  );
}

function RecorderReports({ capture }: { capture: (event: Omit<RecorderEvent, "id" | "ts">) => Promise<void> }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <h3 className="font-bold">Raporlar</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <select className="input" onChange={(event) => void capture({ type: "report.filter", label: "Rapor türü seçildi", target: "report-type", value: event.target.value, appArea: "Raporlar", selectorHint: "select[name=reportType]" })}>
          <option>Günlük satış</option>
          <option>Cari bakiye</option>
          <option>Stok hareketi</option>
        </select>
        <input className="input" type="date" onChange={(event) => void capture({ type: "report.filter", label: "Rapor tarihi seçildi", target: "report-date", value: event.target.value, appArea: "Raporlar", selectorHint: "input[type=date]" })} />
        <button className="button-secondary" onClick={() => void capture({ type: "report.open", label: "Rapor görüntülendi", target: "open-report", appArea: "Raporlar", selectorHint: "button[data-action=open-report]" })}>Raporu Aç</button>
      </div>
      <div className="mt-5 rounded-lg border border-line bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Günlük Satış Raporu</div>
            <div className="text-sm text-muted">12 satır · toplam 184.200 TL · 3 kritik fark</div>
          </div>
          <button className="button-primary" onClick={() => void capture({ type: "report.export", label: "Rapor indirildi", target: "export-report", value: "gunluk-satis.xlsx", appArea: "Raporlar", selectorHint: "button[data-action=export]" })}>
            İndir
          </button>
        </div>
      </div>
    </div>
  );
}

function RecorderEmail({ capture }: { capture: (event: Omit<RecorderEvent, "id" | "ts">) => Promise<void> }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <h3 className="font-bold">E-posta</h3>
      <div className="mt-4 space-y-3">
        <button className="button-secondary" onClick={() => void capture({ type: "email.read", label: "Gelen e-posta okundu", target: "read-email", appArea: "E-posta", selectorHint: "mail.thread:first" })}>Gelen E-postayı Oku</button>
        <button className="button-secondary" onClick={() => void capture({ type: "email.summarize", label: "E-posta özetlendi", target: "summarize-email", appArea: "E-posta", value: "Müşteri geciken rapor özetini istiyor.", selectorHint: "ai.summarize" })}>Özetle</button>
        <input className="input" placeholder="Alıcı" onChange={(event) => void capture({ type: "input", label: "Alıcı e-posta yazıldı", target: "email-to", value: event.target.value, appArea: "E-posta", selectorHint: "input[name=to]" })} />
        <textarea className="input min-h-24" placeholder="E-posta taslağı" onChange={(event) => void capture({ type: "email.draft", label: "E-posta taslağı hazırlandı", target: "email-body", value: event.target.value.slice(0, 120), appArea: "E-posta", selectorHint: "textarea[name=body]" })} />
        <button className="button-primary" onClick={() => void capture({ type: "email.send", label: "E-posta gönder butonuna basıldı", target: "send-email", appArea: "E-posta", selectorHint: "button[data-action=send]" })}>Gönder</button>
      </div>
    </div>
  );
}

function AutomationDraftPanel({ draft, onPublish }: { draft: AutomationDraft; onPublish: () => Promise<void> }) {
  return (
    <section className="panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">{draft.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{draft.objective}</p>
          <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">AI güveni %{draft.confidence}</div>
        </div>
        <button className="button-primary" onClick={() => void onPublish()} disabled={draft.status === "published"}>
          <CheckCircle2 size={16} />
          Workflow Olarak Yayınla
        </button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div>
          <h3 className="font-bold">Otomasyon Adımları</h3>
          <div className="mt-3 space-y-3">
            {draft.steps.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-line bg-white p-4">
                <div className="text-xs font-semibold text-brand">{index + 1}. {step.type}</div>
                <div className="mt-1 font-semibold">{step.title}</div>
                <div className="mt-1 text-sm text-muted">{step.description}</div>
                {step.requiresApproval ? <div className="mt-2 text-xs font-semibold text-amber-700">İnsan onayı zorunlu</div> : null}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <h3 className="font-bold">Alt Otomasyonlar</h3>
            <div className="mt-3 space-y-2">
              {draft.subAutomations.map((item) => (
                <div key={item.name} className="rounded-lg border border-line bg-slate-50 p-3">
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-sm text-muted">{item.purpose}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-bold">Değişkenler</h3>
            <div className="mt-3 space-y-2">
              {draft.variables.length === 0 ? <div className="text-sm text-muted">AI değişken alan tespit etmedi.</div> : null}
              {draft.variables.map((variable) => (
                <div key={variable.key} className="rounded-lg border border-line bg-white p-3 text-sm">
                  <span className="font-semibold">{variable.label}</span> · {variable.example}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Hero({ data }: { data: SaasDashboard }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-brand ring-1 ring-teal-100">
          <ShieldCheck size={14} />
          Canlıya hazır uyum çekirdeği
        </div>
        <h1 className="text-2xl font-bold tracking-normal">OtoFlow AI KOBİ RPA Platformu</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
          {data.organization.name} için bulut robotları, insan onayları, doküman işleme, fikir havuzu ve KVKK audit katmanı tek konsolda.
        </p>
      </div>
      <div className="rounded-lg border border-line bg-white p-4 text-sm">
        <div className="font-semibold">{data.plan.name} Plan</div>
        <div className="mt-1 text-muted">Manuel faturalama · {data.subscription.currentPeriodEnd} dönem sonu</div>
      </div>
    </div>
  );
}

function Overview({ data, setTab }: { data: SaasDashboard; setTab: (tab: Tab) => void }) {
  const cards = [
    { label: "Kazanılan Saat", value: `${formatNumber(data.kpis.savedHours)} saat`, icon: TimerReset },
    { label: "Robot Başarı", value: `%${data.kpis.successRate}`, icon: Gauge },
    { label: "Bekleyen Onay", value: data.kpis.pendingApprovals, icon: AlertTriangle },
    { label: "Aktif Robot", value: data.kpis.activeRobots, icon: Bot }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.label} onClick={() => card.label === "Bekleyen Onay" && setTab("approvals")} className="panel p-5 text-left">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted">{card.label}</div>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-brand">
                  <Icon size={19} />
                </div>
              </div>
              <div className="mt-4 text-2xl font-bold">{card.value}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="panel p-5">
          <h2 className="section-title">Plan Kullanımı</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Usage label="Otomasyon" value={data.usage.workflows} limit={data.plan.limits.workflows} />
            <Usage label="Aylık Robot İşi" value={data.usage.monthlyJobs} limit={data.plan.limits.monthlyJobs} />
            <Usage label="Doküman" value={data.usage.documents} limit={data.plan.limits.documents} />
            <Usage label="Bağlayıcı" value={data.usage.connectors} limit={data.plan.limits.connectors} />
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="section-title">UiPath’ten Sadeleştirilen Kabiliyetler</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Capability icon={GitBranch} title="Orchestrator" text="Job, queue, retry, log ve schedule modeli." />
            <Capability icon={MailCheck} title="Action Center" text="İnsan onaylı iş kutusu ve exception akışı." />
            <Capability icon={FileSearch} title="IDP" text="Dokümandan alan çıkarımı ve confidence kontrolü." />
            <Capability icon={Sparkles} title="Automation Hub" text="Otomasyon fikri, ROI ve uygulanabilirlik puanı." />
          </div>
        </section>
      </div>
    </div>
  );
}

function Workflows({ data, onRun }: { data: SaasDashboard; onRun: (workflow: Workflow) => void }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {data.workflows.map((workflow) => (
        <div key={workflow.id} className="panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase text-brand">{workflow.category} · {workflow.status}</div>
              <h2 className="mt-1 text-lg font-bold">{workflow.name}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{workflow.description}</p>
            </div>
            <button className="button-primary shrink-0" disabled={workflow.status !== "published"} onClick={() => onRun(workflow)}>
              <Play size={16} />
              Çalıştır
            </button>
          </div>
          <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-muted ring-1 ring-line">Tetikleyici: {workflow.trigger}</div>
        </div>
      ))}
    </section>
  );
}

function Jobs({ data, refresh }: { data: SaasDashboard; refresh: () => Promise<void> }) {
  async function cancel(job: Job) {
    await api.cancelJob(job.id);
    await refresh();
  }

  return (
    <section className="panel overflow-hidden">
      <TableHeader title="Robot İşleri" subtitle="Queue, job lifecycle ve robot log takibi" />
      <DataTable
        headers={["Job", "Workflow", "Durum", "Retry", "Zaman", "Aksiyon"]}
        rows={data.jobs.map((job) => [
          job.id,
          data.workflows.find((workflow) => workflow.id === job.workflowId)?.name ?? job.workflowId,
          <StatusPill key="status" value={job.status} />,
          `${job.retryCount}/${job.maxRetries}`,
          formatDate(job.createdAt),
          job.status === "waiting_approval" || job.status === "queued" || job.status === "running" ? (
            <button key="cancel" className="text-sm font-semibold text-danger" onClick={() => void cancel(job)}>
              İptal
            </button>
          ) : (
            <span key="done" className="text-sm text-muted">Kapandı</span>
          )
        ])}
      />
    </section>
  );
}

function Approvals({ data, onResolve }: { data: SaasDashboard; onResolve: (task: ApprovalTask, approved: boolean) => void }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {data.approvals.map((task) => (
        <div key={task.id} className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <RiskBadge value={task.riskLevel} />
              <h2 className="mt-3 text-lg font-bold">{task.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{task.summary}</p>
            </div>
            <StatusPill value={task.status} />
          </div>
          <div className="mt-4 space-y-2">
            {task.diff.map((item) => (
              <div key={item.label} className="rounded-md bg-slate-50 p-3 text-sm ring-1 ring-line">
                <span className="font-semibold">{item.label}:</span> {item.before} → {item.after}
              </div>
            ))}
          </div>
          {task.status === "pending" ? (
            <div className="mt-5 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => onResolve(task, false)}>Reddet</button>
              <button className="button-primary" onClick={() => onResolve(task, true)}>Onayla</button>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function Documents({ data, refresh }: { data: SaasDashboard; refresh: () => Promise<void> }) {
  const [type, setType] = useState<DocumentRecord["type"]>("invoice");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadDocument() {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      await api.uploadDocument({ file, type });
      setFile(null);
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Doküman yüklenemedi.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="section-title">Doküman Yükle</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            className="input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv,application/json"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <select className="input" value={type} onChange={(event) => setType(event.target.value as DocumentRecord["type"])}>
            <option value="invoice">Fatura</option>
            <option value="order">Sipariş</option>
            <option value="customs">Gümrük</option>
            <option value="reconciliation">Mutabakat</option>
            <option value="other">Diğer</option>
          </select>
          <button className="button-primary" onClick={() => void uploadDocument()} disabled={!file || isUploading}>
            <Upload size={16} />
            {isUploading ? "Yükleniyor" : "Yükle"}
          </button>
        </div>
        {file ? <div className="mt-3 text-sm text-muted">{file.name} · {Math.ceil(file.size / 1024)} KB</div> : null}
        {error ? <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</div> : null}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {data.documents.map((doc) => (
          <div key={doc.id} className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">{doc.name}</h2>
                <div className="mt-1 text-sm text-muted">
                  {doc.type} · {doc.status}
                  {doc.source ? ` · ${doc.source}` : ""}
                  {doc.sizeBytes ? ` · ${Math.ceil(doc.sizeBytes / 1024)} KB` : ""}
                </div>
              </div>
              <FileSearch className="text-brand" size={22} />
            </div>
            <div className="mt-4 space-y-2">
              {doc.fields.map((field) => (
                <div key={field.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3 ring-1 ring-line">
                  <div>
                    <div className="text-sm font-semibold">{field.label}</div>
                    <div className="text-sm text-muted">{field.value}</div>
                  </div>
                  <span className={`badge ${field.confidence < 80 ? "bg-red-100 text-red-800 ring-red-200" : field.confidence < 96 ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-emerald-100 text-emerald-800 ring-emerald-200"}`}>%{field.confidence}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Opportunities({ data, refresh }: { data: SaasDashboard; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState("Yeni KOBİ otomasyonu");

  async function add() {
    await api.createOpportunity({ title, department: "Operasyon", monthlyVolume: 120, minutesPerTask: 7, errorRisk: 3, feasibility: 80 });
    setTitle("Yeni KOBİ otomasyonu");
    await refresh();
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="section-title">Otomasyon Fikri Ekle</h2>
        <div className="mt-4 flex gap-3">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          <button className="button-primary" onClick={() => void add()}>
            <Plus size={16} />
            Ekle
          </button>
        </div>
      </section>
      <section className="panel overflow-hidden">
        <TableHeader title="Fikir Havuzu" subtitle="Automation Hub mantığında ROI ve uygulanabilirlik puanı" />
        <DataTable
          headers={["Süreç", "Departman", "Hacim", "Dakika", "Risk", "ROI", "Durum"]}
          rows={data.opportunities.map((item) => [item.title, item.department, item.monthlyVolume, item.minutesPerTask, item.errorRisk, item.roiScore, item.status])}
        />
      </section>
    </div>
  );
}

function Connectors({ data, refresh, setMessage }: { data: SaasDashboard; refresh: () => Promise<void>; setMessage: (message: string | null) => void }) {
  const [name, setName] = useState("Yeni Webhook");
  const [secret, setSecret] = useState("demo-secret-123");
  const [type, setType] = useState<ConnectorAccount["type"]>("webhook");

  async function add() {
    setMessage(null);
    try {
      await api.createConnector({ name, type, secret });
      setName("Yeni Webhook");
      setSecret("demo-secret-123");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bağlayıcı eklenemedi.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="section-title">Bağlayıcı Ekle</h2>
        <p className="muted mt-1">E-imza PIN’i, OTP, banka şifresi ve kişisel elektronik imza saklanamaz.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_1fr_auto]">
          <select className="input" value={type} onChange={(event) => setType(event.target.value as ConnectorAccount["type"])}>
            <option value="email">E-posta</option>
            <option value="google_sheets">Google Sheets</option>
            <option value="webhook">Webhook</option>
            <option value="portal">Portal</option>
            <option value="csv">CSV</option>
          </select>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="input" value={secret} onChange={(event) => setSecret(event.target.value)} />
          <button className="button-primary" onClick={() => void add()}>
            <KeyRound size={16} />
            Ekle
          </button>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.connectors.map((connector) => (
          <div key={connector.id} className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">{connector.name}</h2>
                <div className="mt-1 text-sm text-muted">{connector.type}</div>
              </div>
              <LockKeyhole className="text-brand" size={22} />
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <StatusPill value={connector.status} />
              <span className="text-muted">{connector.secretPreview}</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Compliance({ data, refresh }: { data: SaasDashboard; refresh: () => Promise<void> }) {
  async function addPolicy() {
    await api.createPolicy({ name: "Yeni saklama kuralı", description: "KOBİ verileri için operasyonel saklama ve audit kontrolü.", policyType: "retention" });
    await refresh();
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        {data.policies.map((policy) => (
          <div key={policy.id} className="panel p-5">
            <ShieldCheck className="text-brand" size={22} />
            <h2 className="mt-3 font-bold">{policy.name}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{policy.description}</p>
          </div>
        ))}
      </section>
      <button className="button-primary" onClick={() => void addPolicy()}>
        <Plus size={16} />
        Uyum Politikası Ekle
      </button>
      <section className="panel overflow-hidden">
        <TableHeader title="Audit Log" subtitle="Tenant scope ile robot, AI, kullanıcı ve sistem olayları" />
        <DataTable headers={["Zaman", "Aktör", "Aksiyon", "Varlık"]} rows={data.audit.map((event) => [formatDate(event.ts), event.actor, event.action, `${event.entityType}:${event.entityId}`])} />
      </section>
    </div>
  );
}

function Usage({ label, value, limit }: { label: string; value: number; limit: number }) {
  const percent = Math.min(100, Math.round((value / limit) * 100));
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted">{value}/{limit}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Capability({ icon: Icon, title, text }: { icon: typeof Bot; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-white p-3">
      <Icon className="mt-0.5 text-brand" size={18} />
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-muted">{text}</div>
      </div>
    </div>
  );
}

function TableHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-line p-5">
      <h2 className="section-title">{title}</h2>
      <p className="muted">{subtitle}</p>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse">
        <thead className="table-head">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="hover:bg-slate-50">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="table-cell">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone = value.includes("pending") || value.includes("waiting") || value.includes("needs") || value === "queued" ? "bg-amber-100 text-amber-800 ring-amber-200" : value.includes("failed") || value.includes("rejected") || value.includes("cancelled") ? "bg-red-100 text-red-800 ring-red-200" : "bg-emerald-100 text-emerald-800 ring-emerald-200";
  return <span className={`badge ${tone}`}>{value}</span>;
}

function RiskBadge({ value }: { value: string }) {
  const tone = value === "critical" || value === "high" ? "bg-red-100 text-red-800 ring-red-200" : value === "medium" ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-emerald-100 text-emerald-800 ring-emerald-200";
  return <span className={`badge ${tone}`}>{value}</span>;
}
