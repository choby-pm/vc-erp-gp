import { formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import type { FundraisingSummary } from "@/lib/services/proposals";

// 모집 달성률 막대: 확약 금액 합 ÷ 목표 결성액 (BR-PROP-04). 최소 결성액 위치도 표시한다 (D29)

export default function FundraisingProgress({ summary }: { summary: FundraisingSummary }) {
  const { target_amount: target, committed_amount: committed, min_fund_amount: min } = summary;
  const pct = (v: number) => `${Math.min(100, (v / target) * 100)}%`;
  const belowMin = min !== null && committed < min;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums text-slate-900">{formatPercent(summary.achievement_ratio, 1)}</p>
        <p className="text-sm text-slate-500">
          확약 <b className="text-slate-900" title={formatKRWFull(committed)}>{formatKRW(committed)}</b> / 목표{" "}
          <span title={formatKRWFull(target)}>{formatKRW(target)}</span>
        </p>
      </div>
      <div className="relative mt-3 h-3 rounded-full bg-slate-100">
        <div className={`h-3 rounded-full ${summary.achievement_ratio >= 1 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: pct(committed) }} />
        {min !== null && min < target && (
          <div className="absolute -top-1 h-5 w-0.5 bg-amber-500" style={{ left: pct(min) }} title={`최소 결성액 ${formatKRW(min)}`} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
        <span>
          {min !== null ? (
            <span className={belowMin ? "text-amber-700" : "text-emerald-700"}>
              최소 결성액 {formatKRW(min)} {belowMin ? `까지 ${formatKRW(min - committed)} 남음` : "달성"}
            </span>
          ) : (
            "최소 결성액 기준 확인 필요"
          )}
        </span>
        {summary.pipeline_amount > 0 && <span>제안·검토 중 {formatKRW(summary.pipeline_amount)}</span>}
      </div>
    </div>
  );
}
