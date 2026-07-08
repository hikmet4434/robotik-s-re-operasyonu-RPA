import type { Confidence, FileStatus } from "../shared/types";

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function statusText(status: FileStatus): string {
  const map: Record<FileStatus, string> = {
    onay_bekliyor: "Onay bekliyor",
    tamamlandi: "Tamamlandı",
    hata: "Hata",
    islemde: "İşlemde"
  };
  return map[status];
}

export function confidenceTone(confidence: Confidence): "red" | "yellow" | "green" {
  if (confidence < 80) return "red";
  if (confidence <= 95) return "yellow";
  return "green";
}
