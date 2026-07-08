import { ArrowRight, CheckCircle2, FileText, Info, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CustomsFile, ExtractedField } from "../../shared/types";
import { api } from "../api";
import { ConfidenceBadge } from "../ui/badges";
import { confidenceTone, formatCurrency } from "../utils";

export function ValidatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState<CustomsFile | null>(null);
  const [selectedField, setSelectedField] = useState<ExtractedField | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.file(id).then((loaded) => {
      setFile(loaded);
      setSelectedField(loaded.documents[0]?.fields[0] ?? null);
    });
  }, [id]);

  const lowConfidenceCount = useMemo(
    () => file?.documents.flatMap((doc) => doc.fields).filter((field) => field.confidence < 80).length ?? 0,
    [file]
  );
  const hasAllGtip = file?.lineItems.every((item) => item.selectedGtip) ?? false;
  const canApprove = lowConfidenceCount === 0 && hasAllGtip;

  async function updateField(documentType: string, field: ExtractedField, value: string) {
    if (!file) return;
    setSavingKey(field.key);
    const updated = await api.updateField(file.id, { documentType, key: field.key, value });
    setFile(updated);
    setSelectedField(updated.documents.flatMap((doc) => doc.fields).find((item) => item.key === field.key) ?? field);
    setSavingKey(null);
  }

  async function selectGtip(lineItemId: string, code: string) {
    if (!file) return;
    const updated = await api.selectGtip(file.id, { lineItemId, code });
    setFile(updated);
  }

  async function approve() {
    if (!file || !canApprove) return;
    await api.approveValidation(file.id);
    navigate(`/file/${file.id}/tax`);
  }

  if (!file) return <div className="panel p-6 muted">Doğrulama ekranı yükleniyor...</div>;

  const selectedDocType = file.documents.find((doc) => doc.fields.some((field) => field.key === selectedField?.key))?.type ?? "fatura";
  const highlight = selectedField?.bbox ?? { x: 58, y: 70, w: 27, h: 8 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal">Belge Doğrulama</h1>
          <p className="mt-1 muted">
            {file.id} · {file.customer} · {file.product}
          </p>
        </div>
        <button className="button-primary" disabled={!canApprove} onClick={approve}>
          Tümünü Onayla ve İlerle
          <ArrowRight size={17} />
        </button>
      </div>

      {!hasAllGtip ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          GTİP seçimi yapılmadan vergi hesabına geçilemez.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="section-title">Belge Önizleme</h2>
              <p className="muted">Seçili alan: {selectedField?.label ?? "Yok"}</p>
            </div>
            <FileText className="text-brand" size={22} />
          </div>
          <div className="relative mx-auto aspect-[0.72] max-h-[680px] rounded-lg border border-line bg-white p-6 shadow-inner">
            <div className="mb-7 flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-semibold uppercase text-muted">Commercial Invoice</div>
                <div className="mt-1 text-lg font-bold">INV-88231</div>
              </div>
              <div className="text-right text-xs text-muted">Sayfa 1</div>
            </div>
            <DocLine label="Satıcı" value="Shenzhen KitchenTech Ltd." />
            <DocLine label="Alıcı" value={file.customer} />
            <DocLine label="Ürün" value={file.product} />
            <div className="mt-8 grid grid-cols-3 gap-2 border-y border-slate-200 py-4 text-sm">
              <div className="font-semibold">Açıklama</div>
              <div className="font-semibold">Adet</div>
              <div className="font-semibold">Tutar</div>
              <div>Mutfak robotu KR-500</div>
              <div>2.000</div>
              <div>37.000,00 USD</div>
            </div>
            <div className="mt-10 text-right">
              <div className="text-xs uppercase text-muted">Fatura Tutarı</div>
              <div className="text-xl font-bold">{formatCurrency(37000)}</div>
            </div>
            <div
              className="absolute rounded-md border-2 border-amber-500 bg-amber-200/30 shadow-[0_0_0_9999px_rgba(15,23,42,0.02)]"
              style={{
                left: `${highlight.x}%`,
                top: `${highlight.y}%`,
                width: `${highlight.w}%`,
                height: `${highlight.h}%`
              }}
            />
            <div className="absolute bottom-5 left-5 rounded-md bg-slate-900 px-3 py-2 text-xs text-white">
              {selectedDocType} · koordinat simülasyonu
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="panel p-5">
            <h2 className="section-title">Güven Skorlu Alanlar</h2>
            <p className="muted">Düşük güvenli alanlar düzeltildiğinde skor yeşile yükselir.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {file.documents.map((doc) =>
                doc.fields.map((field) => (
                  <button
                    key={`${doc.type}-${field.key}`}
                    onClick={() => setSelectedField(field)}
                    className={`rounded-lg border p-4 text-left transition hover:border-brand ${
                      selectedField?.key === field.key ? "border-brand bg-teal-50" : "border-line bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{field.label}</div>
                      <ConfidenceBadge value={field.confidence} />
                    </div>
                    <input
                      className="input mt-3"
                      value={field.value}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFile({
                          ...file,
                          documents: file.documents.map((item) =>
                            item.type === doc.type
                              ? {
                                  ...item,
                                  fields: item.fields.map((candidate) =>
                                    candidate.key === field.key ? { ...candidate, value } : candidate
                                  )
                                }
                              : item
                          )
                        });
                      }}
                    />
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-xs font-medium ${confidenceTone(field.confidence) === "red" ? "text-red-700" : "text-muted"}`}>
                        {doc.name}
                      </span>
                      <button
                        className="button-secondary min-h-8 px-3 py-1 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void updateField(doc.type, field, field.value);
                        }}
                      >
                        <Save size={14} />
                        {savingKey === field.key ? "Kaydediliyor" : "Kaydet"}
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="section-title">Kalemler ve GTİP Top-3</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Açıklama</th>
                    <th className="px-4 py-3">Adet</th>
                    <th className="px-4 py-3">Birim</th>
                    <th className="px-4 py-3">GTİP</th>
                  </tr>
                </thead>
                <tbody>
                  {file.lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="table-cell">{item.description}</td>
                      <td className="table-cell">{item.quantity.toLocaleString("tr-TR")}</td>
                      <td className="table-cell">{formatCurrency(item.unitPriceUSD)}</td>
                      <td className="table-cell">
                        <select
                          className="input min-w-56"
                          value={item.selectedGtip ?? ""}
                          onChange={(event) => void selectGtip(item.id, event.target.value)}
                        >
                          <option value="">Top-3 gör ve seç</option>
                          {item.gtipSuggestions.map((suggestion) => (
                            <option key={suggestion.code} value={suggestion.code}>
                              {suggestion.code} · %{suggestion.confidence} · {suggestion.reason}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-100">
              <Info className="mt-0.5 shrink-0" size={16} />
              GTİP önerileri temsilidir; nihai seçim müşavir kontrolüyle yapılır ve audit log'a kaydedilir.
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button className="button-primary" disabled={!canApprove} onClick={approve}>
              <CheckCircle2 size={17} />
              Tümünü Onayla ve İlerle
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function DocLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4 grid grid-cols-[120px_1fr] gap-4 text-sm">
      <div className="font-semibold text-muted">{label}</div>
      <div>{value}</div>
    </div>
  );
}
