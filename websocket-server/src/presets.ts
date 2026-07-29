import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import {
  isDbAvailable,
  listPresetsFromDb,
  getPresetFromDb,
  savePresetToDb,
  deletePresetFromDb,
} from "./database";

const PRESETS_PATH = process.env.PRESETS_PATH || "./presets.json";

interface Preset {
  id: string;
  name: string;
  config: any;
  updatedAt: string;
  assignedUserIds: string[];
}

function readFile(): Preset[] {
  if (!existsSync(PRESETS_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(PRESETS_PATH, "utf-8"));
    // 旧形式（assignedUserIdsなし）との互換
    return parsed.map((p: any) => ({ assignedUserIds: [], ...p }));
  } catch {
    return [];
  }
}

function writeFile(presets: Preset[]): void {
  writeFileSync(PRESETS_PATH, JSON.stringify(presets, null, 2));
}

export async function listPresets(): Promise<
  { id: string; name: string; updatedAt: string; assignedUserIds: string[] }[]
> {
  if (isDbAvailable()) return listPresetsFromDb();
  return readFile()
    .map(({ id, name, updatedAt, assignedUserIds }) => ({
      id,
      name,
      updatedAt,
      assignedUserIds,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getPreset(id: string): Promise<Preset | null> {
  if (isDbAvailable()) return getPresetFromDb(id);
  return readFile().find((p) => p.id === id) || null;
}

export async function savePreset(input: {
  id?: string;
  name: string;
  config: any;
  assignedUserIds?: string[];
}): Promise<Preset> {
  const id = input.id || randomUUID();
  const existing = await getPreset(id);
  const preset: Preset = {
    id,
    name: input.name,
    config: input.config,
    assignedUserIds: input.assignedUserIds ?? existing?.assignedUserIds ?? [],
    updatedAt: new Date().toISOString(),
  };

  if (isDbAvailable()) {
    await savePresetToDb(preset);
  } else {
    const presets = readFile();
    const idx = presets.findIndex((p) => p.id === id);
    if (idx >= 0) presets[idx] = preset;
    else presets.push(preset);
    writeFile(presets);
  }
  return preset;
}

export async function deletePreset(id: string): Promise<void> {
  if (isDbAvailable()) {
    await deletePresetFromDb(id);
  } else {
    writeFile(readFile().filter((p) => p.id !== id));
  }
}
