"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW } from "@/lib/format";

// 기업가치 평가 기록 (BR-VAL-01~03). 보유 중인 기업만 고를 수 있다

type Holding = { company_id: string; company_name: string; remaining_cost_amount: number; current_value_amount: number };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function ValuationForm({ fundId, holdings }: { fundId: string; holdings: Holding[] }) {
  const router = useRouter();
  const [values, setValues] = useState({ company_id: "", date: today(), amount: "", method: "최근 투자 단가" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = holdings.find((h) => h.company_id === values.company_id);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/valuations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: values.company_id, valuation_date: values.date, fair_value_amount: toAmount(values.amount), method: values.method }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "기록하지 못했습니다");
      return;
    }
    setValues({ company_id: "", date: today(), amount: "", method: "최근 투자 단가" });
    router.refresh();
  }

  const input = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">기업가치 평가 기록</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">보유 기업</span>
          <select value={values.company_id} onChange={(e) => setValues({ ...values, company_id: e.target.value })} required className={input("company_id")}>
            <option value="">기업을 선택하세요</option>
            {holdings.map((h) => (
              <option key={h.company_id} value={h.company_id}>
                {h.company_name}
              </option>
            ))}
          </select>
          {selected && <p className="mt-1 text-xs text-slate-500">남은 원금 {formatKRW(selected.remaining_cost_amount)} · 현재 평가액 {formatKRW(selected.current_value_amount)}</p>}
          {errors.company_id && <p className="mt-1 text-xs text-red-600">{errors.company_id}</p>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">평가 기준일</span>
          <input type="date" value={values.date} max={today()} onChange={(e) => setValues({ ...values, date: e.target.value })} className={input("valuation_date")} />
          {errors.valuation_date && <p className="mt-1 text-xs text-red-600">{errors.valuation_date}</p>}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">평가 방법</span>
          <input value={values.method} onChange={(e) => setValues({ ...values, method: e.target.value })} className={input("method")} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">평가액 (이 조합 보유분, 원)</span>
          <AmountInput value={values.amount} onChange={(v) => setValues({ ...values, amount: v })} invalid={Boolean(errors.fair_value_amount)} />
          {errors.fair_value_amount && <p className="mt-1 text-xs text-red-600">{errors.fair_value_amount}</p>}
        </label>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving || !values.amount} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "기록 중…" : "평가 기록"}
        </button>
      </div>
    </form>
  );
}
