import { formatKRW, formatPercent } from "@/lib/format";
import type { FundInvestmentSummary } from "@/lib/services/investments";

// 의무투자 모니터링: 주목적 투자 비율 막대 + 경고 (BR-INV-06)

export default function PrimaryPurposeMeter({ summary: s }: { summary: FundInvestmentSummary }) {
  const pct = (v: number) => `${Math.min(100, v * 100)}%`;
  const met = s.primary_purpose_ratio >= s.primary_purpose_min_ratio;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">의무투자 모니터링</h2>
        <p className="text-sm text-slate-500">
          주목적 투자 <b className="text-slate-900">{formatKRW(s.primary_purpose_amount)}</b> ÷ 약정 총액 {formatKRW(s.total_commitment_amount)}
        </p>
      </div>
      <div className="relative mt-4 h-3 rounded-full bg-slate-100">
        <div className={`h-3 rounded-full ${met ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: pct(s.primary_purpose_ratio) }} />
        <div className="absolute -top-1 h-5 w-0.5 bg-slate-900" style={{ left: pct(s.primary_purpose_min_ratio) }} title="의무 비율" />
      </div>
      <p className="mt-2 text-sm">
        <b className={met ? "text-emerald-700" : "text-amber-700"}>{formatPercent(s.primary_purpose_ratio, 1)}</b>
        <span className="text-slate-500"> / 의무 비율 {formatPercent(s.primary_purpose_min_ratio)} {met ? "충족" : "미달"}</span>
      </p>
      {s.warnings.map((w) => (
        <p key={w.message} className={`mt-3 rounded-lg px-4 py-3 text-sm ${w.level === "shortfall" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
          {w.level === "shortfall" ? "🔴 미달" : "🟡 주의"} · {w.message}
        </p>
      ))}
      <p className="mt-3 text-xs text-slate-500">⚠️ 주목적 비율의 분모(약정 총액 vs 투자 총액)와 산정 시점은 조합 규약마다 다를 수 있습니다. 경고만 하고 투자를 막지는 않습니다.</p>
    </section>
  );
}
