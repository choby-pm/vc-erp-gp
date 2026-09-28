"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 일반 공지 작성(초안) · 발송 · 초안 삭제 (BR-NTC-01)

type Member = { lp_id: string; lp_name: string };

export function NoticeForm({ fundId, members }: { fundId: string; members: Member[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/notices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, lp_ids: all ? [] : picked }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(Object.values(json.error?.details?.fields ?? {})[0] as string ?? json.error?.message ?? "저장하지 못했습니다");
      return;
    }
    setTitle("");
    setBody("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
        + 일반 공지 작성
      </button>
    );
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
  return (
    <form onSubmit={onSubmit} className="w-full rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">일반 공지 작성</h2>
      <p className="mt-0.5 text-xs text-slate-500">초안으로 저장한 뒤 발송합니다. 발송하면 수정·삭제할 수 없습니다.</p>
      <label className="mt-4 block">
        <span className="text-xs font-medium text-slate-600">제목</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026년 4분기 수탁은행 변경 안내" className={input} />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-medium text-slate-600">내용</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={input} />
      </label>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-600">수신자</legend>
        <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          LP 조합원 전원 ({members.length}곳)
        </label>
        {!all && (
          <div className="mt-2 flex flex-wrap gap-2">
            {members.map((m) => {
              const on = picked.includes(m.lp_id);
              return (
                <button
                  key={m.lp_id}
                  type="button"
                  onClick={() => setPicked(on ? picked.filter((id) => id !== m.lp_id) : [...picked, m.lp_id])}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {m.lp_name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-sm text-slate-500">
          취소
        </button>
        <button type="submit" disabled={busy || !title.trim() || !body.trim() || (!all && picked.length === 0)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy ? "저장 중…" : "초안 저장"}
        </button>
      </div>
    </form>
  );
}

export function NoticeDraftActions({ fundId, noticeId, recipients }: { fundId: string; noticeId: string; recipients: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(path: string, method: "POST" | "DELETE", message: string) {
    if (!window.confirm(message)) return;
    setBusy(true);
    const res = await fetch(`/api/v1/funds/${fundId}/notices/${noticeId}${path}`, { method, headers: method === "POST" ? { "Idempotency-Key": crypto.randomUUID() } : undefined });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) window.alert(json.error?.message ?? "처리하지 못했습니다");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => call("", "DELETE", "이 초안을 삭제할까요?")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
        삭제
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => call("/send", "POST", `LP ${recipients}곳에 발송할까요? 발송하면 수정·삭제할 수 없습니다.`)}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
      >
        발송
      </button>
    </div>
  );
}
