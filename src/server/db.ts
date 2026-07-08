import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { CustomsFile, DashboardStats } from "../shared/types";
import { seedFile } from "./seed";

const dataDir = path.resolve(process.cwd(), "data");
const dbPath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(dataDir, "otoflow.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS customs_files (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    product TEXT NOT NULL,
    status TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const count = db.prepare("SELECT COUNT(*) AS total FROM customs_files").get() as { total: number };
if (count.total === 0) {
  saveFile(seedFile);
}

export function listFiles(): CustomsFile[] {
  const rows = db
    .prepare("SELECT payload FROM customs_files ORDER BY created_at DESC")
    .all() as { payload: string }[];
  return rows.map((row) => JSON.parse(row.payload) as CustomsFile);
}

export function getFile(id: string): CustomsFile | undefined {
  const row = db.prepare("SELECT payload FROM customs_files WHERE id = ?").get(id) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as CustomsFile) : undefined;
}

export function saveFile(file: CustomsFile): CustomsFile {
  db.prepare(
    `INSERT INTO customs_files (id, customer, product, status, payload, created_at, updated_at)
     VALUES (@id, @customer, @product, @status, @payload, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       customer = excluded.customer,
       product = excluded.product,
       status = excluded.status,
       payload = excluded.payload,
       updated_at = excluded.updated_at`
  ).run({
    id: file.id,
    customer: file.customer,
    product: file.product,
    status: file.status,
    payload: JSON.stringify(file),
    createdAt: file.createdAt,
    updatedAt: new Date().toISOString()
  });
  return file;
}

export function nextFileNumber(): number {
  const files = listFiles();
  const max = files.reduce((highest, file) => {
    const numeric = Number(file.id.split("-").at(-1));
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, 417);
  return max + 1;
}

export function dashboardStats(files: CustomsFile[]): DashboardStats {
  const completed = files.filter((file) => file.status === "tamamlandi").length;
  const pending = files.filter((file) => file.status === "onay_bekliyor").length;
  const taxSavings = files.reduce((sum, file) => sum + (file.taxResult?.totalTRY ?? 0), 0);

  return {
    savedHours: 18 + completed * 3 + pending * 1.5,
    errorRate: files.length ? Math.max(0.8, 4.2 - completed * 0.7) : 0,
    fileVolume: files.length,
    savingsTRY: Math.round(124000 + taxSavings * 0.08),
    trend: [
      { day: "Pzt", files: 7, automated: 4 },
      { day: "Sal", files: 9, automated: 7 },
      { day: "Çar", files: 6, automated: 5 },
      { day: "Per", files: 12, automated: 9 },
      { day: "Cum", files: Math.max(8, files.length + 5), automated: Math.max(6, completed + 5) }
    ]
  };
}
