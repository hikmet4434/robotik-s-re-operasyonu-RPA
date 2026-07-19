import { CalendarDays, CheckCircle2, FolderOpen, Play, Save, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AiAutomationPlan, AiRuntimeStatus, Workflow } from "../../shared/saasTypes";
import { api } from "../api";
import { useExperienceMode } from "../ui/ExperienceMode";

const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export function AiAutomationBuilder({ refreshDashboard }: { refreshDashboard: () => Promise<void> }) {
  const { mode } = useExperienceMode();
  const [aiStatus, setAiStatus] = useState<AiRuntimeStatus | null>(null);
  const [prompt, setPrompt] = useState("Bütün dosyalarımı haftada bir incele. Son bir haftada yeni gelen ve değişen dosyaları özetle, günlere göre neler yaptığımı raporla. Her pazartesi saat 09:00'da raporu hazırla.");
  const [directoryPath, setDirectoryPath] = useState("/Users/ht44/Documents");
  const [reportPath, setReportPath] = useState("/Users/ht44/Documents/OtoFlow Raporları/haftalik-dosya-raporu.md");
  const [frequency, setFrequency] = useState<"manual" | "daily" | "weekly">("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [time, setTime] = useState("09:00");
  const [approvalAtEnd, setApprovalAtEnd] = useState(false);
  const [plan, setPlan] = useState<AiAutomationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => undefined);
  }, []);

  const schedule = useMemo(() => {
    if (frequency === "manual") return { cron: undefined, label: "Manuel başlat" };
    const [hour, minute] = time.split(":").map(Number);
    if (frequency === "daily") return { cron: `${minute} ${hour} * * *`, label: `Her gün ${time}` };
    return { cron: `${minute} ${hour} * * ${dayOfWeek}`, label: `Her ${dayNames[dayOfWeek].toLocaleLowerCase("tr-TR")} ${time}` };
  }, [dayOfWeek, frequency, time]);

  async function generatePlan() {
    setBusy(true);
    setMessage(null);
    try {
      const generated = await api.generateAiAutomation({
        prompt,
        directoryPath,
        reportPath,
        cron: schedule.cron,
        timezone: "Europe/Istanbul",
        scheduleLabel: schedule.label,
        approvalAtEnd
      });
      setPlan(generated);
      setMessage(`${generated.providerLabel} ile ${generated.steps.length} adımlı taslak hazırlandı.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Otomasyon taslağı hazırlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  function updateStepApproval(index: number, requiresApproval: boolean) {
    if (!plan) return;
    setPlan({
      ...plan,
      steps: plan.steps.map((step, stepIndex) => stepIndex === index ? {
        ...step,
        requiresApproval,
        approvalPrompt: requiresApproval ? step.approvalPrompt || `${step.title} adımı çalıştırılsın mı?` : undefined
      } : step)
    });
  }

  async function saveWorkflow(runNow: boolean) {
    if (!plan) return;
    setBusy(true);
    setMessage(null);
    try {
      const workflow = await api.createAiWorkflow(plan);
      if (runNow) await api.runWorkflow(workflow.id, "AI ile hazırlanan workflow ilk çalıştırması");
      await refreshDashboard();
      setMessage(runNow ? "Otomasyon kaydedildi ve çalışmaya başladı." : "Otomasyon kaydedildi; belirlediğiniz zamanda otomatik çalışacak.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Otomasyon kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand"><Sparkles size={17} /> Yazarak Otomasyon Oluştur</div>
            <h2 className="text-xl font-bold">Ne yapılmasını istiyorsunuz?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">İşi bir çalışma arkadaşınıza anlatır gibi yazın. Zamanlama ve onay adımlarını birlikte hazırlayacağız.</p>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <ShieldCheck size={16} /> {mode === "advanced" && aiStatus?.mode === "openrouter_fallback" ? `${aiStatus.modelCount} yedekli AI modeli hazır` : "AI hazır ve güvenli"}
          </div>
        </div>

        <label className="mt-5 block text-sm font-semibold">Yapılacak işi anlatın
          <textarea className="input mt-2 min-h-56 resize-y leading-6" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
      </section>

      <section className="panel p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm font-semibold"><CalendarDays className="mr-2 inline text-brand" size={16} />Çalışma sıklığı
            <select className="input mt-2" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}>
              <option value="manual">Manuel</option><option value="daily">Her gün</option><option value="weekly">Her hafta</option>
            </select>
          </label>
          {frequency === "weekly" ? <label className="block text-sm font-semibold">Gün
            <select className="input mt-2" value={dayOfWeek} onChange={(event) => setDayOfWeek(Number(event.target.value))}>
              {dayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label> : <div />}
          {frequency !== "manual" ? <label className="block text-sm font-semibold">Saat
            <input className="input mt-2" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label> : <div />}
          <label className="flex min-h-20 items-center gap-3 rounded-md border border-line bg-slate-50 p-3 text-sm font-semibold">
            <input type="checkbox" checked={approvalAtEnd} onChange={(event) => setApprovalAtEnd(event.target.checked)} />
            Rapor kaydında onay iste
          </label>
        </div>
        <div className={`mt-4 gap-4 lg:grid-cols-2 ${mode === "advanced" ? "grid" : "hidden"}`}>
          <label className="block text-sm font-semibold"><FolderOpen className="mr-2 inline text-brand" size={16} />Taranacak klasör
            <input className="input mt-2" value={directoryPath} onChange={(event) => setDirectoryPath(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">Rapor dosyası
            <input className="input mt-2" value={reportPath} onChange={(event) => setReportPath(event.target.value)} />
          </label>
        </div>
        <button className="button-primary mt-5" disabled={busy || prompt.trim().length < 12} onClick={() => void generatePlan()}>
          <Sparkles size={16} /> {busy ? "Hazırlanıyor..." : "Otomasyonu Hazırla"}
        </button>
        {message ? <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-100">{message}</div> : null}
      </section>

      {plan ? (
        <section className="panel overflow-hidden">
          <div className="border-b border-line p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <input className="input text-base font-bold" value={plan.name} onChange={(event) => setPlan({ ...plan, name: event.target.value })} />
                <textarea className="input mt-3 min-h-20" value={plan.description} onChange={(event) => setPlan({ ...plan, description: event.target.value })} />
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-muted">{mode === "advanced" ? <><span>{plan.providerLabel}</span><span>·</span></> : null}<span>{plan.schedule.label}</span><span>·</span><span>{plan.steps.length} adım</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="button-secondary" disabled={busy} onClick={() => void saveWorkflow(false)}><Save size={16} /> Daha Sonra Kullan</button>
                <button className="button-primary" disabled={busy} onClick={() => void saveWorkflow(true)}><Play size={16} /> Kaydet ve Şimdi Çalıştır</button>
              </div>
            </div>
          </div>
          <div className="divide-y divide-line">
            {plan.steps.map((step, index) => (
              <div key={step.id} className="grid gap-3 p-4 md:grid-cols-[40px_1fr_auto] md:items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-sm font-bold text-muted">{index + 1}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{step.title}</span>{mode === "advanced" ? <span className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-muted">{step.type}</span> : null}</div>
                  <p className="mt-1 text-sm text-muted">{step.description}</p>
                </div>
                <label className="flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold">
                  <input type="checkbox" checked={step.requiresApproval} onChange={(event) => updateStepApproval(index, event.target.checked)} /> Onay iste
                </label>
              </div>
            ))}
          </div>
          <div className="border-t border-line bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mr-2 inline" size={16} /> Hesap şifreleri otomasyona eklenmez; güvenli kasadan yalnızca gerektiğinde kullanılır.
          </div>
        </section>
      ) : null}
    </div>
  );
}
