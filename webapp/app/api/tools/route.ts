import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await fetch(`${serverUrl}/tools`);
  if (!res.ok) return NextResponse.json({ error: "Failed to fetch tools" }, { status: 502 });
  return NextResponse.json(await res.json());
}
