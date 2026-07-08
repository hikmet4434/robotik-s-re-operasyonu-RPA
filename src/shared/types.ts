export type Confidence = number;
export type FileStatus = "onay_bekliyor" | "tamamlandi" | "hata" | "islemde";
export type DocumentType = "fatura" | "ceki_listesi" | "konsimento";
export type Actor = "bot" | "user" | "ai";

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence: Confidence;
  bbox?: { page: number; x: number; y: number; w: number; h: number };
}

export interface GtipSuggestion {
  code: string;
  confidence: Confidence;
  reason: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceUSD: number;
  gtipSuggestions: GtipSuggestion[];
  selectedGtip?: string;
}

export interface TaxResult {
  cifUSD: number;
  customsDutyRate: number;
  customsDutyUSD: number;
  vatBaseUSD: number;
  vatRate: number;
  vatUSD: number;
  totalUSD: number;
  totalTRY: number;
}

export interface AuditLogEntry {
  ts: string;
  actor: Actor;
  action: string;
}

export interface CommunicationEntry {
  ts: string;
  channel: "email" | "whatsapp" | "portal";
  message: string;
}

export interface CustomsDocument {
  type: DocumentType;
  name: string;
  fields: ExtractedField[];
}

export interface CustomsFile {
  id: string;
  customer: string;
  product: string;
  status: FileStatus;
  documents: CustomsDocument[];
  lineItems: LineItem[];
  freightUSD: number;
  insuranceUSD: number;
  fxRate: number;
  taxResult?: TaxResult;
  auditLog: AuditLogEntry[];
  communicationHistory: CommunicationEntry[];
  createdAt: string;
}

export interface DashboardStats {
  savedHours: number;
  errorRate: number;
  fileVolume: number;
  savingsTRY: number;
  trend: { day: string; files: number; automated: number }[];
}

export interface DashboardPayload {
  files: CustomsFile[];
  stats: DashboardStats;
}
