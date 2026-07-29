import { NextResponse } from "next/server";
import { signSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json(
      { error: "username and password are required" },
      { status: 400 }
    );
  }

  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";
  let user: { id: string; username: string; role: "admin" | "editor" | "viewer" };
  try {
    const res = await fetch(`${serverUrl}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "ユーザー名またはパスワードが違います" },
        { status: 401 }
      );
    }
    const data = await res.json();
    user = data.user;
  } catch {
    return NextResponse.json(
      { error: "認証サーバーに接続できませんでした" },
      { status: 502 }
    );
  }

  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: user.role,
  });

  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
