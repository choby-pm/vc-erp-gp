"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FUND_STATUS_LABEL, type FundStatus } from "@/lib/labels";

// 조합 상태를 다음 단계로 옮기는 버튼. 서버가 조건을 다시 검사하고, 부족하면 남은 조건을 보여준다

type Unmet = { label: string; hint?: string };

export default function FundTransitionButton({ fundId, to, label, confirmMessage }: { fundId: string; to: FundStatus; label: string; confirmMessage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; unmet: Unmet[] } | null>(null);

  async function onClick() {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/transitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: to }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError({ message: json.error?.message ?? `${FUND_STATUS_LABEL[to]}(으)로 옮기지 못했습니다`, unmet: json.error?.details?.unmet_conditions ?? [] });
      return;
    }
    router.refresh();
  }

  return (
    <div className="relative">
      <button type="button" disabled={busy} onClick={onClick} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
        {busy ? "처리 중…" : label}
      </button>
      {error && (
        <div role="alert" className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 shadow">
          <p>{error.message}</p>
          {error.unmet.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {error.unmet.map((c) => (
                <li key={c.label}>
                  {c.label}
                  {c.hint && <span className="block text-red-600/80">{c.hint}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
