"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 정기 보고 초안 만들기: 주기·연도·기간을 고르면 기간 시작·종료일이 정해진다

type PeriodType = "monthly" | "quarterly" | "semiannual" | "annual";
type Period = { year: number; no: number };

const OPTIONS: Record<PeriodType, { label: string; count: number; name: (n: number) => string }> = {
  monthly: { label: "월간", count: 12, name: (n) => `${n}월` },
  quarterly: { label: "분기", count: 4, name: (n) => `${n}분기` },
  semiannual: { label: "반기", count: 2, name: (n) => (n === 1 ? "상반기" : "하반기") },
  annual: { label: "연간", count: 1, name: () => "연간" },
};

// defaults: 주기별 기본 선택 (직전 분기·직전 달). 주기를 바꾸면 그 주기의 기본 기간으로 맞춘다
export default function ReportCreateForm({ fundId, defaults }: { fundId: string; defaults: { quarterly: Period; monthly: Period } }) {
  const defaultYear = defaults.quarterly.year;
  const router = useRouter();
  const [type, setType] = useState<PeriodType>("quarterly");
  const [year, setYear] = useState(defaultYear);
  const [no, setNo] = useState(defaults.quarterly.no);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v1/funds/${fundId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_type: type, year, period_no: no }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error?.message ?? "만들지 못했습니다");
      return;
    }
    router.push(`/funds/${fundId}/reports/${json.data.id}`);
    router.refresh();
  }

  const select = "mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">보고서 작성</h2>
      <p className="mt-0.5 text-xs text-slate-500">초안은 볼 때마다 기간 종료일 기준 최신 숫자로 계산됩니다. 발행하면 그 순간의 숫자가 고정되고 LP에게 통지됩니다.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label>
          <span className="text-xs font-medium text-slate-600">주기</span>
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as PeriodType;
              setType(t);
              const d = t === "monthly" ? defaults.monthly : t === "quarterly" ? defaults.quarterly : { year, no: 1 };
              setYear(d.year);
              setNo(d.no);
            }}
            className={select}
          >
            {(Object.keys(OPTIONS) as PeriodType[]).map((t) => (
              <option key={t} value={t}>
                {OPTIONS[t].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-xs font-medium text-slate-600">연도</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={select}>
            {[defaultYear - 2, defaultYear - 1, defaultYear, defaultYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </label>
        {OPTIONS[type].count > 1 && (
          <label>
            <span className="text-xs font-medium text-slate-600">기간</span>
            <select value={no} onChange={(e) => setNo(Number(e.target.value))} className={select}>
              {Array.from({ length: OPTIONS[type].count }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {OPTIONS[type].name(n)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" disabled={saving} className="mb-0.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? "만드는 중…" : "초안 만들기"}
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    </form>
  );
}
