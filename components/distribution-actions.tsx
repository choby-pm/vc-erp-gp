"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, formatKRWFull } from "@/lib/format";
import type { DistributionStatus } from "@/lib/labels";

// 분배 초안 삭제 · 확정(LP 통지) · 지급(원장·분개) · 취소(BR-DIST-12) 버튼 (BR-DIST-05, 06)

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function DistributionActions({
  fundId,
  distributionId,
  status,
  amount,
  date,
  title,
}: {
  fundId: string;
  distributionId: string;
  status: DistributionStatus;
  amount: number;
  date: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/funds/${fundId}/distributions/${distributionId}`;

  async function call(path: string, method: "POST" | "DELETE", confirmMessage: string, after?: string) {
    if (!window.confirm(confirmMessage)) return;
    await send(path, method, undefined, after);
  }

  async function send(path: string, method: "POST" | "DELETE", body?: object, after?: string) {
    setBusy(true);
    setError(null);
    const headers: Record<string, string> = method === "POST" ? { "Idempotency-Key": crypto.randomUUID() } : {};
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "처리하지 못했습니다");
      return;
    }
    if (after) router.push(after);
    router.refresh();
  }

  function cancel() {
    const effect =
      status === "paid"
        ? "조합원 원장에 취소 행(음수)이 오늘 날짜로 기록되고 분배 분개가 역분개됩니다. 지급한 돈은 조합원에게서 돌려받아야 합니다."
        : "지급하지 않고 취소 상태로 남습니다.";
    const reason = window.prompt(`${title} ${formatKRWFull(amount)}을 취소합니다.\n${effect}\nLP 조합원에게 취소 통지가 발송됩니다. 취소 사유를 입력하세요.`);
    if (!reason?.trim()) return;
    void send("/cancel", "POST", { reason });
  }

  if (status === "cancelled") return null;
  const notYet = status === "confirmed" && date > today();

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === "draft" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => call("", "DELETE", `${title} 초안을 삭제할까요?`, `/funds/${fundId}/distributions`)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              초안 삭제
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => call("/confirm", "POST", `${title} ${formatKRWFull(amount)}을 확정할까요?\n확정하면 수정·삭제할 수 없고, LP 조합원에게 각자 분배액이 담긴 통지가 발송됩니다.`)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "처리 중…" : "확정 · 통지 발송"}
            </button>
          </>
        )}
        {status === "confirmed" && (
          <button
            type="button"
            disabled={busy || notYet}
            title={notYet ? `분배일(${formatDate(date)})이 되면 지급할 수 있습니다` : undefined}
            onClick={() => call("/pay", "POST", `${title} ${formatKRWFull(amount)}을 ${formatDate(date)} 날짜로 지급 처리할까요?\n조합원별 분배 원장과 회계 분개가 기록되고, 되돌릴 수 없습니다.`)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "처리 중…" : "지급 처리"}
          </button>
        )}
        {(status === "confirmed" || status === "paid") && (
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
          >
            분배 취소
          </button>
        )}
      </div>
      {notYet && <p className="text-xs text-slate-500">분배일({formatDate(date)})이 되면 지급할 수 있습니다</p>}
      {error && <p className="max-w-md rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
