import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash, Check, AlertCircle } from "lucide-react";
import { toolTemplates } from "@/lib/tool-templates";
import { ToolConfigurationDialog } from "./tool-configuration-dialog";
import { BackendTag } from "./backend-tag";
import { useBackendTools } from "@/lib/use-backend-tools";

interface SessionConfigurationPanelProps {
  callStatus: string;
  onSave: (config: any) => void;
  onConfigLoaded?: (config: any) => void;
}

const SessionConfigurationPanel: React.FC<SessionConfigurationPanelProps> = ({
  callStatus,
  onSave,
  onConfigLoaded,
}) => {
  const [instructions, setInstructions] = useState(
    "You are a helpful assistant in a phone call."
  );
  const [voice, setVoice] = useState("ash");
  const [model, setModel] = useState("gpt-realtime-2");
  const [tools, setTools] = useState<string[]>([]);
  const [disconnectPhrases, setDisconnectPhrases] = useState("お電話ありがとうございました");
  const [silenceDurationMs, setSilenceDurationMs] = useState(800);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingSchemaStr, setEditingSchemaStr] = useState("");
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [presets, setPresets] = useState<
    { id: string; name: string; updatedAt: string }[]
  >([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [presetStatus, setPresetStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);

  const [role, setRole] = useState<"admin" | "editor" | "viewer" | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; username: string }[]>([]);
  const readOnly = role === "viewer";

  // Custom hook to fetch backend tools every 3 seconds
  const backendTools = useBackendTools("/api/tools", 3000);

  // 自分のロールを取得
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setRole(me?.role || null))
      .catch(() => {});
  }, []);

  // 管理者の場合のみ、プリセットの割り当て先選択用にユーザー一覧を取得
  useEffect(() => {
    if (role !== "admin") return;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) =>
        setAllUsers(Array.isArray(list) ? list.map((u: any) => ({ id: u.id, username: u.username })) : [])
      )
      .catch(() => {});
  }, [role]);

  // 起動時に保存済み設定を取得してフォームに反映
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((config) => {
        if (config.instructions) setInstructions(config.instructions);
        if (config.voice) setVoice(config.voice);
        if (config.model) setModel(config.model);
        if (config.tools) setTools(config.tools.map((t: any) => JSON.stringify(t)));
        if (config.disconnect_phrases) setDisconnectPhrases(config.disconnect_phrases.join("\n"));
        if (config.silence_duration_ms) setSilenceDurationMs(config.silence_duration_ms);
        setHasUnsavedChanges(false);
        if (onConfigLoaded && (config.instructions || config.voice)) {
          onConfigLoaded({
            instructions: config.instructions,
            voice: config.voice || "ash",
            model: config.model || "gpt-realtime",
            tools: config.tools || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  // プリセット一覧を取得
  useEffect(() => {
    fetch("/api/presets")
      .then((r) => r.json())
      .then((list) => setPresets(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  // Track changes to determine if there are unsaved modifications
  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [instructions, voice, model, tools, disconnectPhrases, silenceDurationMs]);

  // Reset save status after a delay when saved
  useEffect(() => {
    if (saveStatus === "saved") {
      const timer = setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  // Reset preset status after a delay when saved
  useEffect(() => {
    if (presetStatus === "saved") {
      const timer = setTimeout(() => setPresetStatus("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [presetStatus]);

  const buildConfig = () => ({
    instructions,
    voice,
    model,
    tools: tools.map((tool) => JSON.parse(tool)),
    disconnect_phrases: disconnectPhrases
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    silence_duration_ms: silenceDurationMs,
  });

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      await onSave(buildConfig());
      setSaveStatus("saved");
      setHasUnsavedChanges(false);
    } catch (error) {
      setSaveStatus("error");
    }
  };

  const handleLoadPreset = async (id: string) => {
    setSelectedPresetId(id);
    if (!id) return;
    try {
      const res = await fetch(`/api/presets/${id}`);
      if (!res.ok) return;
      const preset = await res.json();
      const config = preset.config || {};
      if (config.instructions !== undefined) setInstructions(config.instructions);
      if (config.voice) setVoice(config.voice);
      if (config.model) setModel(config.model);
      setTools((config.tools || []).map((t: any) => JSON.stringify(t)));
      setDisconnectPhrases((config.disconnect_phrases || []).join("\n"));
      if (config.silence_duration_ms) setSilenceDurationMs(config.silence_duration_ms);
      setAssignedUserIds(preset.assignedUserIds || []);
    } catch {
      // ignore
    }
  };

  const handleSaveAsNewPreset = async () => {
    const name = newPresetName.trim();
    if (!name) return;
    setPresetStatus("saving");
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, config: buildConfig(), assignedUserIds }),
      });
      if (!res.ok) throw new Error("failed");
      const preset = await res.json();
      setPresets((prev) => [
        { id: preset.id, name: preset.name, updatedAt: preset.updatedAt },
        ...prev,
      ]);
      setSelectedPresetId(preset.id);
      setNewPresetName("");
      setPresetStatus("saved");
    } catch {
      setPresetStatus("error");
    }
  };

  const handleUpdatePreset = async () => {
    const current = presets.find((p) => p.id === selectedPresetId);
    if (!current) return;
    setPresetStatus("saving");
    try {
      const res = await fetch(`/api/presets/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: current.name, config: buildConfig(), assignedUserIds }),
      });
      if (!res.ok) throw new Error("failed");
      const preset = await res.json();
      setPresets((prev) =>
        prev.map((p) => (p.id === preset.id ? { ...p, updatedAt: preset.updatedAt } : p))
      );
      setPresetStatus("saved");
    } catch {
      setPresetStatus("error");
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPresetId) return;
    try {
      await fetch(`/api/presets/${selectedPresetId}`, { method: "DELETE" });
      setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
      setSelectedPresetId("");
      setAssignedUserIds([]);
    } catch {
      // ignore
    }
  };

  const toggleAssignedUser = (userId: string) => {
    setAssignedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddTool = () => {
    setEditingIndex(null);
    setEditingSchemaStr("");
    setSelectedTemplate("");
    setIsJsonValid(true);
    setOpenDialog(true);
  };

  const handleEditTool = (index: number) => {
    setEditingIndex(index);
    setEditingSchemaStr(tools[index] || "");
    setSelectedTemplate("");
    setIsJsonValid(true);
    setOpenDialog(true);
  };

  const handleDeleteTool = (index: number) => {
    const newTools = [...tools];
    newTools.splice(index, 1);
    setTools(newTools);
  };

  const handleDialogSave = () => {
    try {
      JSON.parse(editingSchemaStr);
    } catch {
      return;
    }
    const newTools = [...tools];
    if (editingIndex === null) {
      newTools.push(editingSchemaStr);
    } else {
      newTools[editingIndex] = editingSchemaStr;
    }
    setTools(newTools);
    setOpenDialog(false);
  };

  const handleTemplateChange = (val: string) => {
    setSelectedTemplate(val);

    // Determine if the selected template is from local or backend
    let templateObj =
      toolTemplates.find((t) => t.name === val) ||
      backendTools.find((t: any) => t.name === val);

    if (templateObj) {
      setEditingSchemaStr(JSON.stringify(templateObj, null, 2));
      setIsJsonValid(true);
    }
  };

  const onSchemaChange = (value: string) => {
    setEditingSchemaStr(value);
    try {
      JSON.parse(value);
      setIsJsonValid(true);
    } catch {
      setIsJsonValid(false);
    }
  };

  const getToolNameFromSchema = (schema: string): string => {
    try {
      const parsed = JSON.parse(schema);
      return parsed?.name || "Untitled Tool";
    } catch {
      return "Invalid JSON";
    }
  };

  const isBackendTool = (name: string): boolean => {
    return backendTools.some((t: any) => t.name === name);
  };

  return (
    <Card className="flex flex-col h-full w-full mx-auto lg:min-h-0">
      <CardHeader className="pb-0 px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Session Configuration
          </CardTitle>
          <div className="flex items-center gap-2">
            {saveStatus === "error" ? (
              <span className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Save failed
              </span>
            ) : hasUnsavedChanges ? (
              <span className="text-xs text-muted-foreground">Not saved</span>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="lg:flex-1 p-3 sm:p-5 overflow-visible lg:overflow-hidden lg:min-h-0">
        <div className="lg:h-full overflow-visible lg:overflow-y-auto">
          <div className="space-y-4 sm:space-y-6 m-1 pr-1">
            <div className="space-y-2 pb-4 border-b">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium leading-none">
                  プロンプトプリセット
                </label>
                {presetStatus === "saved" && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    保存しました
                  </span>
                )}
                {presetStatus === "error" && (
                  <span className="text-xs text-red-500">保存に失敗しました</span>
                )}
              </div>
              <div className="flex gap-2">
                <Select value={selectedPresetId} onValueChange={handleLoadPreset}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="プリセットを選択して読み込む" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeletePreset}
                  disabled={!selectedPresetId || readOnly}
                  className="h-10 w-10 shrink-0"
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
              {!readOnly && (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="新しいプリセット名"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleSaveAsNewPreset}
                      disabled={!newPresetName.trim()}
                      className="shrink-0"
                    >
                      新規保存
                    </Button>
                  </div>
                  {selectedPresetId && (
                    <Button variant="outline" className="w-full" onClick={handleUpdatePreset}>
                      現在の内容をこのプリセットに上書き保存
                    </Button>
                  )}
                </>
              )}
              {role === "admin" && (
                <div className="space-y-1 pt-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    このプリセットを見せるユーザー
                  </label>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {allUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-1.5 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={assignedUserIds.includes(u.id)}
                          onChange={() => toggleAssignedUser(u.id)}
                        />
                        {u.username}
                      </label>
                    ))}
                    {allUsers.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        ユーザーがいません
                      </span>
                    )}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                プリセットを読み込むと下のフォームに反映されます。実際の通話に適用するには「Save Configuration」を押してください。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Instructions
              </label>
              <Textarea
                placeholder="Enter instructions"
                className="min-h-[100px] resize-none"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={readOnly}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Voice</label>
              <Select value={voice} onValueChange={setVoice} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {["ash", "ballad", "coral", "sage", "verse"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Model</label>
              <Select value={model} onValueChange={setModel} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-realtime-2">
                    gpt-realtime-2（GPT-5クラス・最高品質・推奨）
                  </SelectItem>
                  <SelectItem value="gpt-realtime">
                    gpt-realtime（標準品質）
                  </SelectItem>
                  <SelectItem value="gpt-realtime-mini">
                    gpt-realtime-mini（高速・低コスト）
                  </SelectItem>
                  <SelectItem value="gpt-4o-realtime-preview">
                    gpt-4o-realtime-preview（旧世代）
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                切断フレーズ
              </label>
              <Textarea
                placeholder="お電話ありがとうございました"
                className="min-h-[60px] resize-none"
                value={disconnectPhrases}
                onChange={(e) => setDisconnectPhrases(e.target.value)}
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                AIがこのフレーズを発話した後、自動で通話を切断します。複数行で複数設定可。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                発話終了待機時間
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={200}
                  max={2000}
                  step={100}
                  value={silenceDurationMs}
                  onChange={(e) => setSilenceDurationMs(Number(e.target.value))}
                  className="flex-1"
                  disabled={readOnly}
                />
                <span className="text-sm font-mono w-16 text-right">
                  {silenceDurationMs} ms
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                発話が止まってからAIが応答するまでの待ち時間。長くするほど話の途中での割り込みを防ぎます（推奨: 800〜1200ms）。
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Tools</label>
              <div className="space-y-2">
                {tools.map((tool, index) => {
                  const name = getToolNameFromSchema(tool);
                  const backend = isBackendTool(name);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border p-2 sm:p-3 gap-2"
                    >
                      <span className="text-sm truncate flex-1 min-w-0 flex items-center">
                        {name}
                        {backend && <BackendTag />}
                      </span>
                      {!readOnly && (
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditTool(index)}
                            className="h-8 w-8"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteTool(index)}
                            className="h-8 w-8"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!readOnly && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleAddTool}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tool
                  </Button>
                )}
              </div>
            </div>

          </div>
        </div>
      </CardContent>

      <div className="px-3 pb-3 sm:px-5 sm:pb-5 pt-0">
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={readOnly || saveStatus === "saving" || !hasUnsavedChanges}
        >
          {saveStatus === "saving" ? (
            "Saving..."
          ) : saveStatus === "saved" ? (
            <span className="flex items-center">
              Saved Successfully
              <Check className="ml-2 h-4 w-4" />
            </span>
          ) : saveStatus === "error" ? (
            "Error Saving"
          ) : (
            "Save Configuration"
          )}
        </Button>
      </div>

      <ToolConfigurationDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        editingIndex={editingIndex}
        selectedTemplate={selectedTemplate}
        editingSchemaStr={editingSchemaStr}
        isJsonValid={isJsonValid}
        onTemplateChange={handleTemplateChange}
        onSchemaChange={onSchemaChange}
        onSave={handleDialogSave}
        backendTools={backendTools}
      />
    </Card>
  );
};

export default SessionConfigurationPanel;
