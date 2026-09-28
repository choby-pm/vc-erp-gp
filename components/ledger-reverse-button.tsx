"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 납입 원장 행 취소 (BR-LED-02): 원래 행은 남기고 반대 금액의 취소 행을 추가한다

export default function LedgerReverseButton({ fundId, entryId, label }: { fundId: string; entryId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const memo = window.prompt(`${label}\n이 납입 기록을 취소합니다. 취소 사유를 입력하세요.`);
    if (!memo?.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/v1/funds/${fundId}/ledger/${entryId}/reversal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ memo }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      window.alert(json.error?.message ?? "취소하지 못했습니다");
      return;
    }
    router.refresh();
  }

  return (
    <button type="button" disabled={busy} onClick={onClick} className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50">
      {busy ? "취소 중…" : "취소"}
    </button>
  );
}
