"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json?.message || "로그인 실패");
        return;
      }
      router.replace(nextPath || "/admin/ops");
      router.refresh();
    } catch {
      setMessage("로그인 중 오류 발생");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-2xl border border-white/10 bg-card p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] space-y-4"
    >
      <div>
        <h1 className="text-2xl font-black tracking-tight">Admin Login</h1>
        <p className="mt-2 text-sm text-muted-foreground">관리자 비밀번호로 접근합니다.</p>
      </div>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="관리자 비밀번호"
        className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
      />
      <button
        type="submit"
        disabled={!password || loading}
        className="w-full rounded-xl bg-nzu-green px-3 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {loading ? "확인 중..." : "로그인"}
      </button>
      {message ? <p className="text-sm text-red-300">{message}</p> : null}
    </form>
  );
}
