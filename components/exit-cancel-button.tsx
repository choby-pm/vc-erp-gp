"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKRWFull } from "@/lib/format";

// 회수 취소 (BR-EXIT-08). 회수는 수정하지 않고 취소한 뒤 다시 기록한다

export default function ExitCancelButton({ fundId, exitId, label, amount }: { fundId: string; exitId: string; label: string; amount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    const reason = window.prompt(`${label} 회수 ${formatKRWFull(amount)}\n이 회수를 취소합니다. 처분 분개가 역분개되고 포트폴리오·현금에서 빠집니다. 취소 사유를 입력하세요.`);
    if (!reason?.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/v1/funds/${fundId}/exits/${exitId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) window.alert(json.error?.message ?? "취소하지 못했습니다");
    router.refresh();
  }
  return (
    <button type="button" disabled={busy} onClick={run} className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50">
      취소
    </button>
  );
}
