"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft, Trash } from "lucide-react";

type Role = "admin" | "editor" | "viewer";

interface AppUser {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

const ROLE_LABEL: Record<Role, string> = {
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; role: Role } | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (meData) => {
        setMe(meData);
        if (meData?.role !== "admin") {
          router.push("/");
          return;
        }
        await loadUsers();
        setLoading(false);
      });
  }, [loadUsers, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "作成に失敗しました");
        return;
      }
      setNewUsername("");
      setNewPassword("");
      setNewRole("viewer");
      await loadUsers();
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id: string, role: Role) => {
    await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await loadUsers();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    await loadUsers();
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          管理画面に戻る
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ユーザー管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{u.username}</span>
                    <span className="text-xs text-muted-foreground">
                      作成日: {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={u.role}
                      onValueChange={(v) => handleRoleChange(u.id, v as Role)}
                      disabled={u.id === me?.id}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">管理者</SelectItem>
                        <SelectItem value="editor">編集者</SelectItem>
                        <SelectItem value="viewer">閲覧者</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === me?.id}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleCreate} className="space-y-3 border-t pt-4">
              <label className="text-sm font-medium leading-none">
                新規ユーザーを作成
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="ユーザー名"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="flex-1 min-w-[10rem]"
                  required
                />
                <Input
                  type="password"
                  placeholder="パスワード"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 min-w-[10rem]"
                  required
                />
                <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">管理者</SelectItem>
                    <SelectItem value="editor">編集者</SelectItem>
                    <SelectItem value="viewer">閲覧者</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={creating}>
                  作成
                </Button>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <p className="text-xs text-muted-foreground">
                管理者: 全項目の編集・ユーザー管理が可能　/　編集者: 割り当てられたプリセットの編集・発信が可能　/　閲覧者: 閲覧のみ
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
