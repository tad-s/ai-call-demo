import { NextResponse } from "next/server";
import { getSession, canEdit } from "@/lib/auth";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

export async function POST() {
  const session = await getSession();
  if (!session || !canEdit(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await fetch(`${serverUrl}/end-call`, { method: "POST" });
  if (!res.ok) return NextResponse.json({ error: "Failed to end call" }, { status: 502 });
  return NextResponse.json(await res.json());
}
