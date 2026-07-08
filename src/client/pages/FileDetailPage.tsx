import { FileText, History, Mail, ReceiptText, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CustomsFile } from "../../shared/types";
import { api } from "../api";
import { StatusBadge, ConfidenceBadge } from "../ui/badges";
import { formatCurrency, formatDate } from "../utils";

const tabs = [
  { id: "documents", label: "Belgeler", icon: FileText },
  { id: "declaration", label: "Beyanname", icon: ScrollText },
  { id: "tax", label: "Vergi-Harç", icon: ReceiptText },
  { id: "messages", label: "İletişim Geçmişi", icon: Mail },
  { id: "audit", label: "Audit Log", icon: History }
] as const;

type TabId = (typeof tabs)[number]["id"];

export function FileDetailPage() {
  const { id } = useParams();
  const [file, setFile] = useState<CustomsFile | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("documents");

  useEffect(() => {
    if (!id) return;
    api.file(id).then(setFile);
  }, [id]);

  const selectedGtips = useMemo(() => file?.lineItems.map((item) => item.selectedGtip).filter(Boolean).join(", "), [file]);

  if (!file) return <div className="panel p-6 muted">Dosya detayı yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2">
            <StatusBadge status={file.status} />
          </div>
          <h1 className="text-2xl font-bold tracking-normal">{file.id}</h1>
          <p className="mt-1 muted">
            {file.customer} · {file.product}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="button-secondary" to={`/file/${file.id}/validate`}>
            Doğrulama
          </Link>
          <Link className="button-secondary" to={`/file/${file.id}/tax`}>
            Vergi
          </Link>
          <Link className="button-primary" to={`/file/${file.id}/submit`}>
            Bot Akışı
          </Link>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-line bg-white p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold ${
                  activeTab === tab.id ? "bg-teal-50 text-brand" : "text-muted hover:bg-slate-50 hover:text-ink"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="p-5">
          {activeTab === "documents" ? <DocumentsTab file={file} /> : null}
          {activeTab === "declaration" ? <DeclarationTab file={file} selectedGtips={selectedGtips || "Seçilmedi"} /> : null}
          {activeTab === "tax" ? <TaxTab file={file} /> : null}
          {activeTab === "messages" ? <MessagesTab file={file} /> : null}
          {activeTab === "audit" ? <AuditTab file={file} /> : null}
        </div>
      </section>
    </div>
  );
}

function DocumentsTab({ file }: { file: CustomsFile }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {file.documents.map((doc) => (
        <div key={doc.type} className="rounded-lg border border-line bg-white p-4">
          <h3 className="font-semibold">{doc.name}</h3>
          <div className="mt-4 space-y-3">
            {doc.fields.map((field) => (
              <div key={field.key} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium">{field.label}</div>
                  <div className="text-sm text-muted">{field.value}</div>
                </div>
                <ConfidenceBadge value={field.confidence} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeclarationTab({ file, selectedGtips }: { file: CustomsFile; selectedGtips: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Detail label="Müşteri" value={file.customer} />
      <Detail label="Ürün" value={file.product} />
      <Detail label="GTİP" value={selectedGtips} />
      <Detail label="Kur" value={`${file.fxRate.toLocaleString("tr-TR")} TL/USD`} />
      <Detail label="Navlun" value={formatCurrency(file.freightUSD)} />
      <Detail label="Sigorta" value={formatCurrency(file.insuranceUSD)} />
    </div>
  );
}

function TaxTab({ file }: { file: CustomsFile }) {
  if (!file.taxResult) {
    return <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">Vergi hesabı henüz üretilmedi.</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Detail label="CIF" value={formatCurrency(file.taxResult.cifUSD)} />
      <Detail label="Gümrük Vergisi" value={formatCurrency(file.taxResult.customsDutyUSD)} />
      <Detail label="KDV Matrahı" value={formatCurrency(file.taxResult.vatBaseUSD)} />
      <Detail label="KDV" value={formatCurrency(file.taxResult.vatUSD)} />
      <Detail label="Toplam USD" value={formatCurrency(file.taxResult.totalUSD)} />
      <Detail label="Toplam TL" value={formatCurrency(file.taxResult.totalTRY, "TRY")} />
    </div>
  );
}

function MessagesTab({ file }: { file: CustomsFile }) {
  if (file.communicationHistory.length === 0) {
    return <div className="rounded-md bg-slate-50 p-4 text-sm text-muted ring-1 ring-line">Henüz müşteri bildirimi yok.</div>;
  }

  return (
    <div className="space-y-3">
      {file.communicationHistory.map((entry) => (
        <div key={`${entry.ts}-${entry.message}`} className="rounded-lg border border-line bg-white p-4">
          <div className="text-xs font-semibold uppercase text-muted">
            {entry.channel} · {formatDate(entry.ts)}
          </div>
          <p className="mt-2 text-sm leading-6">{entry.message}</p>
        </div>
      ))}
    </div>
  );
}

function AuditTab({ file }: { file: CustomsFile }) {
  return (
    <div className="space-y-3">
      {file.auditLog.map((entry, index) => (
        <div key={`${entry.ts}-${index}`} className="grid gap-2 rounded-lg border border-line bg-white p-4 md:grid-cols-[160px_80px_1fr]">
          <div className="text-xs text-muted">{formatDate(entry.ts)}</div>
          <div className="text-xs font-bold uppercase text-brand">{entry.actor}</div>
          <div className="text-sm">{entry.action}</div>
        </div>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
