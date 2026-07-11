import { RawData, WebSocket } from "ws";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import functions from "./functionHandlers";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config.json";
const TRANSCRIPTS_DIR = process.env.TRANSCRIPTS_DIR || "./transcripts";

export function loadDefaultConfig(): void {
  try {
    if (existsSync(CONFIG_PATH)) {
      session.saved_config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      console.log("Loaded saved config from", CONFIG_PATH);
    }
  } catch (e) {
    console.error("Failed to load config:", e);
  }
}

export function getDefaultConfig(): any {
  if (session.saved_config) return session.saved_config;
  try {
    if (existsSync(CONFIG_PATH)) {
      session.saved_config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      return session.saved_config;
    }
  } catch (e) {
    console.error("Failed to read config:", e);
  }
  return null;
}

export function setDefaultConfig(config: any): void {
  session.saved_config = config;
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save config:", e);
  }
}

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

interface Session {
  twilioConn?: WebSocket;
  frontendConn?: WebSocket;
  modelConn?: WebSocket;
  streamSid?: string;
  saved_config?: any;
  lastAssistantItem?: string;
  responseStartTimestamp?: number;
  latestMediaTimestamp?: number;
  openAIApiKey?: string;
  pendingDisconnect?: boolean;
  transcriptEntries?: TranscriptEntry[];
  callStartTime?: string;
  callSaved?: boolean;
}

let session: Session = {};

function saveTranscriptAndNotify() {
  if (session.callSaved) return;
  session.callSaved = true;

  const entries = session.transcriptEntries || [];
  if (entries.length > 0) {
    try {
      if (!existsSync(TRANSCRIPTS_DIR)) mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
      const now = new Date();
      const id = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const record = {
        id,
        startTime: session.callStartTime || now.toISOString(),
        endTime: now.toISOString(),
        entries,
      };
      writeFileSync(join(TRANSCRIPTS_DIR, `${id}.json`), JSON.stringify(record, null, 2));
      console.log(`[Transcript] Saved: ${id}.json (${entries.length} entries)`);
    } catch (e) {
      console.error("[Transcript] Failed to save:", e);
    }
  }

  if (isOpen(session.frontendConn)) {
    jsonSend(session.frontendConn, {
      type: "call.ended",
      timestamp: new Date().toISOString(),
    });
  }
}

export function handleCallConnection(ws: WebSocket, openAIApiKey: string) {
  cleanupConnection(session.twilioConn);
  session.twilioConn = ws;
  session.openAIApiKey = openAIApiKey;

  ws.on("message", handleTwilioMessage);
  ws.on("error", ws.close);
  ws.on("close", () => {
    saveTranscriptAndNotify();
    cleanupConnection(session.modelConn);
    cleanupConnection(session.twilioConn);
    session.twilioConn = undefined;
    session.modelConn = undefined;
    session.streamSid = undefined;
    session.lastAssistantItem = undefined;
    session.responseStartTimestamp = undefined;
    session.latestMediaTimestamp = undefined;
    if (!session.frontendConn) {
      const saved = session.saved_config;
      session = { saved_config: saved };
    }
  });
}

export function handleFrontendConnection(ws: WebSocket) {
  cleanupConnection(session.frontendConn);
  session.frontendConn = ws;

  ws.on("message", handleFrontendMessage);
  ws.on("close", () => {
    cleanupConnection(session.frontendConn);
    session.frontendConn = undefined;
    if (!session.twilioConn && !session.modelConn) {
      const saved = session.saved_config;
      session = { saved_config: saved };
    }
  });
}

async function handleFunctionCall(item: { name: string; arguments: string }) {
  console.log("Handling function call:", item);
  const fnDef = functions.find((f) => f.schema.name === item.name);
  if (!fnDef) {
    throw new Error(`No handler found for function: ${item.name}`);
  }

  let args: unknown;
  try {
    args = JSON.parse(item.arguments);
  } catch {
    return JSON.stringify({
      error: "Invalid JSON arguments for function call.",
    });
  }

  try {
    console.log("Calling function:", fnDef.schema.name, args);
    const result = await fnDef.handler(args as any);
    return result;
  } catch (err: any) {
    console.error("Error running function:", err);
    return JSON.stringify({
      error: `Error running function ${item.name}: ${err.message}`,
    });
  }
}

function handleTwilioMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  switch (msg.event) {
    case "start":
      session.streamSid = msg.start.streamSid;
      session.latestMediaTimestamp = 0;
      session.lastAssistantItem = undefined;
      session.responseStartTimestamp = undefined;
      session.transcriptEntries = [];
      session.callStartTime = new Date().toISOString();
      session.callSaved = false;
      tryConnectModel();
      break;
    case "media":
      session.latestMediaTimestamp = msg.media.timestamp;
      if (isOpen(session.modelConn)) {
        jsonSend(session.modelConn, {
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        });
      }
      break;
    case "close":
      closeAllConnections();
      break;
  }
}

function handleFrontendMessage(data: RawData) {
  const msg = parseMessage(data);
  if (!msg) return;

  if (isOpen(session.modelConn)) {
    if (msg.type === "session.update") {
      const { model: _m, disconnect_phrases: _dp, voice, instructions, tools, silence_duration_ms } = msg.session || {};
      jsonSend(session.modelConn, {
        ...msg,
        session: {
          type: "realtime",
          output_modalities: ["audio"],
          instructions,
          tools: tools || [],
          audio: {
            input: {
              format: { type: "audio/pcmu" },
              turn_detection: {
                type: "server_vad",
                ...(silence_duration_ms !== undefined ? { silence_duration_ms } : {}),
              },
              transcription: { model: "whisper-1" },
            },
            output: {
              format: { type: "audio/pcmu" },
              voice: voice || "ash",
            },
          },
        },
      });
    } else {
      jsonSend(session.modelConn, msg);
    }
  }

  if (msg.type === "session.update") {
    session.saved_config = msg.session;
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(msg.session));
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  }
}

function tryConnectModel() {
  if (!session.twilioConn || !session.streamSid || !session.openAIApiKey)
    return;
  if (isOpen(session.modelConn)) return;

  const model = session.saved_config?.model || "gpt-realtime-2";
  session.modelConn = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
    {
      headers: {
        Authorization: `Bearer ${session.openAIApiKey}`,
      },
    }
  );

  session.modelConn.on("open", () => {
    const defaultInstructions = `あなたは丁寧な日本語で対応するヘルプデスクのAIオペレーターです。
お客様からのお問い合わせに対して、簡潔かつ丁寧に日本語で回答してください。
聞き取れなかった場合は「もう一度おっしゃっていただけますか？」と聞き返してください。
通話開始時は「お電話ありがとうございます。AIオペレーターです。ご用件をどうぞ。」と挨拶してください。`;
    const { model: _m, disconnect_phrases: _dp, voice, instructions, tools, silence_duration_ms } = session.saved_config || {};
    jsonSend(session.modelConn, {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        instructions: instructions || defaultInstructions,
        tools: tools || [],
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: {
              type: "server_vad",
              ...(silence_duration_ms !== undefined ? { silence_duration_ms } : { silence_duration_ms: 800 }),
            },
            transcription: { model: "whisper-1" },
          },
          output: {
            format: { type: "audio/pcmu" },
            voice: voice || "ash",
          },
        },
      },
    });
    jsonSend(session.modelConn, { type: "response.create" });
    console.log("[OpenAI] WebSocket connected, model:", model);
  });

  session.modelConn.on("message", handleModelMessage);
  session.modelConn.on("error", (err) => {
    console.error("[OpenAI] WebSocket error:", err.message);
    closeModel();
  });
  session.modelConn.on("close", (code, reason) => {
    console.warn("[OpenAI] WebSocket closed. code:", code, "reason:", reason?.toString());
    closeModel();
  });
}

