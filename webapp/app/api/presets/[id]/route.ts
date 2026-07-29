import { NextResponse } from "next/server";
import { getSession, isAdmin, SessionPayload } from "@/lib/auth";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

async function fetchPreset(id: string) {
  const res = await fetch(`${serverUrl}/presets/${id}`);
  if (!res.ok) return null;
  return res.json();
}

function canAccess(
  session: SessionPayload,
  preset: { assignedUserIds: string[] }
) {
  return isAdmin(session.role) || preset.assignedUserIds?.includes(session.sub);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const preset = await fetchPreset(params.id);
  if (!preset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccess(session, preset)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isAdmin(session.role)) {
    const { assignedUserIds, ...rest } = preset;
    return NextResponse.json(rest);
  }
  return NextResponse.json(preset);
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await fetchPreset(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccess(session, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, config } = body;
  if (!name || !config) {
    return NextResponse.json({ error: "name and config are required" }, { status: 400 });
  }

  // 割り当てユーザーの変更は管理者のみ許可（編集者は既存の割り当てを維持）
  const assignedUserIds = isAdmin(session.role)
    ? Array.isArray(body.assignedUserIds)
      ? body.assignedUserIds
      : existing.assignedUserIds
    : existing.assignedUserIds;

  const res = await fetch(`${serverUrl}/presets/${params.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, config, assignedUserIds }),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to save preset" }, { status: 502 });
  return NextResponse.json(await res.json());
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await fetchPreset(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccess(session, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await fetch(`${serverUrl}/presets/${params.id}`, { method: "DELETE" });
  if (!res.ok) return NextResponse.json({ error: "Failed to delete preset" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
