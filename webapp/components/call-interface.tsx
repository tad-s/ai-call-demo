"use client";

import React, { useState, useEffect, useRef } from "react";
import TopBar from "@/components/top-bar";
import ChecklistAndConfig from "@/components/checklist-and-config";
import SessionConfigurationPanel from "@/components/session-configuration-panel";
import Transcript from "@/components/transcript";
import FunctionCallsPanel from "@/components/function-calls-panel";
import CallHistoryPanel from "@/components/call-history-panel";
import { Item } from "@/components/types";
import handleRealtimeEvent from "@/lib/handle-realtime-event";
import PhoneNumberChecklist from "@/components/phone-number-checklist";

const HISTORY_KEY = "call_history";
const MAX_HISTORY = 50;

const CallInterface = () => {
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState("");
  const [allConfigsReady, setAllConfigsReady] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [callStatus, setCallStatus] = useState("disconnected");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [toNumber, setToNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [callMessage, setCallMessage] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const currentConfigRef = useRef<any>(null);
  const itemsRef = useRef<Item[]>([]);
  const callStartTimeRef = useRef<string>("");

  // itemsRef を items と同期
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (allConfigsReady && !ws) {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";
      const wsUrl = serverUrl.replace(/^https/, "wss").replace(/^http/, "ws") + "/logs";
      const newWs = new WebSocket(wsUrl);

      newWs.onopen = () => {
        console.log("Connected to logs websocket");
        setCallStatus("connected");
        if (currentConfigRef.current) {
          newWs.send(JSON.stringify({
            type: "session.update",
            session: currentConfigRef.current,
          }));
        }
      };

      newWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Received logs event:", data);

        // 通話開始: 開始時刻を記録
        if (data.type === "session.created") {
          callStartTimeRef.current = new Date().toISOString();
        }

        // 通話終了: localStorage に保存
        if (data.type === "call.ended") {
          const currentItems = itemsRef.current;
          const hasContent = currentItems.some(
            (it) => it.type === "message" && (it.role === "user" || it.role === "assistant")
          );
          if (hasContent) {
            const record = {
              id: `call_${Date.now()}`,
              startTime: callStartTimeRef.current || new Date().toISOString(),
              endTime: data.timestamp || new Date().toISOString(),
              items: currentItems,
            };
            try {
              const existing = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
              const updated = [record, ...existing].slice(0, MAX_HISTORY);
              localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
              console.log("[History] Saved to localStorage:", record.id);
            } catch (e) {
              console.error("[History] Failed to save:", e);
            }
          }
          return;
        }

        handleRealtimeEvent(data, setItems);
      };

      newWs.onclose = () => {
        console.log("Logs websocket disconnected");
        setWs(null);
        setCallStatus("disconnected");
      };

      setWs(newWs);
    }
  }, [allConfigsReady, ws]);

  const handleSave = async (config: any) => {
    currentConfigRef.current = config;
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";
    await fetch(`${serverUrl}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).catch(() => {});
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "session.update", session: config }));
    }
  };

  const handleEndCall = async () => {
    setDisconnecting(true);
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";
      await fetch(`${serverUrl}/end-call`, { method: "POST" });
      setCallMessage("通話を切断しました");
    } catch {
      setCallMessage("切断に失敗しました");
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCall = async () => {
    if (!toNumber) {
      setCallMessage("電話番号を入力してください");
      return;
    }
    setCalling(true);
    setCallMessage("");
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toNumber }),
      });
      if (res.ok) {
        setCallMessage("発信しました！まもなく着信します");
      } else {
        const err = await res.json();
        setCallMessage(`エラー: ${err.message || "発信に失敗しました"}`);
      }
    } catch (e: any) {
      setCallMessage(`エラー: ${e.message}`);
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="h-screen bg-white flex flex-col">
      <ChecklistAndConfig
        ready={allConfigsReady}
        setReady={setAllConfigsReady}
        selectedPhoneNumber={selectedPhoneNumber}
        setSelectedPhoneNumber={setSelectedPhoneNumber}
      />
      <TopBar />
      <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
        {/* 発信パネル */}
        <div className="flex items-center gap-2 mb-3 p-3 border rounded-lg bg-gray-50">
          <span className="text-sm font-medium whitespace-nowrap">発信先:</span>
          <input
            type="tel"
            placeholder="+819054424303"
            value={toNumber}
            onChange={(e) => setToNumber(e.target.value)}
            className="border rounded px-3 py-1 text-sm flex-1 max-w-xs"
          />
          <button
            onClick={handleCall}
            disabled={calling}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded text-sm font-medium disabled:opacity-50"
          >
            {calling ? "発信中..." : "📞 発信"}
          </button>
          <button
            onClick={handleEndCall}
            disabled={disconnecting}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-1 rounded text-sm font-medium disabled:opacity-50"
          >
            {disconnecting ? "切断中..." : "📵 強制切断"}
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-1 rounded text-sm font-medium"
          >
            📋 通話履歴
          </button>
          {callMessage && (
            <span className="text-sm text-gray-600">{callMessage}</span>
          )}
        </div>

        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
          {/* Left Column */}
          <div className="col-span-3 flex flex-col h-full overflow-hidden min-h-0">
            <SessionConfigurationPanel
              callStatus={callStatus}
              onSave={handleSave}
              onConfigLoaded={(config) => { currentConfigRef.current = config; }}
            />
          </div>

          {/* Middle Column: Transcript */}
          <div className="col-span-6 flex flex-col gap-4 h-full overflow-hidden">
            <PhoneNumberChecklist
              selectedPhoneNumber={selectedPhoneNumber}
              allConfigsReady={allConfigsReady}
              setAllConfigsReady={setAllConfigsReady}
            />
            <Transcript items={items} />
          </div>

          {/* Right Column: Function Calls */}
          <div className="col-span-3 flex flex-col h-full overflow-hidden min-h-0">
            <FunctionCallsPanel items={items} ws={ws} />
          </div>
        </div>
      </div>

      {showHistory && (
        <CallHistoryPanel onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
};

export default CallInterface;
