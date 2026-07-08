import { ArrowRight, Calculator, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CustomsFile } from "../../shared/types";
import { api } from "../api";
import { formatCurrency, formatNumber } from "../utils";

export function TaxPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState<CustomsFile | null>(null);

  useEffect(() => {
    if (!id) return;
    api.calculateTax(id).then(setFile);
  }, [id]);

  if (!file?.taxResult) return <div className="panel p-6 muted">Vergi hesabı hazırlanıyor...</div>;

  const tax = file.taxResult;
  const rows = [
    ["CIF", formatCurrency(tax.cifUSD)],
    [`Gümrük Vergisi (%${formatNumber(tax.customsDutyRate * 100)})`, formatCurrency(tax.customsDutyUSD)],
    ["KDV Matrahı", formatCurrency(tax.vatBaseUSD)],
    [`KDV (%${formatNumber(tax.vatRate * 100)})`, formatCurrency(tax.vatUSD)],
    ["Toplam USD", formatCurrency(tax.totalUSD)],
    ["Toplam TL", formatCurrency(tax.totalTRY, "TRY")]
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal">Vergi ve Harç Özeti</h1>
          <p className="mt-1 muted">
            {file.id} · seçili GTİP: {file.lineItems[0]?.selectedGtip ?? "Seçilmedi"}
          </p>
        </div>
        <button className="button-primary" onClick={() => navigate(`/file/${file.id}/submit`)}>
          Beyannameyi Hazırla
          <ArrowRight size={17} />
        </button>
      </div>

      <section className="panel p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-50 text-brand">
            <Calculator size={22} />
          </div>
          <div>
            <h2 className="section-title">Hesaplama Formülü</h2>
            <p className="muted">CIF + gümrük vergisi + KDV matrahı, kitapçıktaki mock oranlarla hesaplanır.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(([label, value], index) => (
            <div key={label} className={`rounded-lg border border-line p-4 ${index >= 4 ? "bg-teal-50" : "bg-white"}`}>
              <div className="text-sm text-muted">{label}</div>
              <div className="mt-2 text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-md bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-100">
          <Info className="mt-0.5 shrink-0" size={17} />
          Bu hesaplama demo amaçlıdır. Gerçek mevzuat, muafiyet, ilave gümrük vergisi ve GTİP kontrolleri canlı kaynaklarla doğrulanmalıdır.
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoBox label="Mal Bedeli" value={formatCurrency(37000)} />
        <InfoBox label="Navlun" value={formatCurrency(file.freightUSD)} />
        <InfoBox label="Sigorta" value={formatCurrency(file.insuranceUSD)} />
      </section>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
