"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 명부 취소 (BR-MEM-05): 사유를 받아 약정 원장을 취소 행으로 되돌린다

export default function RosterCancel({ fundId }: { fundId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCancel() {
    if (!window.confirm("명부를 취소할까요? 약정 원장에 취소 행이 추가되고, 다시 확정할 수 있습니다.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/roster`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.details?.fields?.reason ?? json.error?.message ?? "취소하지 못했습니다");
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">
        명부 취소
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="취소 사유 (예: LP 약정액 변경)" className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
        {busy ? "취소 중…" : "취소 확정"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-700">
        닫기
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </div>
  );
}
