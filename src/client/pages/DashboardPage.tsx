import {
  AlertTriangle,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileSearch,
  Gauge,
  GitBranch,
  KeyRound,
  LockKeyhole,
  MailCheck,
  Play,
  Plus,
  Radio,
  RefreshCw,
  ScreenShare,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  TimerReset,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  ApprovalTask,
  AutomationDraft,
  AutomationPackage,
  AutomationOpportunity,
  ConnectorAccount,
  CredentialProfile,
  DocumentRecord,
  Job,
  RecorderEvent,
  RecordingSession,
  SaasDashboard,
  Workflow,
  WorkflowStep
} from "../../shared/saasTypes";
import { api, type LocalPreparedReport } from "../api";
import { formatDate, formatNumber } from "../utils";
import { useExperienceMode } from "../ui/ExperienceMode";
import { AiAutomationBuilder } from "./AiAutomationBuilder";

type Tab = "dashboard" | "ai-builder" | "recorder" | "workflows" | "jobs" | "approvals" | "documents" | "opportunities" | "connectors" | "compliance";

const tabLabels: Record<Tab, string> = {
  dashboard: "Ana Sayfa",
  "ai-builder": "Yazarak Oluştur",
  recorder: "Göstererek Oluştur",
  workflows: "Otomasyonlarım",
  jobs: "Hazırlanan Dosyalar",
  approvals: "Onay Bekleyenler",
  documents: "Belgeler",
  opportunities: "Fikirler ve Kazanç",
  connectors: "Hesaplar",
  compliance: "Güvenlik"
};

const tabPaths: Record<Tab, string> = Object.fromEntries((Object.keys(tabLabels) as Tab[]).map((tab) => [tab, tab === "dashboard" ? "/dashboard" : `/${tab}`])) as Record<Tab, string>;
const simpleTabs: Tab[] = ["dashboard", "ai-builder", "recorder", "workflows", "jobs", "approvals", "documents", "connectors"];

