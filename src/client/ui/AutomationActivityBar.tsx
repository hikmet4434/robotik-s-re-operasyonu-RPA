import { ArrowUpRight, CircleCheck, CirclePause, LoaderCircle, OctagonAlert, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Job, JobRunLog, JobStatus, Workflow as WorkflowRecord } from "../../shared/saasTypes";
import { api } from "../api";

type TrackedJob = Job & { logs: JobRunLog[]; workflow?: WorkflowRecord };

const activeStatuses = new Set<JobStatus>(["queued", "running", "waiting_approval"]);
const terminalStatuses = new Set<JobStatus>(["succeeded", "failed", "cancelled"]);

export function jobProgress(job: Pick<Job, "status" | "currentStepIndex" | "totalSteps">) {
  if (job.status === "succeeded") return 100;
  if (job.totalSteps <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((job.currentStepIndex / job.totalSteps) * 100)));
}

export function jobStatusLabel(status: JobStatus) {
  const labels: Record<JobStatus, string> = {
    queued: "Robot hazırlanıyor",
    running: "Otomasyon çalışıyor",
    waiting_approval: "Onay bekleniyor",
    succeeded: "Otomasyon tamamlandı",
    failed: "Otomasyon durdu",
    cancelled: "Otomasyon iptal edildi"
  };
  return labels[status];
}

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "succeeded") return <CircleCheck size={18} aria-hidden="true" />;
  if (status === "waiting_approval") return <CirclePause size={18} aria-hidden="true" />;
  if (status === "failed" || status === "cancelled") return <OctagonAlert size={18} aria-hidden="true" />;
  return <LoaderCircle className="activity-spinner" size={18} aria-hidden="true" />;
}

export function AutomationActivityBar() {
  const [trackedJob, setTrackedJob] = useState<TrackedJob | null>(null);
  const isActive = trackedJob ? activeStatuses.has(trackedJob.status) : false;

  useEffect(() => {
    let disposed = false;

    async function refresh(preferredId?: string) {
      try {
        const jobs = await api.jobs();
        if (disposed) return;
        setTrackedJob((current) => {
          const preferred = preferredId ? jobs.find((job) => job.id === preferredId) : undefined;
          if (preferred) return preferred;
          const active = jobs.find((job) => activeStatuses.has(job.status));
          if (active) return active;
          if (current) return jobs.find((job) => job.id === current.id) ?? null;
          return null;
        });
      } catch {
        // Üst durum göstergesi ana iş akışını engellemez.
      }
    }

    function handleJobStarted(event: Event) {
      const jobId = (event as CustomEvent<{ jobId?: string }>).detail?.jobId;
      void refresh(jobId);
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), isActive ? 1800 : 8000);
    window.addEventListener("otoflow:job-started", handleJobStarted);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("otoflow:job-started", handleJobStarted);
    };
  }, [isActive]);

  useEffect(() => {
    if (!trackedJob || !terminalStatuses.has(trackedJob.status)) return;
    const timer = window.setTimeout(() => setTrackedJob(null), 7000);
    return () => window.clearTimeout(timer);
  }, [trackedJob?.id, trackedJob?.status]);

  const progress = trackedJob ? jobProgress(trackedJob) : 0;
  const latestMessage = useMemo(() => trackedJob?.logs?.[0]?.message, [trackedJob]);

  if (!trackedJob) return null;

  const stepNumber = Math.min(trackedJob.currentStepIndex + 1, Math.max(1, trackedJob.totalSteps));
  const workflowName = trackedJob.workflow?.name || "Otomasyon işi";

  return (
    <div className="automation-activity" data-status={trackedJob.status} role="status" aria-live="polite">
      <div className="automation-activity-inner">
        <div className="activity-signal" aria-hidden="true"><Workflow size={15} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="activity-status-icon"><StatusIcon status={trackedJob.status} /></span>
            <span className="truncate text-sm font-semibold text-white">{jobStatusLabel(trackedJob.status)}</span>
            <span className="hidden truncate text-xs text-slate-300 sm:inline">{workflowName}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-400">
            {latestMessage || (isActive ? `Adım ${stepNumber}/${trackedJob.totalSteps} hazırlanıyor` : workflowName)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="activity-percentage" aria-label={`İlerleme yüzde ${progress}`}>%{progress}</div>
          <Link className="activity-detail-button hidden sm:inline-flex" to="/jobs" title="İş takibini aç" aria-label="İş takibini aç">
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
      <div className="activity-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`${workflowName} ilerlemesi`}>
        <div className="activity-progress-fill" style={{ width: `${progress}%` }} />
        {isActive ? <div className="activity-progress-scan" /> : null}
      </div>
    </div>
  );
}
