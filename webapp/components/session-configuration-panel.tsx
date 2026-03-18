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
  const [model, setModel] = useState("gpt-4o-realtime-preview-2024-12-17");
  const [tools, setTools] = useState<string[]>([]);
  const [disconnectPhrases, setDisconnectPhrases] = useState("お電話ありがとうございました");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingSchemaStr, setEditingSchemaStr] = useState("");
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

  // Custom hook to fetch backend tools every 3 seconds
  const backendTools = useBackendTools(`${serverUrl}/tools`, 3000);

  // 起動時に保存済み設定を取得してフォームに反映
  useEffect(() => {
    fetch(`${serverUrl}/config`)
      .then((r) => r.json())
      .then((config) => {
        if (config.instructions) setInstructions(config.instructions);
        if (config.voice) setVoice(config.voice);
        if (config.model) setModel(config.model);
        if (config.tools) setTools(config.tools.map((t: any) => JSON.stringify(t)));
        if (config.disconnect_phrases) setDisconnectPhrases(config.disconnect_phrases.join("\n"));
        setHasUnsavedChanges(false);
        if (onConfigLoaded && (config.instructions || config.voice)) {
          onConfigLoaded({
            instructions: config.instructions,
            voice: config.voice || "ash",
            model: config.model || "gpt-4o-realtime-preview-2024-12-17",
            tools: config.tools || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  // Track changes to determine if there are unsaved modifications
  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [instructions, voice, model, tools, disconnectPhrases]);

  // Reset save status after a delay when saved
  useEffect(() => {
    if (saveStatus === "saved") {
      const timer = setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      await onSave({
        instructions,
        voice,
        model,
        tools: tools.map((tool) => JSON.parse(tool)),
        disconnect_phrases: disconnectPhrases
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setSaveStatus("saved");
      setHasUnsavedChanges(false);
    } catch (error) {
      setSaveStatus("error");
    }
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
    <Card className="flex flex-col h-full w-full mx-auto min-h-0">
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
      <CardContent className="flex-1 p-3 sm:p-5 overflow-hidden min-h-0">
        <div className="h-full overflow-y-auto">
          <div className="space-y-4 sm:space-y-6 m-1 pr-1">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Instructions
              </label>
              <Textarea
                placeholder="Enter instructions"
                className="min-h-[100px] resize-none"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Voice</label>
              <Select value={voice} onValueChange={setVoice}>
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
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-realtime-preview-2024-12-17">
                    gpt-4o-realtime (2024-12-17)
                  </SelectItem>
                  <SelectItem value="gpt-4o-realtime-preview-2025-06-03">
                    gpt-4o-realtime-1.5 (2025-06-03)
                  </SelectItem>
                  <SelectItem value="gpt-4o-mini-realtime-preview">
                    gpt-4o-mini-realtime (高速・低コスト)
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
              />
              <p className="text-xs text-muted-foreground">
                AIがこのフレーズを発話した後、自動で通話を切断します。複数行で複数設定可。
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
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAddTool}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tool
                </Button>
              </div>
            </div>

          </div>
        </div>
      </CardContent>

      <div className="px-3 pb-3 sm:px-5 sm:pb-5 pt-0">
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={saveStatus === "saving" || !hasUnsavedChanges}
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
