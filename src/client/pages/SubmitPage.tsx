import { Bot, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CustomsFile } from "../../shared/types";
import { api } from "../api";

const baseSteps = [
  "Portal oturumu açılıyor",
  "Firma ve dosya referansı aranıyor",
  "Beyanname kalemleri eşleştiriliyor",
  "GTİP ve vergi özetleri forma yazılıyor",
  "Kontrol ekranı insan onayı için hazırlanıyor"
];

export function SubmitPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState<CustomsFile | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const healingIndex = useMemo(() => 2 + Math.floor(Math.random() * 2), []);

  useEffect(() => {
    if (!id) return;
    api.file(id).then(setFile);
  }, [id]);

  useEffect(() => {
    if (!file || finished) return;

    if (activeStep >= baseSteps.length) {
      setFinished(true);
      return;
    }

    const timer = window.setTimeout(() => {
      const next = baseSteps[activeStep];
      setLogs((current) => [...current, `✓ ${next}`]);
      void api.log(file.id, { actor: "bot", action: next }).then(setFile);
      if (activeStep === healingIndex) {
        const healing = "⚠ Arayüz değişti → alternatif seçici bulundu, devam ediliyor";
        setLogs((current) => [...current, healing]);
        void api.log(file.id, { actor: "bot", action: healing }).then(setFile);
      }
      setActiveStep((current) => current + 1);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [activeStep, file, finished, healingIndex]);

  async function confirmSubmit() {
    if (!file) return;
    setSubmitting(true);
    const updated = await api.submit(file.id);
    setFile(updated);
    setSubmitting(false);
    setModalOpen(false);
    navigate("/dashboard");
  }

  if (!file) return <div className="panel p-6 muted">Bot simülasyonu hazırlanıyor...</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal">Self-Healing Bot Simülasyonu</h1>
          <p className="mt-1 muted">{file.id} için portal gönderim adımları güvenli demo modunda çalışıyor.</p>
        </div>
        <button className="button-primary" disabled={!finished} onClick={() => setModalOpen(true)}>
          <ShieldAlert size={17} />
          İnsan Onayıyla Gönder
        </button>
      </div>

      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="panel p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-teal-50 text-brand">
              {finished ? <CheckCircle2 size={24} /> : <Loader2 className="animate-spin" size={24} />}
            </div>
            <div>
              <h2 className="section-title">{finished ? "Kontrol hazır" : "Bot çalışıyor"}</h2>
              <p className="muted">Tam otomatik gönderim kapalıdır.</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {baseSteps.map((step, index) => (
              <div
                key={step}
                className={`flex items-center gap-3 rounded-md border p-3 text-sm ${
                  index < activeStep ? "border-teal-200 bg-teal-50 text-teal-900" : "border-line bg-white text-muted"
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold">{index + 1}</span>
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line p-5">
            <Bot className="text-brand" size={22} />
            <div>
              <h2 className="section-title">Bot Log</h2>
              <p className="muted">Self-healing olayları audit log'a da yazılır.</p>
            </div>
          </div>
          <div className="h-[420px] overflow-y-auto bg-slate-950 p-5 font-mono text-sm text-slate-100">
            {logs.length === 0 ? <div className="text-slate-400">Bot kuyruğu başlatılıyor...</div> : null}
            {logs.map((log, index) => (
              <div key={`${log}-${index}`} className={log.startsWith("⚠") ? "mb-3 text-amber-300" : "mb-3 text-emerald-200"}>
                {new Date().toLocaleTimeString("tr-TR")} · {log}
              </div>
            ))}
            {finished ? <div className="text-blue-200">İnsan onayı bekleniyor.</div> : null}
          </div>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-soft">
            <h2 className="text-lg font-bold">Gönderimi onayla</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {file.id} numaralı dosya demo modunda tamamlandı olarak işaretlenecek. Bu işlem bir insan onayı kaydı üretir ve müşteri bildirim metnini iletişim geçmişine ekler.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="button-secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
                Vazgeç
              </button>
              <button className="button-primary" onClick={confirmSubmit} disabled={submitting}>
                {submitting ? "Gönderiliyor" : "Onayla ve gönder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
