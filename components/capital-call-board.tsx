"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRWFull, formatPercent } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/labels";
import type { CapitalCallDetail } from "@/lib/services/capital-calls";

// 캐피탈콜 상세: 초안 삭제·발송, 조합원별 납입 기록, 수동 마감.
// 발송·납입은 돈이 걸린 요청이라 Idempotency-Key 를 붙인다 (두 번 눌러도 한 번만 처리)

const STATUS_COLOR: Record<PaymentStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  partial: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-rose-100 text-rose-700",
};

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

function useApi(base: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function call(method: string, path: string, body?: unknown, idempotent = false) {
    setBusy(true);
    setError(null);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (idempotent) headers["Idempotency-Key"] = crypto.randomUUID();
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "처리하지 못했습니다");
      return null;
    }
    return json;
  }
  return { call, busy, error, router };
}

export default function CapitalCallBoard({ fundId, call }: { fundId: string; call: CapitalCallDetail }) {
  const base = `/api/v1/funds/${fundId}/capital-calls/${call.id}`;
  const { call: api, busy, error, router } = useApi(base);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4">
        <div className="flex-1">
          <div className="h-2 w-full max-w-md rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, call.paid_ratio * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            납입 {formatKRWFull(call.paid_amount)} / 요청 {formatKRWFull(call.total_call_amount)} ({formatPercent(call.paid_ratio, 1)})
            {call.status !== "draft" && call.unpaid_member_count > 0 && ` · 미납 ${call.unpaid_member_count}명`}
          </p>
        </div>
        {call.status === "draft" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => window.confirm("초안을 삭제할까요?") && (await api("DELETE", "")) && (router.push(`/funds/${fundId}/capital-calls`), router.refresh())}
              className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              초안 삭제
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () =>
                window.confirm("발송하면 요청이 잠기고 LP 조합원마다 자기 요청액이 담긴 통지가 나갑니다. 발송할까요?") && (await api("POST", "/issue", undefined, true)) && router.refresh()
              }
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              발송
            </button>
          </>
        )}
        {call.status === "issued" && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => window.confirm("미납이 남아 있어도 마감할까요? 마감 후에도 납입은 기록할 수 있습니다.") && (await api("POST", "/close")) && router.refresh()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            수동 마감
          </button>
        )}
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">조합원별 요청·납입</h2>
        <ul className="divide-y divide-slate-100">
          {call.items.map((it) => (
            <ItemRow key={it.id} base={base} item={it} canPay={call.status !== "draft"} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ItemRow({ base, item, canPay }: { base: string; item: CapitalCallDetail["items"][number]; canPay: boolean }) {
  const { call: api, busy, error, router } = useApi(base);
  const remaining = item.call_amount - item.paid_amount;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(today());

  async function pay() {
    const done = await api("POST", `/items/${item.id}/payments`, { paid_amount: toAmount(amount), paid_date: date }, true);
    if (done) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <li className="px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-[160px] flex-1">
          <span className="font-semibold text-slate-900">{item.member_name}</span>
          <span className="ml-2 text-xs text-slate-500">지분 {formatPercent(item.ownership_ratio, 2)}</span>
          {item.member_type === "gp" && <span className="ml-2 text-xs text-slate-400">GP는 통지하지 않음</span>}
        </div>
        <div className="text-right text-sm tabular-nums">
          <p>
            요청 <b>{formatKRWFull(item.call_amount)}</b>
          </p>
          <p className="text-xs text-slate-500">납입 {formatKRWFull(item.paid_amount)}</p>
        </div>
        {item.payment_status && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[item.payment_status]}`}>{PAYMENT_STATUS_LABEL[item.payment_status]}</span>}
        {canPay && remaining > 0 && !open && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
            납입 기록
          </button>
        )}
      </div>
      {open && (
        // 위쪽 기준 정렬: 납입액 아래 "= 00억 원" 안내가 생겨도 입력칸 높이가 어긋나지 않게 한다
        <div className="mt-3 flex flex-wrap items-start gap-2 rounded-xl bg-slate-50 p-3">
          <label className="block w-56">
            <span className="block text-xs leading-4 text-slate-600">납입액 (남은 {formatKRWFull(remaining)})</span>
            <AmountInput value={amount} onChange={setAmount} />
          </label>
          <label className="block w-40">
            <span className="block text-xs leading-4 text-slate-600">납입일</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-5" />
          </label>
          {/* 버튼은 라벨 높이(16px + 간격 4px)만큼 내려 입력칸과 같은 줄에 둔다 */}
          <div className="mt-5 flex items-center gap-2">
            <button type="button" disabled={busy} onClick={pay} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy ? "기록 중…" : "기록"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-1 text-sm text-slate-500 hover:text-slate-700">
              취소
            </button>
          </div>
          <p className="w-full text-xs text-slate-500">납입은 원장에 기록되어 고칠 수 없습니다. 잘못 입력하면 취소 행으로 정정합니다.</p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}
