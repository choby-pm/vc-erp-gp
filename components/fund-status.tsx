import { FUND_STATUSES, FUND_STATUS_LABEL, type FundStatus } from "@/lib/labels";

const BADGE_COLOR: Record<FundStatus, string> = {
  planning: "bg-slate-100 text-slate-700",
  fundraising: "bg-amber-100 text-amber-800",
  formed: "bg-sky-100 text-sky-800",
  operating: "bg-emerald-100 text-emerald-800",
  dissolved: "bg-rose-100 text-rose-800",
  liquidated: "bg-slate-200 text-slate-500",
};

export function FundStatusBadge({ status }: { status: FundStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_COLOR[status]}`}>
      {FUND_STATUS_LABEL[status]}
    </span>
  );
}

// 조합 생애주기 6단계 중 현재 위치 (01 MVP 범위)
export function FundLifecycle({ status }: { status: FundStatus }) {
  const current = FUND_STATUSES.indexOf(status);
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {FUND_STATUSES.map((s, i) => (
        <li
          key={s}
          className={`rounded-lg border px-3 py-2 text-center text-xs font-medium ${
            i === current
              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
              : i < current
                ? "border-slate-200 bg-white text-slate-500"
                : "border-dashed border-slate-200 text-slate-400"
          }`}
        >
          <span className="block text-[10px] opacity-70">{i + 1}단계</span>
          {FUND_STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}