function handleModelMessage(data: RawData) {
  const event = parseMessage(data);
  if (!event) return;

  if (event.type === "error") {
    console.error("[OpenAI] error event:", JSON.stringify(event));
  } else {
    console.log("[OpenAI] event:", event.type);
  }
  jsonSend(session.frontendConn, event);

  switch (event.type) {
    case "input_audio_buffer.speech_started":
      handleTruncation();
      break;

    case "conversation.item.input_audio_transcription.completed": {
      const transcript: string = event.transcript || "";
      if (transcript && session.transcriptEntries) {
        session.transcriptEntries.push({
          role: "user",
          text: transcript,
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done": {
      const transcript: string = event.transcript || "";
      if (transcript && session.transcriptEntries) {
        session.transcriptEntries.push({
          role: "assistant",
          text: transcript,
          timestamp: new Date().toISOString(),
        });
      }
      const disconnectPhrases: string[] =
        session.saved_config?.disconnect_phrases || ["お電話ありがとうございました"];
      const shouldDisconnect = disconnectPhrases.some((phrase: string) =>
        transcript.includes(phrase)
      );
      if (shouldDisconnect) {
        console.log("Disconnect phrase detected in transcript, waiting for audio to finish:", transcript);
        session.pendingDisconnect = true;
      }
      break;
    }

    case "response.done": {
      if (session.pendingDisconnect) {
        session.pendingDisconnect = false;
        console.log("response.done received, disconnecting after audio playback delay...");
        setTimeout(() => closeAllConnections(), 3000);
      }
      break;
    }

    case "response.output_audio.delta":
    case "response.audio.delta":
      if (session.twilioConn && session.streamSid) {
        if (session.responseStartTimestamp === undefined) {
          session.responseStartTimestamp = session.latestMediaTimestamp || 0;
        }
        if (event.item_id) session.lastAssistantItem = event.item_id;

        jsonSend(session.twilioConn, {
          event: "media",
          streamSid: session.streamSid,
          media: { payload: event.delta },
        });

        jsonSend(session.twilioConn, {
          event: "mark",
          streamSid: session.streamSid,
        });
      }
      break;

    case "response.output_item.done": {
      const { item } = event;
      if (item.type === "function_call") {
        handleFunctionCall(item)
          .then((output) => {
            if (session.modelConn) {
              jsonSend(session.modelConn, {
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: item.call_id,
                  output: JSON.stringify(output),
                },
              });
              jsonSend(session.modelConn, { type: "response.create" });
            }
          })
          .catch((err) => {
            console.error("Error handling function call:", err);
          });
      }
      break;
    }
  }
}

function handleTruncation() {
  if (
    !session.lastAssistantItem ||
    session.responseStartTimestamp === undefined
  )
    return;

  const elapsedMs =
    (session.latestMediaTimestamp || 0) - (session.responseStartTimestamp || 0);
  const audio_end_ms = elapsedMs > 0 ? elapsedMs : 0;

  if (isOpen(session.modelConn)) {
    jsonSend(session.modelConn, {
      type: "conversation.item.truncate",
      item_id: session.lastAssistantItem,
      content_index: 0,
      audio_end_ms,
    });
  }

  if (session.twilioConn && session.streamSid) {
    jsonSend(session.twilioConn, {
      event: "clear",
      streamSid: session.streamSid,
    });
  }

  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
}

function closeModel() {
  cleanupConnection(session.modelConn);
  session.modelConn = undefined;
  if (!session.twilioConn && !session.frontendConn) {
    const saved = session.saved_config;
    session = { saved_config: saved };
  }
}

function closeAllConnections() {
  saveTranscriptAndNotify();
  if (session.twilioConn) {
    session.twilioConn.close();
    session.twilioConn = undefined;
  }
  if (session.modelConn) {
    session.modelConn.close();
    session.modelConn = undefined;
  }
  if (session.frontendConn) {
    session.frontendConn.close();
    session.frontendConn = undefined;
  }
  session.streamSid = undefined;
  session.lastAssistantItem = undefined;
  session.responseStartTimestamp = undefined;
  session.latestMediaTimestamp = undefined;
}

function cleanupConnection(ws?: WebSocket) {
  if (isOpen(ws)) ws.close();
}

function parseMessage(data: RawData): any {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

function jsonSend(ws: WebSocket | undefined, obj: unknown) {
  if (!isOpen(ws)) return;
  ws.send(JSON.stringify(obj));
}

function isOpen(ws?: WebSocket): ws is WebSocket {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
