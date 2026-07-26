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

export async function initPresetsTable(): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS prompt_presets (
        id          VARCHAR(50)   PRIMARY KEY,
        name        VARCHAR(200)  NOT NULL,
        config      JSONB         NOT NULL,
        updated_at  TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    console.log("[DB] Table ready: prompt_presets");
  } catch (e: any) {
    console.error("[DB] Init failed (prompt_presets):", e.message);
  }
}

export async function listPresetsFromDb(): Promise<
  { id: string; name: string; updatedAt: string }[]
> {
  const p = getPool();
  if (!p) return [];
  const result = await p.query(
    `SELECT id, name, updated_at AS "updatedAt" FROM prompt_presets ORDER BY updated_at DESC`
  );
  return result.rows;
}

export async function getPresetFromDb(
  id: string
): Promise<{ id: string; name: string; config: any; updatedAt: string } | null> {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `SELECT id, name, config, updated_at AS "updatedAt" FROM prompt_presets WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function savePresetToDb(preset: {
  id: string;
  name: string;
  config: any;
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO prompt_presets (id, name, config, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET name = $2, config = $3, updated_at = NOW()`,
    [preset.id, preset.name, JSON.stringify(preset.config)]
  );
}

export async function deletePresetFromDb(id: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`DELETE FROM prompt_presets WHERE id = $1`, [id]);
}
