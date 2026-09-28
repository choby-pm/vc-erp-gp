"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AmountInput, { toAmount } from "@/components/amount-input";
import WaterfallTable from "@/components/waterfall-table";
import { formatDate, formatKRWFull, formatPercent } from "@/lib/format";
import type { Waterfall } from "@/lib/services/distributions";

// 분배 초안 만들기: 분배일·금액을 넣고 워터폴을 계산해 본 뒤 초안으로 저장한다 (BR-DIST-01~04)
// 최종 분배는 해산 후, 현금 잔액 전부 (BR-DIST-03)

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function DistributionForm({ fundId, cash, canFinal }: { fundId: string; cash: number; canFinal: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [memo, setMemo] = useState("");
  const [preview, setPreview] = useState<Waterfall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const body = () => JSON.stringify({ distribution_date: date, distributable_amount: toAmount(isFinal ? String(cash) : amount), is_final: isFinal, memo });

  async function calc() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/distributions/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body() });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setPreview(null);
      setError(Object.values(json.error?.details?.fields ?? {})[0] as string ?? json.error?.message ?? "계산하지 못했습니다");
      return;
    }
    setPreview(json.data);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/distributions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body() });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "만들지 못했습니다");
      return;
    }
    router.push(`/funds/${fundId}/distributions/${json.data.id}`);
    router.refresh();
  }

  const reset = () => setPreview(null); // 입력이 바뀌면 다시 계산해야 저장할 수 있다
  const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">분배 만들기</h2>
      <p className="mt-0.5 text-xs text-slate-500">분배할 금액을 넣으면 원금 반환 → 기준수익 → 초과수익·성과보수 순서로 조합원별 분배액을 계산합니다. 초안 → 확정(LP 통지) → 지급(원장·분개) 순서로 진행합니다.</p>

      <div className="mt-4 grid items-start gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">분배일 (지급 예정일)</span>
          <input type="date" value={date} onChange={(e) => (setDate(e.target.value), reset())} className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">분배 금액</span>
          {isFinal ? (
            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm tabular-nums text-slate-700">{formatKRWFull(cash)}</p>
          ) : (
            <AmountInput value={amount} onChange={(v) => (setAmount(v), reset())} />
          )}
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">메모</span>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 에듀스페이스 구주 매각 대금 분배" className={input} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-slate-500">현금 잔액 {formatKRWFull(cash)}</span>
          {canFinal && (
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" checked={isFinal} onChange={(e) => (setIsFinal(e.target.checked), reset())} className="h-4 w-4 rounded border-slate-300" />
              최종 분배 (현금 잔액 전부, 청산 전 마지막 분배)
            </label>
          )}
        </div>
        <button type="button" onClick={calc} disabled={busy || (!isFinal && !amount)} className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
          {busy && !preview ? "계산 중…" : "워터폴 계산"}
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {preview && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            {[
              ["누적 납입액 (원금 한도)", formatKRWFull(preview.cumulative.paid_in_amount)],
              [`기준수익 (연 ${formatPercent(preview.rates.hurdle_rate)}, ${formatDate(preview.distribution_date)}까지)`, formatKRWFull(preview.cumulative.hurdle_amount)],
              ["이전 분배 누계", formatKRWFull(preview.cumulative.previously_distributed_amount)],
              [`성과보수율 (규약 버전 ${preview.rates.terms_version})`, formatPercent(preview.rates.carry_rate)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-[11px] text-slate-500">{k}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          <WaterfallTable tiers={preview.tiers} members={preview.members} />
          <p className="text-xs text-amber-700">⚠️ 단순화한 계산입니다: {preview.simplifications.join(" · ")}</p>
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? "저장 중…" : "이 계산으로 초안 만들기"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
