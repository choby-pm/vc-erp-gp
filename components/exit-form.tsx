"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRWFull } from "@/lib/format";
import { EXIT_TYPES, EXIT_TYPE_LABEL, type ExitType } from "@/lib/labels";

// 회수 기록 (BR-EXIT-01~06). 회수 금액은 현금으로 들어오고, 처분 원가만큼 투자자산이 줄어든다

type Holding = { company_id: string; company_name: string; remaining_cost_amount: number; first_investment_date: string; current_value_amount: number };
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function ExitForm({ fundId, holdings }: { fundId: string; holdings: Holding[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(holdings[0]?.company_id ?? "");
  const [type, setType] = useState<ExitType>("trade_sale");
  const [date, setDate] = useState(today());
  const [proceeds, setProceeds] = useState("");
  const [full, setFull] = useState(true);
  const [cost, setCost] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const holding = holdings.find((h) => h.company_id === companyId);
  const writeOff = type === "write_off";
  const costAmount = full ? (holding?.remaining_cost_amount ?? 0) : (toAmount(cost) ?? 0);
  const proceedsAmount = writeOff ? 0 : (toAmount(proceeds) ?? 0);
  const gain = proceedsAmount - costAmount;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!holding) return;
    if (!window.confirm(`${holding.company_name} ${EXIT_TYPE_LABEL[type]}\n회수 금액 ${formatKRWFull(proceedsAmount)} · 처분 원가 ${formatKRWFull(costAmount)}\n기록한 회수는 고칠 수 없습니다. 기록할까요?`)) return;
    setBusy(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/exits`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        company_id: companyId,
        exit_type: type,
        exit_date: date,
        proceeds_amount: proceedsAmount,
        full_exit: full,
        cost_basis_amount: full ? null : toAmount(cost),
        memo,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "기록하지 못했습니다");
      return;
    }
    setProceeds("");
    setCost("");
    setMemo("");
    router.refresh();
  }

  const input = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

  if (holdings.length === 0) {
    return <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">회수할 보유 기업이 없습니다. 모든 투자 기업을 회수했습니다.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">회수 기록</h2>
      <p className="mt-0.5 text-xs text-slate-500">매각·상환 대금은 조합 현금으로 들어오고, 처분한 원가만큼 투자자산이 줄어듭니다. 처분손익은 자동으로 분개됩니다.</p>

      <div className="mt-4 grid items-start gap-3 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">기업</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={input("company_id")}>
            {holdings.map((h) => (
              <option key={h.company_id} value={h.company_id}>
                {h.company_name} · 남은 원금 {formatKRWFull(h.remaining_cost_amount)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">회수 형태</span>
          <select value={type} onChange={(e) => setType(e.target.value as ExitType)} className={input("exit_type")}>
            {EXIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXIT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">회수일</span>
          <input type="date" value={date} max={today()} min={holding?.first_investment_date} onChange={(e) => setDate(e.target.value)} className={input("exit_date")} />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">회수 금액 (처분대가)</span>
          {writeOff ? (
            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm text-slate-500">0원 (상각)</p>
          ) : (
            <AmountInput value={proceeds} onChange={setProceeds} invalid={Boolean(errors.proceeds_amount)} />
          )}
        </label>
        <div className="block">
          <span className="text-xs font-medium text-slate-600">처분 원가</span>
          <label className="mt-2.5 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            전량 회수 (남은 원금 전액)
          </label>
        </div>
        {!full && (
          <label className="block">
            <span className="text-xs font-medium text-slate-600">이번에 회수하는 원금</span>
            <AmountInput value={cost} onChange={setCost} invalid={Boolean(errors.cost_basis_amount)} />
          </label>
        )}
        <label className={`block ${full ? "sm:col-span-2" : ""}`}>
          <span className="text-xs font-medium text-slate-600">메모</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 구주 30% 매각, 인수자 ○○" className={input("memo")} />
        </label>
      </div>

      {Object.values(errors)[0] || error ? <p className="mt-3 text-sm text-red-600">{Object.values(errors)[0] ?? error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-600">
          처분 원가 <b className="tabular-nums text-slate-900">{formatKRWFull(costAmount)}</b>
          <span className="mx-2 text-slate-300">|</span>
          {!writeOff && !proceeds ? (
            <span className="text-slate-400">회수 금액을 넣으면 처분손익을 계산합니다</span>
          ) : (
            <>
              {gain >= 0 ? "처분이익" : "처분손실"} <b className={`tabular-nums ${gain >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatKRWFull(Math.abs(gain))}</b>
            </>
          )}
          {costAmount > 0 && (writeOff || proceeds) && (
            <>
              <span className="mx-2 text-slate-300">|</span>
              회수 배수 <b className="tabular-nums text-slate-900">{(proceedsAmount / costAmount).toFixed(2)}x</b>
            </>
          )}
        </span>
        <button type="submit" disabled={busy || (!writeOff && !proceeds) || (!full && !cost)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy ? "기록 중…" : "회수 기록"}
        </button>
      </div>
    </form>
  );
}