export function DashboardPage() {
  const [data, setData] = useState<SaasDashboard | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [message, setMessage] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { mode } = useExperienceMode();
  const visibleTabs = (Object.keys(tabLabels) as Tab[]).filter((tab) => mode === "advanced" || simpleTabs.includes(tab));

  function openTab(tab: Tab) {
    navigate(tabPaths[tab]);
  }

  async function refresh() {
    setData(await api.dashboard());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const byPath: Record<string, Tab> = {
      "/dashboard": "dashboard",
      "/ai-builder": "ai-builder",
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

  useEffect(() => {
    if (!["jobs", "approvals"].includes(activeTab)) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  async function runWorkflow(workflow: Workflow) {
    setMessage(null);
    try {
      await api.runWorkflow(workflow.id, `${workflow.name} için KOBİ demo çalıştırması`);
      setMessage(`${workflow.name} robot kuyruğuna alındı.`);
      await refresh();
      openTab("jobs");
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
      <Hero data={data} mode={mode} />

      <div className={`${mode === "simple" ? "hidden lg:flex" : "flex"} gap-2 overflow-x-auto border-b border-line pb-2`}>
        {visibleTabs.map((tab) => (
          <button key={tab} onClick={() => openTab(tab)} className={`min-h-10 shrink-0 rounded-md px-3 text-sm font-semibold ${activeTab === tab ? "bg-teal-50 text-brand ring-1 ring-teal-100" : "text-muted hover:bg-white hover:text-ink"}`}>
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</div> : null}

      {activeTab === "dashboard" ? <Overview data={data} mode={mode} openTab={openTab} /> : null}
      {activeTab === "ai-builder" ? <AiAutomationBuilder refreshDashboard={refresh} /> : null}
      {activeTab === "recorder" ? <RecorderStudio data={data} refreshDashboard={refresh} /> : null}
      {activeTab === "workflows" ? <Workflows data={data} onRun={runWorkflow} refresh={refresh} setMessage={setMessage} /> : null}
      {activeTab === "jobs" ? <Jobs data={data} refresh={refresh} mode={mode} /> : null}
      {activeTab === "approvals" ? <Approvals data={data} onResolve={approve} /> : null}
      {activeTab === "documents" ? <Documents data={data} refresh={refresh} /> : null}
      {activeTab === "opportunities" ? <Opportunities data={data} refresh={refresh} /> : null}
      {activeTab === "connectors" ? <Connectors data={data} refresh={refresh} setMessage={setMessage} /> : null}
      {activeTab === "compliance" ? <Compliance data={data} refresh={refresh} /> : null}
    </div>
  );
}

function RecorderStudio({ data, refreshDashboard }: { data: SaasDashboard; refreshDashboard: () => Promise<void> }) {
  const { mode, setMode } = useExperienceMode();
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
  const [agentOnline, setAgentOnline] = useState(false);
  const [desktopRecording, setDesktopRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.localAgentHealth().then(() => setAgentOnline(true)).catch(() => setAgentOnline(false));
  }, []);

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
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: "video/webm" });
      setVideoUrl(URL.createObjectURL(blob));
      setScreenStatus("captured");
      try {
        const updated = await api.uploadRecordingVideo(session.id, blob);
        setSession(updated);
        setMessage("Ekran kaydı iş oturumuna kaydedildi.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ekran kaydı sunucuya yüklenemedi.");
      }
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

  async function startDesktopRecording() {
    if (!session) {
      setMessage("Masaüstü kaydı için önce iş kaydını başlat.");
      return;
    }
    try {
      await api.startDesktopRecording(session.id);
      setDesktopRecording(true);
      setAgentOnline(true);
      setMessage("Masaüstü tıklama kaydı başladı. macOS Erişilebilirlik izni istenirse izin verin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Masaüstü kaydı başlatılamadı.");
    }
  }

  async function stopDesktopRecording() {
    try {
      await api.stopDesktopRecording();
      setDesktopRecording(false);
      if (session) {
        const recordings = await api.recordings();
        const current = recordings.find((item) => item.id === session.id);
        if (current) setEvents(current.events);
      }
      setMessage("Masaüstü kaydı durduruldu; yakalanan tıklamalar adım listesine eklendi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Masaüstü kaydı durdurulamadı.");
    }
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

  async function saveDraft(nextDraft: AutomationDraft) {
    const saved = await api.updateAutomationDraft(nextDraft.id, {
      steps: nextDraft.steps,
      credentialId: nextDraft.credentialId,
      title: nextDraft.title,
      objective: nextDraft.objective
    });
    setDraft(saved);
    setMessage("Adımlar, hesap profili ve onay kararları kaydedildi.");
  }

  return (
    <div className="space-y-6">
      {mode === "advanced" ? <RecorderInstallPanel /> : !agentOnline ? <section className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold text-amber-950">Bilgisayar bağlantısı henüz kurulmadı</div><p className="mt-1 text-sm text-amber-900">Tarayıcı içindeki örnek alanı kullanabilir veya bağlantı kurulumunu açabilirsiniz.</p></div><button className="button-secondary shrink-0" onClick={() => setMode("advanced")}>Bağlantı Kurulumunu Aç</button></section> : null}

      <section className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
              <Radio size={14} />
              Bir kez gösterin, tekrarını OtoFlow yapsın
            </div>
            <h2 className="text-xl font-bold">Yaptığınız işi gösterin</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Önce işin adını ve amacını yazın. Kaydı başlattıktan sonra işlemi her zamanki gibi bir kez yapın.
            </p>
            <div className="mt-3"><StatusPill value={agentOnline ? "local_agent_online" : "local_agent_offline"} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary" onClick={() => void startScreenRecording()} disabled={screenStatus === "recording"}>
              <ScreenShare size={16} />
              Tarayıcı Ekranını Kaydet
            </button>
            <button className="button-secondary" onClick={() => void stopScreenRecording()} disabled={screenStatus !== "recording"}>
              Durdur
            </button>
            <button className="button-secondary" onClick={() => void startDesktopRecording()} disabled={!agentOnline || desktopRecording}>
              <Bot size={16} />
              Masaüstünü Kaydet
            </button>
            <button className="button-secondary" onClick={() => void stopDesktopRecording()} disabled={!desktopRecording}>
              Masaüstünü Durdur
            </button>
            <button className="button-primary" onClick={() => void startSession()}>
              <Radio size={16} />
              Adımları Kaydetmeye Başla
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
              <h2 className="section-title">Deneme Alanı</h2>
              <p className="muted">Kaydı başlattıktan sonra aşağıdaki örnek işlemi tamamlayın.</p>
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
          <TableHeader title="Kaydedilen Adımlar" subtitle={`${events.length} adım · ${screenStatus === "recording" ? "ekran kaydı sürüyor" : screenStatus === "captured" ? "ekran kaydı hazır" : "ekran kaydı isteğe bağlı"}`} />
          <div className="max-h-[520px] overflow-y-auto p-4">
            {events.length === 0 ? <div className="rounded-md bg-slate-50 p-4 text-sm text-muted ring-1 ring-line">Kayıt başlayınca tıklamalar, inputlar ve rapor/e-posta adımları burada görünür.</div> : null}
            <div className="space-y-2">
              {events.map((event, index) => (
                <div key={event.id} className="rounded-md border border-line bg-white p-3">
                  <div className="text-xs font-semibold text-brand">{index + 1}. adım{mode === "advanced" ? ` · ${event.type}` : ""}</div>
                  <div className="mt-1 text-sm font-medium">{event.label}</div>
                  {mode === "advanced" ? <div className="mt-1 text-xs text-muted">{event.appArea} · {event.value ?? event.selectorHint ?? event.target}</div> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-line p-4">
            <button className="button-primary w-full" disabled={!session || events.length === 0} onClick={() => void analyze()}>
              <Sparkles size={16} />
              Bu Adımlardan Otomasyon Hazırla
            </button>
          </div>
        </section>
      </div>

      {draft ? <AutomationDraftPanel draft={draft} credentialProfiles={data.credentialProfiles} onChange={setDraft} onSave={saveDraft} onPublish={publish} /> : null}
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
            <h2 className="font-bold">Chrome Recorder’ı Kurun</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Dış web uygulamalarında tıklama, input, seçim, form, URL ve sekme olaylarını yakalar. Secret/PIN/OTP alanlarını maskeler.
            </p>
          </div>
        </div>
        <a className="button-primary mt-4" href="/downloads/otoflow-chrome-recorder.zip" download><Download size={16} />Chrome Recorder’ı İndir</a>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>İnen ZIP dosyasını çift tıklayıp klasöre çıkarın.</li>
          <li>Chrome’da <span className="font-mono">chrome://extensions</span> adresini açın.</li>
          <li>Sağ üstten <strong>Geliştirici modu</strong> seçeneğini açın.</li>
          <li><strong>Paketlenmemiş öğe yükle</strong> düğmesine basıp <span className="font-semibold">chrome-recorder</span> klasörünü seçin.</li>
          <li>Chrome araç çubuğundaki OtoFlow Recorder simgesinden kaydı başlatın.</li>
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
              Chrome/ERP adımlarını gerçek tarayıcıda oynatır; macOS uygulamalarını açar, tıklar, yazar ve onaydan sonra kaldığı yerden devam eder.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm ring-1 ring-line">
          Klasör: <span className="font-mono">agents/local-agent</span>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{`cd agents/local-agent
npm install
npm start`}</pre>
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

function AutomationDraftPanel({
  draft,
  credentialProfiles,
  onChange,
  onSave,
  onPublish
}: {
  draft: AutomationDraft;
  credentialProfiles: CredentialProfile[];
  onChange: (draft: AutomationDraft) => void;
  onSave: (draft: AutomationDraft) => Promise<void>;
  onPublish: () => Promise<void>;
}) {
  const { mode } = useExperienceMode();

  function updateStep(index: number, patch: Partial<WorkflowStep>) {
    onChange({ ...draft, steps: draft.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step) });
  }

  function updateParameters(index: number, patch: Partial<NonNullable<WorkflowStep["parameters"]>>) {
    const step = draft.steps[index];
    updateStep(index, { parameters: { ...step.parameters, ...patch } });
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    onChange({ ...draft, steps });
  }

  function addStep() {
    onChange({
      ...draft,
      steps: [...draft.steps, { id: `step_${crypto.randomUUID().slice(0, 8)}`, type: "browser.click", title: "Yeni otomasyon adımı", description: "Teknik kullanıcı tarafından eklendi.", requiresApproval: false, riskLevel: "low", parameters: {} }]
    });
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">{draft.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{draft.objective}</p>
          <div className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">Hazırlık güveni %{draft.confidence}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary" onClick={() => void onSave(draft)}><Save size={16} />Kaydet</button>
          <button className="button-primary" onClick={() => void onSave(draft).then(onPublish)} disabled={draft.status === "published"}>
            <CheckCircle2 size={16} />
            Kullanıma Aç
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4">
        <h3 className="font-bold text-teal-950">Başlangıç Ayarları</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className="text-sm font-semibold text-teal-950">
            Bu otomasyon hangi hesapla çalışacak?
            <select className="input mt-2" value={draft.credentialId || ""} onChange={(event) => onChange({ ...draft, credentialId: event.target.value || undefined })}>
              <option value="">Hesap gerekmiyor / daha sonra seç</option>
              {credentialProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.usernamePreview}</option>)}
            </select>
          </label>
          <div className="text-sm leading-6 text-teal-950">
            Robotun durup sizden onay istemesini istediğiniz adımları aşağıdan seçin. Hesap şifresi otomasyonun içine yazılmaz.
          </div>
        </div>
      </div>

      <div className={`mt-6 grid gap-6 ${mode === "advanced" ? "xl:grid-cols-[1.2fr_0.8fr]" : "grid-cols-1"}`}>
        <div>
          <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Otomasyon Adımları ve Onay Noktaları</h3>{mode === "advanced" ? <button className="button-secondary" onClick={addStep}><Plus size={16} />Adım Ekle</button> : null}</div>
          <div className="mt-3 space-y-3">
            {draft.steps.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  {mode === "advanced" ? <select className="input max-w-64" value={step.type} onChange={(event) => updateStep(index, { type: event.target.value as WorkflowStep["type"] })}>
                    <optgroup label="Tarayıcı"><option value="browser.navigate">Sayfa aç</option><option value="browser.click">Tıkla</option><option value="browser.type">Yaz</option><option value="browser.select">Seç</option><option value="browser.extract">Oku</option><option value="browser.wait">Bekle</option></optgroup>
                    <optgroup label="Masaüstü"><option value="desktop.launch">Uygulama aç</option><option value="desktop.click">Ekrana tıkla</option><option value="desktop.type">Yaz</option><option value="desktop.hotkey">Kısayol</option><option value="desktop.wait">Bekle</option></optgroup>
                    <option value="approval.wait">Yalnızca onay bekle</option>
                  </select> : <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-sm font-bold text-muted">{index + 1}</span>}
                  <div className="flex gap-1">
                    <button className="icon-button" title="Yukarı taşı" onClick={() => moveStep(index, -1)} disabled={index === 0}><ArrowUp size={16} /></button>
                    <button className="icon-button" title="Aşağı taşı" onClick={() => moveStep(index, 1)} disabled={index === draft.steps.length - 1}><ArrowDown size={16} /></button>
                    <button className="icon-button text-danger" title="Adımı sil" onClick={() => onChange({ ...draft, steps: draft.steps.filter((_, stepIndex) => stepIndex !== index) })}><Trash2 size={16} /></button>
                  </div>
                </div>
                <input className="input mt-2 font-semibold" value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} />
                <div className="mt-1 text-sm text-muted">{step.description}</div>
                <div className={`mt-3 gap-2 md:grid-cols-2 ${mode === "advanced" ? "grid" : "hidden"}`}>
                  {step.type === "browser.navigate" ? <input className="input" placeholder="https://erp.example.com" value={step.parameters?.url || ""} onChange={(event) => updateParameters(index, { url: event.target.value })} /> : null}
                  {step.type.startsWith("browser.") && !["browser.navigate", "browser.wait"].includes(step.type) ? <input className="input" placeholder="Ekran seçicisi" value={step.parameters?.selector || ""} onChange={(event) => updateParameters(index, { selector: event.target.value })} /> : null}
                  {["browser.type", "desktop.type"].includes(step.type) ? (
                    <select className="input" value={step.parameters?.credentialField || "value"} onChange={(event) => updateParameters(index, { credentialField: event.target.value === "value" ? undefined : event.target.value as "username" | "password" })}>
                      <option value="value">Sabit/değişken değer</option>
                      <option value="username">Kasadaki kullanıcı adı</option>
                      <option value="password">Kasadaki şifre</option>
                    </select>
                  ) : null}
                  {["browser.type", "desktop.type"].includes(step.type) && !step.parameters?.credentialField ? <input className="input" placeholder="Yazılacak değer" value={step.parameters?.value || ""} onChange={(event) => updateParameters(index, { value: event.target.value })} /> : null}
                  {step.type === "browser.select" ? <input className="input" placeholder="Seçilecek seçenek" value={step.parameters?.option || ""} onChange={(event) => updateParameters(index, { option: event.target.value })} /> : null}
                  {step.type.startsWith("desktop.") ? <input className="input" placeholder="Uygulama adı" value={step.parameters?.appName || ""} onChange={(event) => updateParameters(index, { appName: event.target.value })} /> : null}
                  {step.type === "desktop.click" ? <><input className="input" type="number" min="0" placeholder="X koordinatı" value={step.parameters?.x ?? ""} onChange={(event) => updateParameters(index, { x: event.target.value ? Number(event.target.value) : undefined })} /><input className="input" type="number" min="0" placeholder="Y koordinatı" value={step.parameters?.y ?? ""} onChange={(event) => updateParameters(index, { y: event.target.value ? Number(event.target.value) : undefined })} /></> : null}
                  {step.type === "desktop.hotkey" ? <input className="input" placeholder="command, shift, s" value={step.parameters?.keys?.join(", ") || ""} onChange={(event) => updateParameters(index, { keys: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /> : null}
                  {["browser.wait", "desktop.wait"].includes(step.type) ? <input className="input" type="number" min="0" max="120000" placeholder="Bekleme (ms)" value={step.parameters?.timeoutMs ?? 1000} onChange={(event) => updateParameters(index, { timeoutMs: Number(event.target.value) })} /> : null}
                </div>
                <label className="mt-4 flex items-center gap-3 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                  <input type="checkbox" checked={step.requiresApproval || step.type === "approval.wait"} disabled={step.type === "approval.wait"} onChange={(event) => updateStep(index, { requiresApproval: event.target.checked, approvalPrompt: event.target.checked ? step.approvalPrompt || `${step.title} çalışmadan önce onaylıyor musunuz?` : undefined })} />
                  Bu adımdan önce benden onay iste
                </label>
                {step.requiresApproval || step.type === "approval.wait" ? <input className="input mt-2" value={step.approvalPrompt || ""} placeholder="Onay ekranında sorulacak soru" onChange={(event) => updateStep(index, { approvalPrompt: event.target.value })} /> : null}
              </div>
            ))}
          </div>
        </div>
        <div className={`space-y-5 ${mode === "advanced" ? "block" : "hidden"}`}>
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

function Hero({ data, mode }: { data: SaasDashboard; mode: "simple" | "advanced" }) {
  const firstName = data.user.name.trim().split(/\s+/)[0];
  const attentionCount = data.kpis.pendingApprovals + data.documents.filter((doc) => doc.status === "needs_review").length + data.jobs.filter((job) => job.status === "failed").length;
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-brand ring-1 ring-teal-100">
          <ShieldCheck size={14} />
          {attentionCount ? `${attentionCount} konu sizi bekliyor` : "Her şey yolunda"}
        </div>
        <h1 className="text-2xl font-bold tracking-normal">{mode === "simple" ? `Merhaba ${firstName}` : "OtoFlow AI Operasyon Merkezi"}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
          {mode === "simple" ? "Bugün yapmak istediğiniz işi seçin; OtoFlow gerekli adımlarda size yol gösterecek." : `${data.organization.name} otomasyon altyapısı, robot işleri, onaylar ve güvenlik kayıtları.`}
        </p>
      </div>
      <div className="rounded-lg border border-line bg-white p-4 text-sm">
        <div className="font-semibold">{data.organization.name}</div>
        <div className="mt-1 text-muted">{data.plan.name} plan · {data.workflows.filter((workflow) => workflow.status === "published").length} hazır otomasyon</div>
      </div>
    </div>
  );
}

function Overview({ data, mode, openTab }: { data: SaasDashboard; mode: "simple" | "advanced"; openTab: (tab: Tab) => void }) {
  if (mode === "simple") return <SimpleOverview data={data} openTab={openTab} />;

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
            <button key={card.label} onClick={() => card.label === "Bekleyen Onay" && openTab("approvals")} className="panel p-5 text-left">
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

function SimpleOverview({ data, openTab }: { data: SaasDashboard; openTab: (tab: Tab) => void }) {
  const actions = [
    { title: "Ne istediğinizi yazın", text: "Yapılacak işi günlük dille anlatın.", icon: Sparkles, tab: "ai-builder" as Tab, tone: "bg-teal-50 text-brand" },
    { title: "Yaptığınız işi gösterin", text: "Ekranda bir kez yapın, adımları kaydedelim.", icon: Radio, tab: "recorder" as Tab, tone: "bg-blue-50 text-blue-700" },
    { title: "Hazır otomasyonu çalıştırın", text: "Daha önce hazırlanan işlerden birini seçin.", icon: Play, tab: "workflows" as Tab, tone: "bg-emerald-50 text-emerald-700" },
    { title: "Hazırlanan dosyaları görün", text: "Raporları açın veya bilgisayarınıza indirin.", icon: Download, tab: "jobs" as Tab, tone: "bg-amber-50 text-amber-700" }
  ];
  const attentionItems = [
    { label: "Onayınızı bekleyen işler", count: data.approvals.filter((task) => task.status === "pending").length, tab: "approvals" as Tab },
    { label: "Kontrol edilmesi gereken belgeler", count: data.documents.filter((doc) => doc.status === "needs_review").length, tab: "documents" as Tab },
    { label: "Tamamlanamayan otomasyonlar", count: data.jobs.filter((job) => job.status === "failed").length, tab: "jobs" as Tab }
  ];
  const setupItems = [
    { label: "Bir uygulama hesabı bağlandı", complete: data.connectors.length > 0, tab: "connectors" as Tab },
    { label: "İlk otomasyon hazırlandı", complete: data.workflows.length > 0, tab: "ai-builder" as Tab },
    { label: "Bir otomasyon kullanıma açıldı", complete: data.workflows.some((workflow) => workflow.status === "published"), tab: "workflows" as Tab },
    { label: "Bilgisayar ajanı bağlantısı kuruldu", complete: data.workers.some((worker) => worker.runtime === "local" && worker.status !== "offline"), tab: "recorder" as Tab }
  ];
  const setupComplete = setupItems.filter((item) => item.complete).length;

  return (
    <div className="space-y-7">
      <section>
        <h2 className="section-title">Bugün ne yapmak istersiniz?</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => {
            const Icon = action.icon;
            return <button key={action.title} className="panel group p-5 text-left transition hover:border-teal-300 hover:shadow-md" onClick={() => openTab(action.tab)}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-md ${action.tone}`}><Icon size={21} /></div>
              <h3 className="mt-4 font-bold">{action.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{action.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">Başla <ArrowRight size={15} /></span>
            </button>;
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="panel overflow-hidden">
          <TableHeader title="Sizi Bekleyenler" subtitle="Önce ilgilenmeniz gereken konular" />
          <div className="divide-y divide-line">
            {attentionItems.map((item) => <button key={item.label} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50" onClick={() => openTab(item.tab)}>
              <span className="text-sm font-semibold">{item.label}</span>
              <span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold ${item.count ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{item.count}</span>
            </button>)}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-line p-5">
            <div className="flex items-center justify-between"><h2 className="section-title">Başlangıç Durumu</h2><span className="text-sm font-semibold text-brand">{setupComplete}/{setupItems.length}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand" style={{ width: `${(setupComplete / setupItems.length) * 100}%` }} /></div>
          </div>
          <div className="divide-y divide-line">
            {setupItems.map((item) => <button key={item.label} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50" onClick={() => openTab(item.tab)}>
              <CheckCircle2 size={18} className={item.complete ? "text-emerald-600" : "text-slate-300"} />
              <span className={`text-sm ${item.complete ? "text-muted line-through" : "font-semibold"}`}>{item.label}</span>
            </button>)}
          </div>
        </section>
      </div>

      <section>
        <h2 className="section-title">İşler nasıl gidiyor?</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Metric label="Başarı oranı" value={data.kpis.successRate} detail="Tamamlanan otomasyonların yüzdesi" suffix="%" />
          <Metric label="Kazanılan zaman" value={data.kpis.savedHours} detail="Aylık tahmini zaman kazancı" suffix=" saat" />
          <Metric label="Kullanıma hazır" value={data.workflows.filter((workflow) => workflow.status === "published").length} detail="Hemen çalıştırılabilecek otomasyon" />
        </div>
      </section>
    </div>
  );
}

function Workflows({
  data,
  onRun,
  refresh,
  setMessage
}: {
  data: SaasDashboard;
  onRun: (workflow: Workflow) => void;
  refresh: () => Promise<void>;
  setMessage: (message: string | null) => void;
}) {
  const [credentialByWorkflow, setCredentialByWorkflow] = useState<Record<string, string>>({});

  async function exportFile(workflow: Workflow) {
    const { blob, disposition } = await api.exportAutomation(workflow.id);
    const match = disposition?.match(/filename="([^"]+)"/);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = match?.[1] || `${workflow.name}.otomasyon`;
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage(`${workflow.name} şifresiz .otomasyon dosyası olarak indirildi.`);
  }

  async function importFile(file: File) {
    try {
      const pkg = JSON.parse(await file.text()) as AutomationPackage;
      await api.importAutomation(pkg);
      await refresh();
      setMessage(".otomasyon dosyası içe alındı. Hesap gerektiriyorsa profil seçip yayına alın.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Otomasyon dosyası içe alınamadı.");
    }
  }

  async function activate(workflow: Workflow) {
    const credentialId = credentialByWorkflow[workflow.id] || workflow.credentialId;
    await api.configureWorkflow(workflow.id, { credentialId, publish: true });
    await refresh();
    setMessage(`${workflow.name} hesap profiliyle yayına alındı.`);
  }

  async function runConfigured(workflow: Workflow) {
    const credentialId = credentialByWorkflow[workflow.id];
    if (credentialId && credentialId !== workflow.credentialId) await api.configureWorkflow(workflow.id, { credentialId });
    await onRun(workflow);
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><h2 className="section-title">Otomasyon Dosyası</h2><p className="muted mt-1">Workflow’ları şifre içermeyen .otomasyon formatında taşıyın.</p></div>
          <label className="button-secondary cursor-pointer"><Upload size={16} />.otomasyon İçe Al<input className="hidden" type="file" accept=".otomasyon,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /></label>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {data.workflows.map((workflow) => (
          <div key={workflow.id} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-brand"><span>{workflow.category}</span><StatusPill value={workflow.status} /></div>
                <h2 className="mt-1 text-lg font-bold">{workflow.name}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{workflow.description}</p>
              </div>
              <button className="icon-button shrink-0" title=".otomasyon indir" onClick={() => void exportFile(workflow)}><Download size={18} /></button>
            </div>
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-muted ring-1 ring-line">Ne zaman çalışır: {workflow.trigger}</div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select className="input" value={credentialByWorkflow[workflow.id] || workflow.credentialId || ""} onChange={(event) => setCredentialByWorkflow((current) => ({ ...current, [workflow.id]: event.target.value }))}>
                <option value="">Hesap gerekmiyor</option>
                {data.credentialProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.usernamePreview}</option>)}
              </select>
              {workflow.status === "published" ? <button className="button-primary shrink-0" onClick={() => void runConfigured(workflow)}><Play size={16} />Çalıştır</button> : <button className="button-primary shrink-0" onClick={() => void activate(workflow)}><CheckCircle2 size={16} />Kullanıma Aç</button>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Jobs({ data, refresh, mode }: { data: SaasDashboard; refresh: () => Promise<void>; mode: "simple" | "advanced" }) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(data.jobs[0]?.id ?? null);
  const [localReports, setLocalReports] = useState<LocalPreparedReport[]>([]);
  const [localReportsChecked, setLocalReportsChecked] = useState(false);

  useEffect(() => {
    if (mode !== "simple") return;
    let active = true;
    api.localPreparedReports()
      .then((payload) => { if (active) setLocalReports(payload.reports); })
      .catch(() => { if (active) setLocalReports([]); })
      .finally(() => { if (active) setLocalReportsChecked(true); });
    return () => { active = false; };
  }, [mode]);

  async function cancel(job: Job) {
    await api.cancelJob(job.id);
    await refresh();
  }

  async function retry(job: Job) {
    const created = await api.retryJob(job.id);
    setSelectedJobId(created.id);
    await refresh();
  }

  const selectedJob = data.jobs.find((job) => job.id === selectedJobId) ?? data.jobs[0];
  const selectedLogs = selectedJob ? data.jobLogs.filter((log) => log.jobId === selectedJob.id) : [];
  const scheduled = data.workflows.filter((workflow) => workflow.schedule?.enabled);
  const activeCount = data.jobs.filter((job) => ["queued", "running", "waiting_approval"].includes(job.status)).length;
  const preparedReports = data.jobs.filter((job) => {
    const result = friendlyJobResult(job);
    return Boolean(result?.reportPath || result?.detailReportPath);
  });

  function downloadResult(job: Job) {
    const blob = new Blob([JSON.stringify({ jobId: job.id, status: job.status, outputs: job.outputs, completedAt: job.completedAt }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `otoflow-sonuc-${job.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (mode === "simple") {
    return (
      <div className="space-y-5">
        <section className="panel p-5">
          <h2 className="section-title">Hazırlanan Dosyalar</h2>
          <p className="muted mt-1">Otomasyonların hazırladığı raporları burada görebilir, açabilir veya tarayıcınızdan indirebilirsiniz.</p>
          <div className="mt-3 rounded-md bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900 ring-1 ring-blue-100">
            Haftalık raporlar bilgisayarınızda <strong>Belgeler → OtoFlow Raporları</strong> klasörüne de kaydedilir.
          </div>
        </section>

        {localReports.length ? (
          <section className="panel overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">Bilgisayarınızda hazır olan dosyalar</h3><p className="muted mt-1">Dosyaya dokunduğunuzda PDF doğrudan açılır.</p></div><span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{localReports.length} dosya</span></div>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2">
              {localReports.map((report) => (
                <a key={report.name} className={`rounded-lg border p-4 transition hover:shadow-sm ${report.label === "Kısa PDF" ? "border-teal-200 bg-teal-50 hover:border-teal-400" : "border-line bg-white hover:border-slate-400"}`} href={api.localPreparedReportUrl(report.name)} target="_blank" rel="noreferrer">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white ${report.label === "Kısa PDF" ? "text-brand" : "text-slate-700"}`}><FileSearch size={20} /></div>
                    <div className="min-w-0"><div className="font-bold text-ink">{report.label}</div><div className="mt-1 text-sm leading-5 text-muted">{report.description}</div><div className="mt-2 truncate text-xs text-muted">{report.name}</div><div className="mt-3 text-sm font-bold text-brand">Dosyayı Aç →</div></div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {!localReports.length && preparedReports.length ? preparedReports.map((job) => {
          const result = friendlyJobResult(job)!;
          const workflowName = data.workflows.find((workflow) => workflow.id === job.workflowId)?.name;
          return (
            <section key={job.id} className="panel overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-bold">{result.title || workflowName || "Hazırlanan rapor"}</h3>
                    <p className="muted mt-1">{result.summary || "Otomasyon başarıyla tamamlandı ve dosyalar hazırlandı."}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Hazır</span>
                </div>
              </div>
              <div className="grid gap-3 p-5 md:grid-cols-2">
                {result.reportPath ? (
                  <a className="rounded-lg border border-teal-200 bg-teal-50 p-4 transition hover:border-teal-400 hover:shadow-sm" href={api.jobReportUrl(job.id, "summary")} target="_blank" rel="noreferrer">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-brand"><FileSearch size={20} /></div>
                      <div><div className="font-bold text-ink">Kısa PDF</div><div className="mt-1 text-sm leading-5 text-muted">Tek sayfalık, kolay okunur haftalık özet</div><div className="mt-3 text-sm font-bold text-brand">Dosyayı Aç →</div></div>
                    </div>
                  </a>
                ) : null}
                {result.detailReportPath ? (
                  <a className="rounded-lg border border-line bg-white p-4 transition hover:border-slate-400 hover:shadow-sm" href={api.jobReportUrl(job.id, "details")} target="_blank" rel="noreferrer">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700"><FileSearch size={20} /></div>
                      <div><div className="font-bold text-ink">Ayrıntılı PDF</div><div className="mt-1 text-sm leading-5 text-muted">Dosyalarda yapılan işlemlerin sade açıklaması</div><div className="mt-3 text-sm font-bold text-brand">Dosyayı Aç →</div></div>
                    </div>
                  </a>
                ) : null}
              </div>
              {result.generatedAt || job.completedAt ? <div className="border-t border-line px-5 py-3 text-xs text-muted">Hazırlanma tarihi: {formatDate(result.generatedAt || job.completedAt!)}</div> : null}
            </section>
          );
        }) : !localReports.length && localReportsChecked ? (
          <section className="panel p-6 text-center">
            <FileSearch className="mx-auto text-slate-300" size={36} />
            <h3 className="mt-3 font-bold">Bilgisayarınızdaki dosyalara ulaşılamadı</h3>
            <p className="muted mt-1">OtoFlow Yerel Ajanı açık olduğunda hazırlanan PDF’ler burada otomatik görünür.</p>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Aktif İş" value={activeCount} detail={`${data.queueItems.filter((item) => item.status === "queued").length} kuyrukta`} />
        <Metric label="Kuyruk" value={data.queues.length} detail={`${data.queueItems.length} toplam kalem`} />
        <Metric label="Aktif Schedule" value={scheduled.length} detail={scheduled[0]?.schedule?.nextRunAt ? `Sonraki: ${formatDate(scheduled[0].schedule.nextRunAt)}` : "Zamanlama beklenmiyor"} />
      </div>

      <section className="panel overflow-hidden">
        <TableHeader title="Orchestrator İşleri" subtitle="Job yaşam döngüsü, otomatik retry ve robot ataması" />
        <DataTable
          headers={["Job", "Workflow", "Durum", "İlerleme", "Retry", "Robot", "Aksiyon"]}
          rows={data.jobs.map((job) => [
            <button key="select" className="text-left font-mono text-xs font-semibold text-brand" onClick={() => setSelectedJobId(job.id)}>{job.id}</button>,
            data.workflows.find((workflow) => workflow.id === job.workflowId)?.name ?? job.workflowId,
            <StatusPill key="status" value={job.status} />,
            `${Math.min(job.currentStepIndex, job.totalSteps)}/${job.totalSteps}`,
            `${job.retryCount}/${job.maxRetries}`,
            data.workers.find((worker) => worker.id === job.workerId)?.name ?? "Atanmadı",
            ["waiting_approval", "queued", "running"].includes(job.status) ? (
              <button key="cancel" className="text-sm font-semibold text-danger" onClick={() => void cancel(job)}>İptal</button>
            ) : ["failed", "cancelled"].includes(job.status) ? (
              <button key="retry" className="inline-flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => void retry(job)}><RefreshCw size={14} />Yeniden çalıştır</button>
            ) : <span key="done" className="text-sm text-muted">Tamamlandı</span>
          ])}
        />
      </section>

      {selectedJob ? <JobResultPanel job={selectedJob} onDownload={() => downloadResult(selectedJob)} /> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel overflow-hidden">
          <TableHeader title="Kuyruklar" subtitle="İş yükü ve bekleyen kalem görünümü" />
          <DataTable
            headers={["Kuyruk", "Bekleyen", "Çalışan", "Toplam"]}
            rows={data.queues.map((queue) => {
              const items = data.queueItems.filter((item) => item.queueId === queue.id);
              return [queue.name, items.filter((item) => item.status === "queued").length, items.filter((item) => item.status === "running").length, items.length];
            })}
          />
        </section>
        <section className="panel overflow-hidden">
          <TableHeader title="Job Logları" subtitle={selectedJob ? `${selectedJob.id} için zaman sıralı olaylar` : "İncelemek için bir job seçin"} />
          <div className="max-h-80 divide-y divide-line overflow-y-auto">
            {selectedLogs.length ? selectedLogs.map((log) => (
              <div key={log.id} className="grid grid-cols-[90px_70px_1fr] gap-3 px-5 py-3 text-sm">
                <span className="text-xs text-muted">{new Date(log.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                <StatusPill value={log.level} />
                <span>{log.message}</span>
              </div>
            )) : <div className="p-5 text-sm text-muted">Bu iş için henüz log oluşmadı.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

type FriendlyJobResult = {
  status?: string;
  title?: string;
  summary?: string;
  metrics?: Array<{ label: string; value: string }>;
  details?: string[];
  generatedAt?: string;
  source?: string;
  reportContent?: string;
  reportPath?: string;
  detailReportPath?: string;
};

function friendlyJobResult(job: Job): FriendlyJobResult | null {
  const candidate = job.outputs?._result;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as FriendlyJobResult;
}

function JobResultPanel({ job, onDownload }: { job: Job; onDownload: () => void }) {
  const result = friendlyJobResult(job);
  const active = ["queued", "running", "waiting_approval"].includes(job.status);
  const progress = job.totalSteps > 0 ? Math.round((Math.min(job.currentStepIndex, job.totalSteps) / job.totalSteps) * 100) : 0;

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title">{result?.title || (active ? "Otomasyon Çalışıyor" : job.status === "failed" ? "Çalıştırma Sonucu" : "Çalışma Sonucu")}</h2>
          <p className="muted mt-1">{result?.source || `${job.id} numaralı işin ürettiği çıktı`}</p>
        </div>
        {job.outputs && Object.keys(job.outputs).length > 0 ? <button className="button-secondary shrink-0" onClick={onDownload}><Download size={16} />Sonucu İndir</button> : null}
      </div>

      {active ? (
        <div className="px-5 py-5">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold"><span>{job.status === "waiting_approval" ? "Devam etmek için onay bekleniyor" : "Robot adımları sırayla yürütüyor"}</span><span className="text-brand">%{progress}</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} /></div>
          <p className="muted mt-3">{Math.min(job.currentStepIndex + 1, job.totalSteps)}/{job.totalSteps}. adım işleniyor. Sonuç tamamlandığında burada otomatik görünecek.</p>
        </div>
      ) : result ? (
        <div>
          <div className={`px-5 py-4 text-sm leading-6 ${result.status === "agent_required" || job.status === "failed" ? "bg-red-50 text-red-900" : "bg-teal-50 text-teal-950"}`}>{result.summary}</div>
          {result.metrics?.length ? <div className="grid border-y border-line sm:grid-cols-3">{result.metrics.map((metric) => <div key={metric.label} className="border-b border-line px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><div className="text-xs font-semibold uppercase text-muted">{metric.label}</div><div className="mt-1 text-xl font-bold text-ink">{metric.value}</div></div>)}</div> : null}
          {result.details?.length ? <div className="px-5 py-4"><h3 className="text-sm font-bold">Üretilen sonuçlar</h3><div className="mt-3 divide-y divide-line border-y border-line">{result.details.filter(Boolean).map((detail, index) => <div key={`${index}-${detail}`} className="py-3 text-sm leading-6 text-ink">{detail}</div>)}</div></div> : null}
          {result.reportContent ? <div className="border-t border-line px-5 py-4">
            <h3 className="text-sm font-bold">Rapor seçenekleri</h3>
            <p className="muted mt-1">Önce kısa özeti açın. Dosya bazında bilgi gerektiğinde ayrıntılı rapora geçin.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.reportPath ? <a className="button-primary" href={api.jobReportUrl(job.id, "summary")} target="_blank" rel="noreferrer"><FileSearch size={16} />Kısa PDF'i Aç</a> : null}
              {result.detailReportPath ? <a className="button-secondary" href={api.jobReportUrl(job.id, "details")} target="_blank" rel="noreferrer"><FileSearch size={16} />Ayrıntılı PDF'i Aç</a> : null}
            </div>
            <details className="mt-4 rounded-md bg-slate-50 p-4 ring-1 ring-line">
              <summary className="cursor-pointer text-sm font-semibold">Kısa özeti burada göster</summary>
              <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-ink">{result.reportContent}</pre>
            </details>
          </div> : null}
          {result.generatedAt ? <div className="border-t border-line px-5 py-3 text-xs text-muted">Tamamlanma: {formatDate(result.generatedAt)}</div> : null}
        </div>
      ) : (
        <div className={`px-5 py-5 text-sm leading-6 ${job.status === "failed" ? "bg-red-50 text-red-900" : "text-muted"}`}>
          {job.lastError || "Bu eski çalıştırmada görüntülenebilir bir sonuç üretilmemiş. Otomasyonu yeniden çalıştırdığınızda sonuç burada oluşacak."}
        </div>
      )}
    </section>
  );
}

function Approvals({ data, onResolve }: { data: SaasDashboard; onResolve: (task: ApprovalTask, approved: boolean) => void }) {
  const [filter, setFilter] = useState<"pending" | "resolved" | "all">("pending");
  const visible = data.approvals.filter((task) => filter === "all" || (filter === "pending" ? task.status === "pending" : task.status !== "pending"));
  const overdue = data.approvals.filter((task) => task.status === "pending" && new Date(task.dueAt).getTime() < Date.now()).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Bekleyen" value={data.approvals.filter((task) => task.status === "pending").length} detail="İnsan kararı gerekiyor" />
        <Metric label="SLA Aşımı" value={overdue} detail={overdue ? "Öncelikli müdahale" : "Süre aşımı yok"} />
        <Metric label="Exception" value={data.approvals.filter((task) => task.status === "rejected").length} detail="Reddedilerek durdurulan" />
      </div>
      <section className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="section-title">Action Center</h2><p className="muted">Robot ve doküman akışlarının insan karar kutusu</p></div>
        <div className="inline-flex self-start rounded-md border border-line bg-white p-1">
          {(["pending", "resolved", "all"] as const).map((value) => <button key={value} className={`min-h-9 px-3 text-sm font-semibold ${filter === value ? "rounded bg-teal-50 text-brand" : "text-muted"}`} onClick={() => setFilter(value)}>{value === "pending" ? "Bekleyen" : value === "resolved" ? "Tamamlanan" : "Tümü"}</button>)}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
      {visible.map((task) => (
        <div key={task.id} className={`panel p-5 ${task.status === "pending" && new Date(task.dueAt).getTime() < Date.now() ? "border-red-300" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <RiskBadge value={task.riskLevel} />
              <h2 className="mt-3 text-lg font-bold">{task.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{task.summary}</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-muted"><Clock3 size={13} />Son tarih: {formatDate(task.dueAt)}</div>
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
      {visible.length === 0 ? <div className="panel p-8 text-center text-sm text-muted lg:col-span-2">Bu görünümde onay görevi bulunmuyor.</div> : null}
      </section>
    </div>
  );
}

function Documents({ data, refresh }: { data: SaasDashboard; refresh: () => Promise<void> }) {
  const [type, setType] = useState<DocumentRecord["type"]>("invoice");
  const [file, setFile] = useState<File | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
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

  async function verifyField(documentId: string, fieldId: string, currentValue: string) {
    await api.updateDocumentField(documentId, { fieldId, value: draftValues[fieldId] ?? currentValue });
    await refresh();
  }

  async function approveDocument(documentId: string) {
    const task = data.approvals.find((approval) => approval.documentId === documentId && approval.status === "pending");
    if (task) await api.approveTask(task.id);
    await refresh();
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
        {data.documents.map((doc) => {
          const pendingTask = data.approvals.find((approval) => approval.documentId === doc.id && approval.status === "pending");
          const averageConfidence = doc.fields.length ? Math.round(doc.fields.reduce((sum, field) => sum + field.confidence, 0) / doc.fields.length) : 0;
          return <div key={doc.id} className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">{doc.name}</h2>
                <div className="mt-1 text-sm text-muted">
                  {documentTypeLabel(doc.type)}
                  {doc.source ? ` · ${documentSourceLabel(doc.source)}` : ""}
                  {doc.sizeBytes ? ` · ${Math.ceil(doc.sizeBytes / 1024)} KB` : ""}
                </div>
              </div>
              <div className="text-right"><FileSearch className="ml-auto text-brand" size={22} /><div className="mt-1 text-xs font-semibold text-muted">Güven %{averageConfidence}</div><div className="mt-1"><StatusPill value={doc.status} /></div></div>
            </div>
            <div className="mt-4 space-y-2">
              {doc.fields.map((field) => (
                <div key={field.id} className="grid gap-2 rounded-md bg-slate-50 p-3 ring-1 ring-line sm:grid-cols-[120px_1fr_auto_auto] sm:items-center">
                  <div className="text-sm font-semibold">{field.label}</div>
                  <input className="input min-w-0" value={draftValues[field.id] ?? field.value} onChange={(event) => setDraftValues((current) => ({ ...current, [field.id]: event.target.value }))} />
                  <span className={`badge ${field.confidence < 80 ? "bg-red-100 text-red-800 ring-red-200" : field.confidence < 96 ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-emerald-100 text-emerald-800 ring-emerald-200"}`}>%{field.confidence}</span>
                  <button className="icon-button" title={field.verified ? "Alan doğrulandı" : "Alanı doğrula"} onClick={() => void verifyField(doc.id, field.id, field.value)}><Check size={16} className={field.verified ? "text-emerald-600" : "text-muted"} /></button>
                </div>
              ))}
            </div>
            {pendingTask ? <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4"><span className="text-sm text-amber-800">Düşük güvenli alanlar insan onayı bekliyor.</span><button className="button-primary shrink-0" onClick={() => void approveDocument(doc.id)}><CheckCircle2 size={16} />Dokümanı Onayla</button></div> : null}
          </div>;
        })}
      </section>
    </div>
  );
}

function Opportunities({ data, refresh }: { data: SaasDashboard; refresh: () => Promise<void> }) {
  const [title, setTitle] = useState("Yeni KOBİ otomasyonu");
  const [department, setDepartment] = useState("Operasyon");
  const [monthlyVolume, setMonthlyVolume] = useState(120);
  const [minutesPerTask, setMinutesPerTask] = useState(7);
  const [errorRisk, setErrorRisk] = useState(3);
  const [feasibility, setFeasibility] = useState(80);
  const roiForecast = Math.round(monthlyVolume * minutesPerTask * (1 + errorRisk / 10) * (feasibility / 100));

  async function add() {
    await api.createOpportunity({ title, department, monthlyVolume, minutesPerTask, errorRisk, feasibility });
    setTitle("Yeni KOBİ otomasyonu");
    await refresh();
  }

  async function advance(item: AutomationOpportunity) {
    const next: Partial<Record<AutomationOpportunity["status"], AutomationOpportunity["status"]>> = { fikir: "analiz", analiz: "hazir", hazir: "canli", beklemede: "analiz" };
    const status = next[item.status];
    if (!status) return;
    await api.updateOpportunity(item.id, status);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="section-title">Automation Hub Fikri</h2><p className="muted">İş hacmi ve uygulanabilirlik üzerinden öncelik puanı hesaplanır.</p></div><div className="rounded-md bg-teal-50 px-4 py-2 text-sm font-semibold text-brand ring-1 ring-teal-100">Tahmini ROI puanı: {roiForecast}</div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_120px_120px_120px_140px_auto]">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Süreç adı" />
          <input className="input" value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Departman" />
          <label className="text-xs font-semibold text-muted">Aylık adet<input className="input mt-1" type="number" min="1" value={monthlyVolume} onChange={(event) => setMonthlyVolume(Number(event.target.value))} /></label>
          <label className="text-xs font-semibold text-muted">Dakika/iş<input className="input mt-1" type="number" min="1" value={minutesPerTask} onChange={(event) => setMinutesPerTask(Number(event.target.value))} /></label>
          <label className="text-xs font-semibold text-muted">Hata riski<input className="input mt-1" type="number" min="1" max="5" value={errorRisk} onChange={(event) => setErrorRisk(Number(event.target.value))} /></label>
          <label className="text-xs font-semibold text-muted">Uygulanabilirlik<input className="input mt-1" type="number" min="1" max="100" value={feasibility} onChange={(event) => setFeasibility(Number(event.target.value))} /></label>
          <button className="button-primary self-end" onClick={() => void add()} disabled={title.trim().length < 3 || department.trim().length < 2}>
            <Plus size={16} />
            Ekle
          </button>
        </div>
      </section>
      <section className="panel overflow-hidden">
        <TableHeader title="Otomasyon Portföyü" subtitle="ROI, uygulanabilirlik ve değerlendirme aşaması" />
        <DataTable
          headers={["Süreç", "Departman", "Hacim", "Süre", "Risk", "Uygulanabilirlik", "ROI", "Aşama"]}
          rows={data.opportunities.map((item) => [item.title, item.department, item.monthlyVolume, `${item.minutesPerTask} dk`, `${item.errorRisk}/5`, `%${item.feasibility}`, item.roiScore, <button key="status" className="inline-flex items-center gap-2" onClick={() => void advance(item)} disabled={item.status === "canli"}><StatusPill value={item.status} />{item.status !== "canli" ? <span className="text-xs font-semibold text-brand">İlerle</span> : null}</button>])}
        />
      </section>
    </div>
  );
}

function Connectors({ data, refresh, setMessage }: { data: SaasDashboard; refresh: () => Promise<void>; setMessage: (message: string | null) => void }) {
  const [name, setName] = useState("ERP Hesabı");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [type, setType] = useState<ConnectorAccount["type"]>("portal");

  async function add() {
    setMessage(null);
    try {
      await api.createConnector({ name, type, username, password, loginUrl });
      setName("ERP Hesabı");
      setUsername("");
      setPassword("");
      setLoginUrl("");
      await refresh();
      setMessage("Hesap profili şifrelenerek kasaya kaydedildi. Artık workflow başlangıç ayarından seçilebilir.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bağlayıcı eklenemedi.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <h2 className="section-title">Uygulama / ERP Hesabı Ekle</h2>
        <p className="muted mt-1">Robot kullanıcı adı ve şifreyi yalnızca giriş adımında kasadan alır. OTP, SMS kodu, banka ve e-imza bilgileri kalıcı olarak saklanmaz.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[150px_1fr_1.2fr_1fr_1fr_auto]">
          <select className="input" value={type} onChange={(event) => setType(event.target.value as ConnectorAccount["type"])}>
            <option value="email">E-posta</option>
            <option value="google_sheets">Google Sheets</option>
            <option value="webhook">Webhook</option>
            <option value="portal">Portal</option>
            <option value="csv">CSV</option>
          </select>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Hesap adı" />
          <input className="input" value={loginUrl} onChange={(event) => setLoginUrl(event.target.value)} placeholder="https://erp..." />
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Kullanıcı adı" autoComplete="off" />
          <input className="input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Şifre" type="password" autoComplete="new-password" />
          <button className="button-primary" onClick={() => void add()} disabled={!name || (!username && !password)}>
            <KeyRound size={16} />
            Kasaya Ekle
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
            {connector.usernamePreview ? <div className="mt-3 text-sm text-muted">Kullanıcı: {connector.usernamePreview}</div> : null}
            {connector.loginUrl ? <div className="mt-1 truncate text-xs text-muted">{connector.loginUrl}</div> : null}
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

function Metric({ label, value, detail, suffix = "" }: { label: string; value: number; detail: string; suffix?: string }) {
  return (
    <div className="panel p-5">
      <div className="text-sm font-medium text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}{suffix}</div>
      <div className="mt-1 text-xs text-muted">{detail}</div>
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

function documentTypeLabel(type: DocumentRecord["type"]) {
  return ({ invoice: "Fatura", order: "Sipariş", customs: "Gümrük belgesi", reconciliation: "Mutabakat", other: "Diğer belge" } as const)[type];
}

function documentSourceLabel(source: NonNullable<DocumentRecord["source"]>) {
  return ({ demo: "Örnek", upload: "Yüklenen dosya", email: "E-posta", connector: "Bağlı uygulama" } as const)[source];
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
  const tone = value.includes("pending") || value.includes("waiting") || value.includes("needs") || value === "queued" ? "bg-amber-100 text-amber-800 ring-amber-200" : value.includes("failed") || value.includes("rejected") || value.includes("cancelled") || value.includes("offline") ? "bg-red-100 text-red-800 ring-red-200" : "bg-emerald-100 text-emerald-800 ring-emerald-200";
  const labels: Record<string, string> = {
    queued: "Sırada",
    running: "Çalışıyor",
    waiting_approval: "Onay bekliyor",
    succeeded: "Tamamlandı",
    failed: "Tamamlanamadı",
    cancelled: "İptal edildi",
    pending: "Bekliyor",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    needs_review: "Kontrol gerekiyor",
    extracted: "Okundu",
    draft: "Taslak",
    published: "Kullanıma açık",
    paused: "Durduruldu",
    connected: "Bağlı",
    needs_attention: "Kontrol gerekiyor",
    disabled: "Kapalı",
    idle: "Hazır",
    offline: "Bağlantı yok",
    local_agent_online: "Bilgisayar bağlı",
    local_agent_offline: "Bilgisayar bağlantısı yok",
    recording: "Adımlar kaydediliyor",
    info: "Bilgi",
    warn: "Uyarı",
    error: "Hata",
    fikir: "Fikir",
    analiz: "İnceleniyor",
    hazir: "Hazır",
    canli: "Kullanımda",
    beklemede: "Beklemede"
  };
  return <span className={`badge ${tone}`}>{labels[value] ?? value}</span>;
}

function RiskBadge({ value }: { value: string }) {
  const tone = value === "critical" || value === "high" ? "bg-red-100 text-red-800 ring-red-200" : value === "medium" ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-emerald-100 text-emerald-800 ring-emerald-200";
  const labels: Record<string, string> = { critical: "Çok yüksek risk", high: "Yüksek risk", medium: "Orta risk", low: "Düşük risk" };
  return <span className={`badge ${tone}`}>{labels[value] ?? value}</span>;
}
