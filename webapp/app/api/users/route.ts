import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

export async function GET() {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await fetch(`${serverUrl}/users`);
  if (!res.ok) return NextResponse.json({ error: "Failed to fetch users" }, { status: 502 });
  return NextResponse.json(await res.json());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, password, role } = await req.json();
  if (!username || !password || !role) {
    return NextResponse.json(
      { error: "username, password and role are required" },
      { status: 400 }
    );
  }

  const res = await fetch(`${serverUrl}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}
