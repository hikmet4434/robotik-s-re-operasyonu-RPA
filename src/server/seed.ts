import type { CustomsFile } from "../shared/types";
import { suggestGtip } from "./gtip";

const now = new Date().toISOString();

export const seedFile: CustomsFile = {
  id: "GM-2026-0417",
  customer: "ABC Dış Ticaret A.Ş.",
  product: "Mutfak robotu Model KR-500",
  status: "onay_bekliyor",
  documents: [
    {
      type: "fatura",
      name: "INV-88231 Ticari Fatura.pdf",
      fields: [
        {
          key: "invoice_no",
          label: "Fatura No",
          value: "INV-88231",
          confidence: 98,
          bbox: { page: 1, x: 17, y: 16, w: 26, h: 7 }
        },
        {
          key: "seller",
          label: "Satıcı",
          value: "Shenzhen KitchenTech Ltd.",
          confidence: 96,
          bbox: { page: 1, x: 15, y: 30, w: 42, h: 8 }
        },
        {
          key: "buyer",
          label: "Alıcı",
          value: "ABC Dış Ticaret A.Ş.",
          confidence: 97,
          bbox: { page: 1, x: 15, y: 41, w: 38, h: 8 }
        },
        {
          key: "invoice_total",
          label: "Fatura Tutarı",
          value: "37.000,00 USD",
          confidence: 83,
          bbox: { page: 1, x: 58, y: 70, w: 27, h: 8 }
        }
      ]
    },
    {
      type: "ceki_listesi",
      name: "PACK-KR500 Çeki Listesi.pdf",
      fields: [
        {
          key: "gross_weight",
          label: "Brüt Ağırlık",
          value: "4.860 KG",
          confidence: 91,
          bbox: { page: 1, x: 55, y: 45, w: 22, h: 7 }
        },
        {
          key: "packages",
          label: "Kap Sayısı",
          value: "400 Karton",
          confidence: 94,
          bbox: { page: 1, x: 55, y: 55, w: 24, h: 7 }
        }
      ]
    },
    {
      type: "konsimento",
      name: "BL-TRM-2026-221 Konşimento.pdf",
      fields: [
        {
          key: "vessel",
          label: "Gemi",
          value: "M/V Anatolia Star",
          confidence: 95,
          bbox: { page: 1, x: 12, y: 25, w: 36, h: 7 }
        },
        {
          key: "eta",
          label: "Tahmini Varış",
          value: "2026-07-18",
          confidence: 90,
          bbox: { page: 1, x: 58, y: 33, w: 24, h: 7 }
        }
      ]
    }
  ],
  lineItems: [
    {
      id: "LI-1",
      description: "Mutfak robotu Model KR-500, 2.000 adet",
      quantity: 2000,
      unitPriceUSD: 18.5,
      gtipSuggestions: suggestGtip("Mutfak robotu Model KR-500")
    }
  ],
  freightUSD: 1200,
  insuranceUSD: 150,
  fxRate: 33,
  auditLog: [
    { ts: now, actor: "ai", action: "Belgeler mock OCR ile işlendi ve güven skorları üretildi." },
    { ts: now, actor: "ai", action: "Mutfak robotu için Top-3 GTİP önerisi oluşturuldu." }
  ],
  communicationHistory: [],
  createdAt: now
};

export function createUploadedFile(nextNumber: number): CustomsFile {
  const id = `GM-2026-${String(nextNumber).padStart(4, "0")}`;
  const createdAt = new Date().toISOString();
  return {
    ...structuredClone(seedFile),
    id,
    customer: "Yeni Demo Müşteri Ltd.",
    product: "Mutfak robotu ithalat dosyası",
    status: "onay_bekliyor",
    taxResult: undefined,
    createdAt,
    auditLog: [
      { ts: createdAt, actor: "user", action: "Belgeler yükleme ekranından alındı." },
      { ts: createdAt, actor: "ai", action: "Alan çıkarımı, GTİP önerileri ve belge eşleştirme tamamlandı." }
    ],
    communicationHistory: []
  };
}
