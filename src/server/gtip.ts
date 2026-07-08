import type { GtipSuggestion } from "../shared/types";

const rules: { keywords: string[]; suggestions: GtipSuggestion[] }[] = [
  {
    keywords: ["mutfak robotu", "robot", "mikser", "blender"],
    suggestions: [
      {
        code: "8509.40",
        confidence: 89,
        reason: "Mutfak robotu ve motorlu ev tipi cihaz açıklamasıyla en güçlü eşleşme."
      },
      {
        code: "8509.80",
        confidence: 7,
        reason: "Diğer elektromekanik ev aletleri sınıfına yakın alternatif."
      },
      {
        code: "8516.79",
        confidence: 4,
        reason: "Elektrikli ev cihazları ailesinde düşük olasılıklı yedek sınıf."
      }
    ]
  },
  {
    keywords: ["tekstil", "kumaş", "pamuk"],
    suggestions: [
      { code: "5208.52", confidence: 81, reason: "Pamuklu dokuma kumaş anahtar kelimeleriyle eşleşti." },
      { code: "5512.19", confidence: 13, reason: "Sentetik lifli kumaş alternatifi olabilir." },
      { code: "6006.22", confidence: 6, reason: "Örme kumaş ihtimali düşük güvenle tutuldu." }
    ]
  }
];

export function suggestGtip(description: string): GtipSuggestion[] {
  const normalized = description.toLocaleLowerCase("tr-TR");
  const match = rules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)));

  return (
    match?.suggestions ?? [
      { code: "8479.89", confidence: 62, reason: "Genel makine/cihaz açıklaması için manuel kontrol önerilir." },
      { code: "3926.90", confidence: 22, reason: "Plastik aksam ağırlıklı ürünler için düşük güvenli alternatif." },
      { code: "7326.90", confidence: 16, reason: "Metal aksam ağırlığı varsa incelenebilecek alternatif." }
    ]
  );
}
