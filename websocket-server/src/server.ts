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
} from "./database";

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
