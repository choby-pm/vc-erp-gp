"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import type { CallPreview } from "@/lib/services/capital-calls";

// 캐피탈콜 초안 작성: 입력할 때마다 서버 미리보기로 조합원별 배분(원 미만 버림 + 나머지 1원 처리)을 보여준다

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const plusDays = (d: string, n: number) => {
  const date = new Date(`${d}T00:00:00`);
  date.setDate(date.getDate() + n);
  return date.toLocaleDateString("sv-SE");
};

export default function CapitalCallForm({ fundId, isInitial }: { fundId: string; isInitial: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [all, setAll] = useState(false);
  const [callDate, setCallDate] = useState(today());
  const [dueDate, setDueDate] = useState(plusDays(today(), 14));
  const [purpose, setPurpose] = useState(isInitial ? "최초 납입" : "");
  const [preview, setPreview] = useState<CallPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = { total_call_amount: all ? null : toAmount(amount), call_all_unfunded: all, call_date: callDate, due_date: dueDate, purpose };
  const ready = (all || toAmount(amount) !== null) && callDate && dueDate;

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/v1/funds/${fundId}/capital-calls/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).catch(() => null);
      if (!res) return;
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setPreview(json.data);
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(Object.values((json.error?.details?.fields ?? {}) as Record<string, string>)[0] ?? json.error?.message ?? null);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 입력값이 바뀔 때만 다시 계산
  }, [amount, all, callDate, dueDate, fundId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/capital-calls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error?.message ?? "만들지 못했습니다");
      return;
    }
    router.push(`/funds/${fundId}/capital-calls/${json.data.id}`);
    router.refresh();
  }

  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">{isInitial ? "최초 납입 요청" : "캐피탈콜 작성"}</h2>
      <p className="mt-0.5 text-xs text-slate-500">초안으로 저장한 뒤 확인하고 발송합니다. 조합원별 요청액은 약정 비율로 자동 계산됩니다.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">전체 요청액 (원)</span>
          {all ? <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">조합원별 잔여 약정 전액</p> : <AmountInput value={amount} onChange={setAmount} placeholder="1,000,000,000" />}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            잔여 약정 전액 요청 (마지막 캐피탈콜)
          </label>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">요청일</span>
          <input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} required className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">납입 기한</span>
          <input type="date" value={dueDate} min={callDate} onChange={(e) => setDueDate(e.target.value)} required className={input} />
        </label>
        <label className="block sm:col-span-4">
          <span className="text-xs font-medium text-slate-600">용도 (선택, LP 통지에 표시)</span>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 투자 재원 및 관리보수" className={input} />
        </label>
      </div>

      {previewError && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{previewError}</p>}
      {preview && ready && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-2">조합원</th>
              <th className="py-2 text-right">지분율</th>
              <th className="py-2 text-right">요청액</th>
              <th className="py-2 text-right">요청 후 잔여 약정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {preview.items.map((it) => (
              <tr key={it.member_id}>
                <td className="py-2">
                  {it.member_name}
                  {preview.remainder.assigned_member_id === it.member_id && (
                    <span className="ml-2 text-xs text-slate-500" title="원 미만 버림으로 생긴 나머지를 약정액이 가장 큰 조합원에게 더했습니다 (D13)">
                      +{preview.remainder.amount}원 나머지
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{formatPercent(it.ownership_ratio, 2)}</td>
                <td className="py-2 text-right font-semibold tabular-nums" title={formatKRWFull(it.call_amount)}>
                  {formatKRWFull(it.call_amount)}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-500">{formatKRW(it.unfunded_after)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200">
            <tr>
              <td className="py-2 font-semibold">합계</td>
              <td />
              <td className="py-2 text-right font-bold tabular-nums">{formatKRWFull(preview.total_call_amount)}</td>
              <td className="py-2 text-right text-xs text-slate-500">조합 잔여 약정 {formatKRW(preview.fund_unfunded_amount)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving || !preview} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "저장 중…" : "초안 저장"}
        </button>
      </div>
    </form>
  );
}
