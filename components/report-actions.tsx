"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 보고서 초안: GP 코멘트 저장, 발행(스냅샷 고정 + LP 통지), 초안 삭제

export default function ReportActions({
  fundId,
  reportId,
  comment,
  canPublish,
  blockedReason,
}: {
  fundId: string;
  reportId: string;
  comment: string | null;
  canPublish: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(comment ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const base = `/api/v1/funds/${fundId}/reports/${reportId}`;

  async function call(method: string, path: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: json.error?.message ?? "처리하지 못했습니다" });
      return false;
    }
    return true;
  }

  async function save() {
    if (await call("PATCH", "", { gp_comment: text })) {
      setMessage({ ok: true, text: "코멘트를 저장했습니다" });
      router.refresh();
    }
  }

  async function publish() {
    if (!window.confirm("발행하면 지금 숫자가 고정되고 LP 조합원 전원에게 통지됩니다. 발행 후에는 고칠 수 없습니다. 발행할까요?")) return;
    // 저장하지 않은 코멘트가 있으면 먼저 저장한다
    if (text !== (comment ?? "") && !(await call("PATCH", "", { gp_comment: text }))) return;
    if (await call("POST", "/publish")) router.refresh();
  }

  async function remove() {
    if (!window.confirm("초안을 삭제할까요?")) return;
    if (await call("DELETE", "")) {
      router.push(`/funds/${fundId}/reports`);
      router.refresh();
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">GP 코멘트</h2>
      <p className="mt-0.5 text-xs text-slate-500">LP에게 보내는 운용 현황 설명. 발행 통지에 함께 들어갑니다.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="예: 이번 분기에는 신규 투자 2건을 집행했고, 포트폴리오 A사가 후속 투자를 유치했습니다."
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {!canPublish && blockedReason && <span className="mr-auto text-xs text-slate-500">{blockedReason}</span>}
        <button type="button" disabled={busy} onClick={remove} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
          초안 삭제
        </button>
        <button type="button" disabled={busy} onClick={save} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          코멘트 저장
        </button>
        <button type="button" disabled={busy || !canPublish} onClick={publish} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          발행
        </button>
      </div>
    </section>
  );
}
