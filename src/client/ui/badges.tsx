import type { Confidence, FileStatus } from "../../shared/types";
import { confidenceTone, statusText } from "../utils";

export function StatusBadge({ status }: { status: FileStatus }) {
  const classes: Record<FileStatus, string> = {
    tamamlandi: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    onay_bekliyor: "bg-amber-100 text-amber-800 ring-amber-200",
    hata: "bg-red-100 text-red-800 ring-red-200",
    islemde: "bg-blue-100 text-blue-800 ring-blue-200"
  };
  return <span className={`badge ${classes[status]}`}>{statusText(status)}</span>;
}

export function ConfidenceBadge({ value }: { value: Confidence }) {
  const tone = confidenceTone(value);
  const classes = {
    green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    yellow: "bg-amber-100 text-amber-800 ring-amber-200",
    red: "bg-red-100 text-red-800 ring-red-200"
  };
  return <span className={`badge ${classes[tone]}`}>%{value}</span>;
}
