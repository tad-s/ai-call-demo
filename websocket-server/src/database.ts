import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    pool.on("error", (err) => {
      console.error("[DB] Unexpected pool error:", err.message);
    });
  }
  return pool;
}

export function isDbAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  if (!p) {
    console.log("[DB] DATABASE_URL not set, skipping DB init (using file storage)");
    return;
  }
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS call_transcripts (
        id          VARCHAR(50)   PRIMARY KEY,
        start_time  TIMESTAMPTZ   NOT NULL,
        end_time    TIMESTAMPTZ   NOT NULL,
        entries     JSONB         NOT NULL DEFAULT '[]',
        created_at  TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    console.log("[DB] Table ready: call_transcripts");
  } catch (e: any) {
    console.error("[DB] Init failed:", e.message);
  }
}

export async function saveTranscriptToDb(record: {
  id: string;
  startTime: string;
  endTime: string;
  entries: { role: string; text: string; timestamp: string }[];
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO call_transcripts (id, start_time, end_time, entries)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [record.id, record.startTime, record.endTime, JSON.stringify(record.entries)]
  );
  console.log(`[DB] Saved transcript: ${record.id}`);
}

export async function listTranscriptsFromDb(): Promise<{
  id: string;
  startTime: string;
  endTime: string;
  entryCount: number;
}[]> {
  const p = getPool();
  if (!p) return [];
  const result = await p.query(
    `SELECT
       id,
       start_time  AS "startTime",
       end_time    AS "endTime",
       jsonb_array_length(entries) AS "entryCount"
     FROM call_transcripts
     ORDER BY start_time DESC
     LIMIT 100`
  );
  return result.rows;
}

export async function getTranscriptFromDb(id: string): Promise<{
  id: string;
  startTime: string;
  endTime: string;
  entries: { role: string; text: string; timestamp: string }[];
} | null> {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `SELECT
       id,
       start_time AS "startTime",
       end_time   AS "endTime",
       entries
     FROM call_transcripts
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}
