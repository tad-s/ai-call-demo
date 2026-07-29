import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "session";
export type Role = "admin" | "editor" | "viewer";

export interface SessionPayload {
  sub: string; // user id
  username: string;
  role: Role;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.sub === "string" &&
      typeof payload.username === "string" &&
      typeof payload.role === "string"
    ) {
      return {
        sub: payload.sub,
        username: payload.username as string,
        role: payload.role as Role,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// サーバーコンポーネント/Route Handler内で現在のセッションを読む
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// middleware内でリクエストのCookieヘッダーからセッションを読む
export async function getSessionFromCookieHeader(
  cookieHeader: string | null
): Promise<SessionPayload | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  return verifySessionToken(token);
}

export function canEdit(role: Role): boolean {
  return role === "admin" || role === "editor";
}

export function isAdmin(role: Role): boolean {
  return role === "admin";
}
