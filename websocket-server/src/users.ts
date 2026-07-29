import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomUUID, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import {
  isDbAvailable,
  listUsersFromDb,
  getUserByUsernameFromDb,
  getUserByIdFromDb,
  countUsersFromDb,
  createUserInDb,
  updateUserInDb,
  deleteUserFromDb,
  DbUser,
} from "./database";

const USERS_PATH = process.env.USERS_PATH || "./users.json";
export type Role = "admin" | "editor" | "viewer";
export const ROLES: Role[] = ["admin", "editor", "viewer"];

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
}

function readFile(): StoredUser[] {
  if (!existsSync(USERS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(USERS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeFile(users: StoredUser[]): void {
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

function toPublic(u: StoredUser | DbUser) {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.createdAt };
}

export async function listUsers() {
  if (isDbAvailable()) return listUsersFromDb();
  return readFile()
    .map(toPublic)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

async function getUserByUsername(username: string): Promise<StoredUser | DbUser | null> {
  if (isDbAvailable()) return getUserByUsernameFromDb(username);
  return readFile().find((u) => u.username === username) || null;
}

async function getUserById(id: string): Promise<StoredUser | DbUser | null> {
  if (isDbAvailable()) return getUserByIdFromDb(id);
  return readFile().find((u) => u.id === id) || null;
}

async function countUsers(): Promise<number> {
  if (isDbAvailable()) return countUsersFromDb();
  return readFile().length;
}

export async function createUser(input: {
  username: string;
  password: string;
  role: Role;
}) {
  const existing = await getUserByUsername(input.username);
  if (existing) throw new Error("Username already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user: StoredUser = {
    id: randomUUID(),
    username: input.username,
    passwordHash,
    role: input.role,
    createdAt: new Date().toISOString(),
  };

  if (isDbAvailable()) {
    await createUserInDb(user);
  } else {
    const users = readFile();
    users.push(user);
    writeFile(users);
  }
  return toPublic(user);
}

export async function updateUser(
  id: string,
  fields: { role?: Role; password?: string }
) {
  const passwordHash = fields.password
    ? await bcrypt.hash(fields.password, 10)
    : undefined;

  if (isDbAvailable()) {
    await updateUserInDb(id, { role: fields.role, passwordHash });
  } else {
    const users = readFile();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) throw new Error("User not found");
    if (fields.role) users[idx].role = fields.role;
    if (passwordHash) users[idx].passwordHash = passwordHash;
    writeFile(users);
  }
}

export async function deleteUser(id: string): Promise<void> {
  if (isDbAvailable()) {
    await deleteUserFromDb(id);
  } else {
    writeFile(readFile().filter((u) => u.id !== id));
  }
}

export async function verifyPassword(username: string, password: string) {
  const user = await getUserByUsername(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return toPublic(user);
}

export async function getUserPublicById(id: string) {
  const user = await getUserById(id);
  return user ? toPublic(user) : null;
}

// 初回起動時、ユーザーが1人もいなければ管理者アカウントを自動作成する。
// 環境変数で指定がなければランダムなパスワードを生成してログに出力する
// （リポジトリに固定のデフォルトパスワードを残さないため）。
export async function ensureInitialAdmin(): Promise<void> {
  const count = await countUsers();
  if (count > 0) return;

  const username = process.env.INITIAL_ADMIN_USERNAME || "admin";
  const password = process.env.INITIAL_ADMIN_PASSWORD || randomBytes(9).toString("base64url");

  await createUser({ username, password, role: "admin" });

  console.log("========================================");
  console.log("[Auth] Created initial admin account:");
  console.log(`  username: ${username}`);
  if (!process.env.INITIAL_ADMIN_PASSWORD) {
    console.log(`  password: ${password}`);
    console.log("  (this was auto-generated - save it now, it will not be shown again)");
  } else {
    console.log("  password: (from INITIAL_ADMIN_PASSWORD env var)");
  }
  console.log("========================================");
}
