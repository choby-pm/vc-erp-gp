"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate, formatKRWFull, formatPercent } from "@/lib/format";
import type { FeePreview } from "@/lib/services/management-fees";

// 관리보수 분기 청구: 분기를 고르면 서버가 구간 분할·기준 금액·요율·일수를 계산해 보여준다 (BR-FEE-02~07)

const BASIS_LABEL = { commitment: "약정 총액 기준 (투자 기간)", invested: "투자 잔액 기준 (투자 기간 후)" } as const;

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export default function ManagementFeeForm({ fundId, defaultYear, defaultQuarter }: { fundId: string; defaultYear: number; defaultQuarter: number }) {
  const router = useRouter();
  const [year, setYear] = useState(defaultYear);
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [chargedDate, setChargedDate] = useState(today());
  const [preview, setPreview] = useState<FeePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const res = await fetch(`/api/v1/funds/${fundId}/management-fees/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, quarter }),
        signal: controller.signal,
      }).catch(() => null);
      if (!res) return;
      const json = await res.json().catch(() => ({}));
      setPreview(res.ok ? json.data : null);
      setPreviewError(res.ok ? null : (json.error?.message ?? "계산하지 못했습니다"));
    })();
    return () => controller.abort();
  }, [fundId, year, quarter]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || !window.confirm(`${year}년 ${quarter}분기 관리보수 ${formatKRWFull(preview.total_fee_amount)}을 청구할까요? 조합 현금에서 GP에게 지급됩니다.`)) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/management-fees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ year, quarter, charged_date: chargedDate }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error?.message ?? "청구하지 못했습니다");
      return;
    }
    router.refresh();
  }

  const select = "mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const years = Array.from({ length: 6 }, (_, i) => defaultYear - 4 + i);

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">분기 관리보수 청구</h2>
      <p className="mt-0.5 text-xs text-slate-500">보수 = 기준 금액 × 연 요율 × 일수 ÷ 365 (원 미만 버림). 기준 금액과 요율은 각 구간 시작일 시점 값입니다. ⚠️ 산정 기준은 실무 확인 중입니다 (D16).</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label>
          <span className="text-xs font-medium text-slate-600">연도</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={select}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-medium text-slate-600">분기</span>
          <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={select}>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                {q}분기
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-medium text-slate-600">청구일</span>
          <input type="date" value={chargedDate} max={today()} onChange={(e) => setChargedDate(e.target.value)} className={select} />
        </label>
      </div>

      {previewError && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{previewError}</p>}
      {preview && (
        <>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2">기간</th>
                <th className="py-2">산정 기준</th>
                <th className="py-2 text-right">기준 금액</th>
                <th className="py-2 text-right">요율</th>
                <th className="py-2 text-right">일수</th>
                <th className="py-2 text-right">보수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.segments.map((s) => (
                <tr key={s.period_start}>
                  <td className="py-2">
                    {formatDate(s.period_start)} ~ {formatDate(s.period_end)}
                  </td>
                  <td className="py-2 text-slate-600">
                    {BASIS_LABEL[s.fee_basis]} <span className="text-xs text-slate-400">규약 v{s.terms_version}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatKRWFull(s.basis_amount)}</td>
                  <td className="py-2 text-right tabular-nums">연 {formatPercent(s.fee_rate)}</td>
                  <td className="py-2 text-right tabular-nums">{s.days}일</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatKRWFull(s.fee_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200">
              <tr>
                <td colSpan={5} className="py-2 font-semibold">
                  합계 {preview.segments.length > 1 && <span className="text-xs font-normal text-slate-500">(투자 기간 종료일에 걸쳐 두 구간으로 나눔)</span>}
                </td>
                <td className="py-2 text-right font-bold tabular-nums">{formatKRWFull(preview.total_fee_amount)}</td>
              </tr>
            </tfoot>
          </table>
          {!preview.enough_cash && (
            <p className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
              현금 잔액 {formatKRWFull(preview.cash_amount)}이 부족합니다. 캐피탈콜로 먼저 자금을 확보하세요 (BR-FEE-06).
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={saving || !preview || !preview.enough_cash || preview.total_fee_amount === 0}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? "청구 중…" : "청구"}
        </button>
      </div>
    </form>
  );
}
