"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatDate, formatKRWFull } from "@/lib/format";
import { EXPENSE_TYPES, EXPENSE_TYPE_LABEL, type ExpenseType } from "@/lib/labels";
import type { Expense } from "@/lib/services/finance";

// 기타 비용 기록·취소 (D34). 비용은 현금과 투자 가능 잔액을 줄인다. 틀리면 지우지 않고 취소한다

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function ExpensePanel({ fundId, expenses, canRecord, cash }: { fundId: string; expenses: Expense[]; canRecord: boolean; cash: number }) {
  const router = useRouter();
  const [values, setValues] = useState({ expense_type: "audit" as ExpenseType, description: "", payee: "", amount: "", paid_date: today() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = expenses.filter((e) => !e.cancelled_at);
  const total = active.reduce((s, e) => s + e.amount, 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ ...values, amount: toAmount(values.amount) }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "기록하지 못했습니다");
      return;
    }
    setValues({ ...values, description: "", payee: "", amount: "" });
    router.refresh();
  }

  async function cancel(x: Expense) {
    const reason = window.prompt(`${x.description} ${formatKRWFull(x.amount)}\n이 비용을 취소합니다. 취소 사유를 입력하세요.`);
    if (!reason?.trim()) return;
    const res = await fetch(`/api/v1/funds/${fundId}/expenses/${x.id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) window.alert(json.error?.message ?? "취소하지 못했습니다");
    router.refresh();
  }

  const input = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">기타 비용 · 누적 {formatKRWFull(total)}</h2>
        <p className="mt-0.5 text-xs text-slate-500">관리보수 외에 조합 재산에서 나가는 비용 (회계감사·수탁·사무관리 보수, 설립 비용 등). 현금 잔액과 투자 가능 잔액에서 빠집니다.</p>
      </div>

      {canRecord ? (
        <form onSubmit={onSubmit} className="border-b border-slate-100 px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-6">
            <label className="block sm:col-span-1">
              <span className="text-xs font-medium text-slate-600">종류</span>
              <select value={values.expense_type} onChange={(e) => setValues({ ...values, expense_type: e.target.value as ExpenseType })} className={input("expense_type")}>
                {EXPENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EXPENSE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">내용</span>
              <input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="예: 2026 사업연도 회계감사 수수료" required className={input("description")} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">지급처</span>
              <input value={values.payee} onChange={(e) => setValues({ ...values, payee: e.target.value })} className={input("payee")} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">금액 (원)</span>
              <AmountInput value={values.amount} onChange={(v) => setValues({ ...values, amount: v })} invalid={Boolean(errors.amount)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">지급일</span>
              <input type="date" value={values.paid_date} max={today()} onChange={(e) => setValues({ ...values, paid_date: e.target.value })} className={input("paid_date")} />
            </label>
          </div>
          {(error || errors.amount) && <p className="mt-2 text-sm text-red-600">{errors.amount ?? error}</p>}
          <div className="mt-3 flex items-center justify-end gap-3">
            <span className="text-xs text-slate-500">현금 잔액 {formatKRWFull(cash)}</span>
            <button type="submit" disabled={busy || !values.amount} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "기록 중…" : "비용 기록"}
            </button>
          </div>
        </form>
      ) : (
        <p className="border-b border-slate-100 px-6 py-3 text-sm text-slate-500">기타 비용은 조합을 결성한 뒤에 기록합니다.</p>
      )}

      {expenses.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-slate-500">기록한 비용이 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {expenses.map((x) => (
              <tr key={x.id} className={x.cancelled_at ? "text-slate-400" : ""}>
                <td className="px-6 py-2.5">{formatDate(x.paid_date)}</td>
                <td className="px-3 py-2.5">{EXPENSE_TYPE_LABEL[x.expense_type]}</td>
                <td className="px-3 py-2.5">
                  <span className={x.cancelled_at ? "line-through" : ""}>{x.description}</span>
                  {x.payee && <span className="ml-2 text-xs text-slate-500">{x.payee}</span>}
                  {x.cancelled_at && <span className="ml-2 text-xs text-rose-600">취소 · {x.cancel_reason}</span>}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${x.cancelled_at ? "line-through" : ""}`}>{formatKRWFull(x.amount)}</td>
                <td className="px-6 py-2.5 text-right">
                  {!x.cancelled_at && (
                    <button type="button" onClick={() => cancel(x)} className="text-xs text-slate-400 hover:text-rose-600">
                      취소
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
