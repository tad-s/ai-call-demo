import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import dotenv from "dotenv";
import http from "http";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import cors from "cors";
import {
  handleCallConnection,
  handleFrontendConnection,
  loadDefaultConfig,
  getDefaultConfig,
  setDefaultConfig,
} from "./sessionManager";
import functions from "./functionHandlers";
import {
  initDb,
  isDbAvailable,
  listTranscriptsFromDb,
  getTranscriptFromDb,
  initPresetsTable,
  initUsersTable,
} from "./database";
import { listPresets, getPreset, savePreset, deletePreset } from "./presets";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  verifyPassword,
  ensureInitialAdmin,
  ROLES,
} from "./users";

dotenv.config();

const PORT = parseInt(process.env.PORT || "8081", 10);
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || "./transcripts";

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

loadDefaultConfig();
initDb().catch((e) => console.error("[DB] Init error:", e.message));
initPresetsTable().catch((e) => console.error("[DB] Init error:", e.message));
initUsersTable()
  .then(() => ensureInitialAdmin())
  .catch((e) => console.error("[Auth] Init error:", e.message));

const twimlPath = join(__dirname, "twiml.xml");
const twimlTemplate = readFileSync(twimlPath, "utf-8");

app.get("/public-url", (req, res) => {
  res.json({ publicUrl: PUBLIC_URL });
});

app.all("/twiml", (req, res) => {
  const wsUrl = new URL(PUBLIC_URL);
  wsUrl.protocol = "wss:";
  wsUrl.pathname = `/call`;

  const twimlContent = twimlTemplate.replace("{{WS_URL}}", wsUrl.toString());
  res.type("text/xml").send(twimlContent);
});

app.post("/end-call", (req, res) => {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  res.json({ ok: true });
});

app.get("/config", (req, res) => {
  res.json(getDefaultConfig() || {});
});

app.post("/config", (req, res) => {
  const config = req.body;
  setDefaultConfig(config);
  res.json({ ok: true });
});

app.get("/tools", (req, res) => {
  res.json(functions.map((f) => f.schema));
});

// プロンプトプリセット（複数登録・切り替え用）
app.get("/presets", async (req, res) => {
  try {
    res.json(await listPresets());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/presets/:id", async (req, res) => {
  try {
    const preset = await getPreset(req.params.id);
    if (!preset) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(preset);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/presets", async (req, res) => {
  const { name, config, assignedUserIds } = req.body;
  if (!name || !config) {
    res.status(400).json({ error: "name and config are required" });
    return;
  }
  try {
    res.json(await savePreset({ name, config, assignedUserIds }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/presets/:id", async (req, res) => {
  const { name, config, assignedUserIds } = req.body;
  if (!name || !config) {
    res.status(400).json({ error: "name and config are required" });
    return;
  }
  try {
    res.json(
      await savePreset({ id: req.params.id, name, config, assignedUserIds })
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/presets/:id", async (req, res) => {
  try {
    await deletePreset(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 認証・ユーザー管理
// このサーバー自体はセッション/権限の検証を行わない（webapp側のAPIルートが
// ログイン状態とロールを確認した上でここを呼び出す、閉域内の内部APIという想定）
app.post("/auth/verify", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  try {
    const user = await verifyPassword(username, password);
    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
    res.json({ user });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/users", async (req, res) => {
  try {
    res.json(await listUsers());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/users", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !ROLES.includes(role)) {
    res.status(400).json({ error: "username, password and a valid role are required" });
    return;
  }
  try {
    res.json(await createUser({ username, password, role }));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/users/:id", async (req, res) => {
  const { role, password } = req.body;
  if (role !== undefined && !ROLES.includes(role)) {
    res.status(400).json({ error: "invalid role" });
    return;
  }
  try {
    await updateUser(req.params.id, { role, password });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/users/:id", async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ストレージ種別を返す
app.get("/transcripts/source", (req, res) => {
  res.json({ storageType: isDbAvailable() ? "db" : "file" });
});

// 通話履歴一覧を返す（DB優先、未設定時はファイル）
app.get("/transcripts", async (req, res) => {
  if (isDbAvailable()) {
    try {
      res.json(await listTranscriptsFromDb());
      return;
    } catch (e: any) {
      console.error("[DB] listTranscripts failed:", e.message);
    }
  }
  // ファイルフォールバック
  if (!existsSync(TRANSCRIPTS_DIR)) {
    res.json([]);
    return;
  }
  try {
    const files = readdirSync(TRANSCRIPTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    const list = files
      .map((f) => {
        try {
          const data = JSON.parse(readFileSync(join(TRANSCRIPTS_DIR, f), "utf-8"));
          return {
            id: data.id,
            startTime: data.startTime,
            endTime: data.endTime,
            entryCount: (data.entries || []).length,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    res.json(list);
  } catch {
    res.status(500).json({ error: "Failed to list transcripts" });
  }
});

// 特定通話の詳細を返す（DB優先、未設定時はファイル）
app.get("/transcripts/:id", async (req, res) => {
  if (isDbAvailable()) {
    try {
      const data = await getTranscriptFromDb(req.params.id);
      if (data) {
        res.json(data);
        return;
      }
    } catch (e: any) {
      console.error("[DB] getTranscript failed:", e.message);
    }
  }
  // ファイルフォールバック
  const filepath = join(TRANSCRIPTS_DIR, `${req.params.id}.json`);
  if (!existsSync(filepath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    res.json(JSON.parse(readFileSync(filepath, "utf-8")));
  } catch {
    res.status(500).json({ error: "Failed to read transcript" });
  }
});

let currentCall: WebSocket | null = null;
let currentLogs: WebSocket | null = null;

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 1) {
    ws.close();
    return;
  }

  const type = parts[0];

  if (type === "call") {
    if (currentCall) currentCall.close();
    currentCall = ws;
    handleCallConnection(currentCall, OPENAI_API_KEY);
  } else if (type === "logs") {
    if (currentLogs) currentLogs.close();
    currentLogs = ws;
    handleFrontendConnection(currentLogs);
  } else {
    ws.close();
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
