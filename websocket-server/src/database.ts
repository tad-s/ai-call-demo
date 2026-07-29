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
    // 既存のprompt_presetsテーブルにも安全に追加できるよう分離
    await p.query(`
      ALTER TABLE prompt_presets
      ADD COLUMN IF NOT EXISTS assigned_user_ids JSONB NOT NULL DEFAULT '[]'
    `);
    console.log("[DB] Table ready: prompt_presets");
  } catch (e: any) {
    console.error("[DB] Init failed (prompt_presets):", e.message);
  }
}

export async function listPresetsFromDb(): Promise<
  { id: string; name: string; updatedAt: string; assignedUserIds: string[] }[]
> {
  const p = getPool();
  if (!p) return [];
  const result = await p.query(
    `SELECT id, name, updated_at AS "updatedAt", assigned_user_ids AS "assignedUserIds" FROM prompt_presets ORDER BY updated_at DESC`
  );
  return result.rows;
}

export async function getPresetFromDb(id: string): Promise<{
  id: string;
  name: string;
  config: any;
  updatedAt: string;
  assignedUserIds: string[];
} | null> {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `SELECT id, name, config, updated_at AS "updatedAt", assigned_user_ids AS "assignedUserIds" FROM prompt_presets WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function savePresetToDb(preset: {
  id: string;
  name: string;
  config: any;
  assignedUserIds: string[];
}): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO prompt_presets (id, name, config, assigned_user_ids, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET name = $2, config = $3, assigned_user_ids = $4, updated_at = NOW()`,
    [preset.id, preset.name, JSON.stringify(preset.config), JSON.stringify(preset.assignedUserIds)]
  );
}

export async function deletePresetFromDb(id: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`DELETE FROM prompt_presets WHERE id = $1`, [id]);
}

export async function initUsersTable(): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id            VARCHAR(50)   PRIMARY KEY,
        username      VARCHAR(100)  UNIQUE NOT NULL,
        password_hash VARCHAR(200)  NOT NULL,
        role          VARCHAR(20)   NOT NULL,
        created_at    TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    console.log("[DB] Table ready: app_users");
  } catch (e: any) {
    console.error("[DB] Init failed (app_users):", e.message);
  }
}

export interface DbUser {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  createdAt: string;
}

export async function listUsersFromDb(): Promise<
  { id: string; username: string; role: string; createdAt: string }[]
> {
  const p = getPool();
  if (!p) return [];
  const result = await p.query(
    `SELECT id, username, role, created_at AS "createdAt" FROM app_users ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function getUserByUsernameFromDb(username: string): Promise<DbUser | null> {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `SELECT id, username, password_hash AS "passwordHash", role, created_at AS "createdAt" FROM app_users WHERE username = $1`,
    [username]
  );
  return result.rows[0] || null;
}

export async function getUserByIdFromDb(id: string): Promise<DbUser | null> {
  const p = getPool();
  if (!p) return null;
  const result = await p.query(
    `SELECT id, username, password_hash AS "passwordHash", role, created_at AS "createdAt" FROM app_users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function countUsersFromDb(): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  const result = await p.query(`SELECT COUNT(*)::int AS count FROM app_users`);
  return result.rows[0]?.count || 0;
}

export async function createUserInDb(user: DbUser): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO app_users (id, username, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [user.id, user.username, user.passwordHash, user.role, user.createdAt]
  );
}

export async function updateUserInDb(
  id: string,
  fields: { role?: string; passwordHash?: string }
): Promise<void> {
  const p = getPool();
  if (!p) return;
  if (fields.role !== undefined) {
    await p.query(`UPDATE app_users SET role = $2 WHERE id = $1`, [id, fields.role]);
  }
  if (fields.passwordHash !== undefined) {
    await p.query(`UPDATE app_users SET password_hash = $2 WHERE id = $1`, [
      id,
      fields.passwordHash,
    ]);
  }
}

export async function deleteUserFromDb(id: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`DELETE FROM app_users WHERE id = $1`, [id]);
}
