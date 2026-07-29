import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { role, password } = await req.json();
  const res = await fetch(`${serverUrl}/users/${params.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, password }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.sub === params.id) {
    return NextResponse.json(
      { error: "自分自身のアカウントは削除できません" },
      { status: 400 }
    );
  }

  const res = await fetch(`${serverUrl}/users/${params.id}`, { method: "DELETE" });
  if (!res.ok) return NextResponse.json({ error: "Failed to delete user" }, { status: 502 });
  return NextResponse.json(await res.json());
}
