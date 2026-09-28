"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 연동 이벤트: 지금 전송 · 실패 이벤트 재전송

export function DispatchButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    const res = await fetch("/api/v1/integration-events/dispatch", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    const r = json.data;
    setMessage(!res.ok ? (json.error?.message ?? "전송하지 못했습니다") : !r.configured ? "웹훅 주소가 설정되지 않아 보내지 않았습니다" : `전송 ${r.delivered}건 · 실패 ${r.failed}건 · 순서 대기 ${r.waiting}건`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-slate-600">{message}</span>}
      <button type="button" onClick={run} disabled={busy || !configured} title={configured ? undefined : "LP_SYSTEM_WEBHOOK_URL 을 설정하면 보낼 수 있습니다"} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
        {busy ? "전송 중…" : "대기 이벤트 지금 전송"}
      </button>
    </div>
  );
}

export function RetryButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/v1/integration-events/${eventId}/retry`, { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
      className="rounded border border-rose-300 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
    >
      재전송
    </button>
  );
}
