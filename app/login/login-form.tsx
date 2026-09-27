"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiError = { error?: { message?: string } };

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"demo" | "login" | null>(null);

  async function submit(kind: "demo" | "login") {
    setPending(kind);
    setError(null);
    try {
      const res = await fetch(kind === "demo" ? "/api/v1/auth/demo-login" : "/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "demo" ? undefined : JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ApiError;
        setError(body.error?.message ?? "로그인에 실패했습니다");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => submit("demo")}
        disabled={pending !== null}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending === "demo" ? "들어가는 중…" : "데모 계정으로 둘러보기 →"}
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        또는
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit("login");
        }}
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-700">이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">비밀번호</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <button
          type="submit"
          disabled={pending !== null}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {pending === "login" ? "확인 중…" : "로그인"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
