import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await fetch(`${serverUrl}/config`);
  if (!res.ok) return NextResponse.json({ error: "Failed to fetch config" }, { status: 502 });
  return NextResponse.json(await res.json());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await req.json();
  const res = await fetch(`${serverUrl}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to save config" }, { status: 502 });
  return NextResponse.json(await res.json());
}
