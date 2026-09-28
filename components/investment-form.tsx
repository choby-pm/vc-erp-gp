"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import { formatKRW, formatKRWFull } from "@/lib/format";
import { SECURITY_TYPES, SECURITY_TYPE_LABEL, type SecurityType } from "@/lib/labels";

// 투자 집행: 신규(투자 확정 딜) / 후속(보유 기업). 서버가 투자 기간·투자 가능 잔액·현금 잔액을 다시 검사한다

type DealOption = { deal_id: string; company_name: string; expected_amount: number | null };
type HoldingOption = { company_id: string; company_name: string; remaining_cost_amount: number };
type Errors = Record<string, string>;

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function InvestmentForm({
  fundId,
  deals,
  holdings,
  inInvestmentPeriod,
  investable,
  cash,
}: {
  fundId: string;
  deals: DealOption[];
  holdings: HoldingOption[];
  inInvestmentPeriod: boolean;
  investable: number;
  cash: number;
}) {
  const router = useRouter();
  const [followOn, setFollowOn] = useState(!inInvestmentPeriod || deals.length === 0);
  const [values, setValues] = useState({ deal_id: "", company_id: "", date: today(), amount: "", security_type: "rcps" as SecurityType, shares: "", price: "", primary: true });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const amount = toAmount(values.amount) ?? 0;
  const limit = Math.min(investable, cash);

  function pickDeal(id: string) {
    const d = deals.find((x) => x.deal_id === id);
    setValues((v) => ({ ...v, deal_id: id, amount: v.amount || (d?.expected_amount ? String(d.expected_amount) : "") }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(`${formatKRWFull(amount)}을 투자 집행할까요? 조합 현금이 줄어들고 되돌릴 수 없습니다.`)) return;
    setSaving(true);
    setErrors({});
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/investments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        is_follow_on: followOn,
        deal_id: followOn ? null : values.deal_id || null,
        company_id: followOn ? values.company_id || null : null,
        investment_date: values.date,
        investment_amount: toAmount(values.amount),
        security_type: values.security_type,
        shares: toAmount(values.shares),
        price_per_share: toAmount(values.price),
        is_primary_purpose: values.primary,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErrors(json.error?.details?.fields ?? {});
      setError(json.error?.message ?? "집행하지 못했습니다");
      return;
    }
    setWarnings((json.data.fund_after.warnings ?? []).map((w: { message: string }) => w.message));
    setValues({ deal_id: "", company_id: "", date: today(), amount: "", security_type: "rcps", shares: "", price: "", primary: true });
    router.refresh();
  }

  const input = (key: string) =>
    `mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${errors[key] ? "border-red-400 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"}`;
  const err = (key: string) => errors[key] && <p className="mt-1 text-xs text-red-600">{errors[key]}</p>;
  const tab = (active: boolean, disabled = false) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? "bg-indigo-600 text-white" : "border border-slate-300 text-slate-700 hover:bg-slate-50"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`;

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">투자 집행</h2>
        <div className="flex gap-2">
          <button type="button" disabled={!inInvestmentPeriod} title={inInvestmentPeriod ? undefined : "투자 기간이 지나 신규 투자를 할 수 없습니다"} onClick={() => setFollowOn(false)} className={tab(!followOn, !inInvestmentPeriod)}>
            신규 투자
          </button>
          <button type="button" onClick={() => setFollowOn(true)} className={tab(followOn)}>
            후속 투자
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {followOn ? (
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">보유 기업</span>
            <select value={values.company_id} onChange={(e) => setValues({ ...values, company_id: e.target.value })} required className={input("company_id")}>
              <option value="">{holdings.length ? "기업을 선택하세요" : "보유 중인 기업이 없습니다"}</option>
              {holdings.map((h) => (
                <option key={h.company_id} value={h.company_id}>
                  {h.company_name} · 남은 원금 {formatKRW(h.remaining_cost_amount)}
                </option>
              ))}
            </select>
            {err("company_id")}
          </label>
        ) : (
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">투자 확정 딜 (이 조합으로 확정된 딜만)</span>
            <select value={values.deal_id} onChange={(e) => pickDeal(e.target.value)} required className={input("deal_id")}>
              <option value="">{deals.length ? "딜을 선택하세요" : "집행할 수 있는 확정 딜이 없습니다"}</option>
              {deals.map((d) => (
                <option key={d.deal_id} value={d.deal_id}>
                  {d.company_name}
                  {d.expected_amount ? ` · 예상 ${formatKRW(d.expected_amount)}` : ""}
                </option>
              ))}
            </select>
            {err("deal_id")}
            {deals.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                <Link href="/deals" className="text-indigo-600 hover:underline">딜 파이프라인</Link>에서 이 조합을 투자 예정 조합으로 정해 투자 확정하세요.
              </p>
            )}
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-slate-600">투자 금액 (원)</span>
          <AmountInput value={values.amount} onChange={(v) => setValues({ ...values, amount: v })} invalid={Boolean(errors.investment_amount)} />
          {err("investment_amount")}
          <p className={`mt-1 text-xs ${amount > limit ? "font-semibold text-rose-600" : "text-slate-500"}`}>
            집행 한도 {formatKRW(limit)} (투자 가능 잔액 {formatKRW(investable)}, 현금 {formatKRW(cash)} 중 작은 값)
          </p>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">투자일</span>
          <input type="date" value={values.date} max={today()} onChange={(e) => setValues({ ...values, date: e.target.value })} className={input("investment_date")} />
          {err("investment_date")}
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">투자 형태</span>
          <select value={values.security_type} onChange={(e) => setValues({ ...values, security_type: e.target.value as SecurityType })} className={input("security_type")}>
            {SECURITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {SECURITY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">주식 수 (선택)</span>
            <input inputMode="numeric" value={values.shares} onChange={(e) => setValues({ ...values, shares: e.target.value.replace(/[^0-9]/g, "") })} className={`${input("shares")} text-right tabular-nums`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">주당 가격 (선택)</span>
            <input inputMode="numeric" value={values.price} onChange={(e) => setValues({ ...values, price: e.target.value.replace(/[^0-9]/g, "") })} className={`${input("price_per_share")} text-right tabular-nums`} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={values.primary} onChange={(e) => setValues({ ...values, primary: e.target.checked })} />
          주목적 투자 분야에 해당 (의무 투자 비율 계산에 포함)
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          집행했습니다. 주의: {w}
        </p>
      ))}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving || amount === 0} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "집행 중…" : "투자 집행"}
        </button>
      </div>
    </form>
  );
}
