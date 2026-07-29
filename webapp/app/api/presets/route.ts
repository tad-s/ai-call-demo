import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await fetch(`${serverUrl}/presets`);
  if (!res.ok) return NextResponse.json({ error: "Failed to fetch presets" }, { status: 502 });
  const all: { id: string; name: string; updatedAt: string; assignedUserIds: string[] }[] =
    await res.json();

  const visible = isAdmin(session.role)
    ? all
    : all.filter((p) => p.assignedUserIds?.includes(session.sub));

  // 管理者以外にはassignedUserIdsを見せる必要がない
  const shaped = isAdmin(session.role)
    ? visible
    : visible.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));

  return NextResponse.json(shaped);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, config } = body;
  if (!name || !config) {
    return NextResponse.json({ error: "name and config are required" }, { status: 400 });
  }

  // 管理者だけが割り当てユーザーを指定できる。編集者が新規作成した場合は
  // 自分自身を割り当てて、作成直後から自分に見えるようにする
  const assignedUserIds = isAdmin(session.role)
    ? Array.isArray(body.assignedUserIds)
      ? body.assignedUserIds
      : [session.sub]
    : [session.sub];

  const res = await fetch(`${serverUrl}/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, config, assignedUserIds }),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to save preset" }, { status: 502 });
  return NextResponse.json(await res.json());
}
