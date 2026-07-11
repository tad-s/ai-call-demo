"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Item } from "@/components/types";

interface LocalCallRecord {
  id: string;
  startTime: string;
  endTime: string;
  items: Item[];
}

interface ServerCallSummary {
  id: string;
  startTime: string;
  endTime: string;
  entryCount: number;
}

interface ServerTranscriptEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

interface ServerCallRecord extends ServerCallSummary {
  entries: ServerTranscriptEntry[];
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function calcDuration(start: string, end: string): string {
  try {
    const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    if (sec < 60) return `${sec}秒`;
    return `${Math.floor(sec / 60)}分${sec % 60}秒`;
  } catch {
    return "-";
  }
}

type Tab = "local" | "server";

type CallHistoryPanelProps = {
  onClose: () => void;
};

const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>("local");
  const [localRecords, setLocalRecords] = useState<LocalCallRecord[]>([]);
  const [serverSummaries, setServerSummaries] = useState<ServerCallSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [serverDetail, setServerDetail] = useState<Record<string, ServerCallRecord>>({});
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [storageType, setStorageType] = useState<"db" | "file" | null>(null);

  const loadLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem("call_history");
      setLocalRecords(raw ? JSON.parse(raw) : []);
    } catch {
      setLocalRecords([]);
    }
  }, []);

  const loadServer = useCallback(async () => {
    setServerLoading(true);
    setServerError("");
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";
      const [sourceRes, listRes] = await Promise.all([
        fetch(`${serverUrl}/transcripts/source`),
        fetch(`${serverUrl}/transcripts`),
      ]);
      if (sourceRes.ok) {
        const src = await sourceRes.json();
        setStorageType(src.storageType);
      }
      if (!listRes.ok) throw new Error("取得失敗");
      setServerSummaries(await listRes.json());
    } catch {
      setServerError("サーバーから取得できませんでした");
    } finally {
      setServerLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    if (tab === "server") loadServer();
  }, [tab, loadServer]);

  const loadServerDetail = async (id: string) => {
    if (serverDetail[id]) return;
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";
      const res = await fetch(`${serverUrl}/transcripts/${id}`);
      if (!res.ok) return;
      const data: ServerCallRecord = await res.json();
      setServerDetail((prev) => ({ ...prev, [id]: data }));
    } catch {
      // silent
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (tab === "server") await loadServerDetail(id);
  };

  const clearLocal = () => {
    localStorage.removeItem("call_history");
    setLocalRecords([]);
    setExpandedId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-800">通話履歴</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b px-5">
          <button
            onClick={() => { setTab("local"); setExpandedId(null); }}
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === "local"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            ブラウザ保存
          </button>
          <button
            onClick={() => { setTab("server"); setExpandedId(null); }}
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === "server"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            サーバー保存
            {tab === "server" && storageType && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                storageType === "db"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-200 text-gray-600"
              }`}>
                {storageType === "db" ? "DB" : "FILE"}
              </span>
            )}
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {tab === "local" && (
            <>
              {localRecords.length === 0 ? (
                <p className="text-center text-sm text-gray-400 mt-10">
                  保存された通話履歴はありません
                </p>
              ) : (
                localRecords.map((rec) => (
                  <LocalRecordCard
                    key={rec.id}
                    record={rec}
                    expanded={expandedId === rec.id}
                    onToggle={() => toggleExpand(rec.id)}
                  />
                ))
              )}
              {localRecords.length > 0 && (
                <div className="pt-2 text-right">
                  <button
                    onClick={clearLocal}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    履歴をすべて削除
                  </button>
                </div>
              )}
            </>
          )}

          {tab === "server" && (
            <>
              {serverLoading && (
                <p className="text-center text-sm text-gray-400 mt-10">読み込み中...</p>
              )}
              {serverError && (
                <p className="text-center text-sm text-red-400 mt-10">{serverError}</p>
              )}
              {!serverLoading && !serverError && serverSummaries.length === 0 && (
                <p className="text-center text-sm text-gray-400 mt-10">
                  サーバーに保存された通話履歴はありません
                </p>
              )}
              {serverSummaries.map((sum) => (
                <ServerRecordCard
                  key={sum.id}
                  summary={sum}
                  detail={serverDetail[sum.id]}
                  expanded={expandedId === sum.id}
                  onToggle={() => toggleExpand(sum.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- ローカル履歴カード ----

const LocalRecordCard: React.FC<{
  record: LocalCallRecord;
  expanded: boolean;
  onToggle: () => void;
}> = ({ record, expanded, onToggle }) => {
  const transcriptItems = record.items.filter(
    (it) => it.type === "message" && (it.role === "user" || it.role === "assistant")
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            {formatDateTime(record.startTime)}
          </span>
          <span className="text-xs text-gray-400">
            {calcDuration(record.startTime, record.endTime)}
          </span>
          <span className="text-xs bg-blue-100 text-blue-600 rounded px-2 py-0.5">
            {transcriptItems.length} 発言
          </span>
        </div>
        <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3 border-t bg-white max-h-72 overflow-y-auto">
          {transcriptItems.length === 0 ? (
            <p className="text-xs text-gray-400">会話データなし</p>
          ) : (
            transcriptItems.map((msg, i) => {
              const isUser = msg.role === "user";
              const text = (msg.content || [])
                .map((c) => c.text ?? "")
                .join("");
              return (
                <div key={i} className="flex gap-2">
                  <span
                    className={`shrink-0 text-xs font-semibold w-16 pt-0.5 ${
                      isUser ? "text-gray-500" : "text-blue-600"
                    }`}
                  >
                    {isUser ? "発信者" : "AI"}
                  </span>
                  <p className="text-xs text-gray-700 leading-relaxed">{text}</p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// ---- サーバー履歴カード ----

const ServerRecordCard: React.FC<{
  summary: ServerCallSummary;
  detail?: ServerCallRecord;
  expanded: boolean;
  onToggle: () => void;
}> = ({ summary, detail, expanded, onToggle }) => {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            {formatDateTime(summary.startTime)}
          </span>
          <span className="text-xs text-gray-400">
            {calcDuration(summary.startTime, summary.endTime)}
          </span>
          <span className="text-xs bg-green-100 text-green-600 rounded px-2 py-0.5">
            {summary.entryCount} 発言
          </span>
        </div>
        <span className="text-gray-400 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3 border-t bg-white max-h-72 overflow-y-auto">
          {!detail ? (
            <p className="text-xs text-gray-400">読み込み中...</p>
          ) : detail.entries.length === 0 ? (
            <p className="text-xs text-gray-400">会話データなし</p>
          ) : (
            detail.entries.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span
                  className={`shrink-0 text-xs font-semibold w-16 pt-0.5 ${
                    entry.role === "user" ? "text-gray-500" : "text-blue-600"
                  }`}
                >
                  {entry.role === "user" ? "発信者" : "AI"}
                </span>
                <p className="text-xs text-gray-700 leading-relaxed">{entry.text}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CallHistoryPanel;
