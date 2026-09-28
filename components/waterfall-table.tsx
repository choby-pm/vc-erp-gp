import { formatKRWFull, formatPercent } from "@/lib/format";
import { DISTRIBUTION_COMPONENTS, DISTRIBUTION_COMPONENT_LABEL, type DistributionComponent } from "@/lib/labels";

// 분배 워터폴 표: 단계별 합계 + 조합원 × 단계별 분배액 (미리보기·상세 화면 공통)

type Member = {
  member_id: string;
  member_name: string;
  member_type: "gp" | "lp";
  commitment_amount: number;
  components: Partial<Record<DistributionComponent, number>>;
  total_amount: number;
};

export type WaterfallTableProps = {
  tiers: { component: DistributionComponent; this_amount: number; cap_amount?: number | null; previously_amount?: number }[];
  members: Member[];
};

const TIER_NOTE: Record<DistributionComponent, string> = {
  return_of_capital: "누적 납입액까지, 조합원별 납입액대로",
  hurdle_return: "기준수익(단리)까지, 조합원별 기준수익대로",
  profit: "나머지 중 (1 − 성과보수율), 지분율대로",
  carried_interest: "나머지 중 성과보수율만큼 GP",
};

export default function WaterfallTable({ tiers, members }: WaterfallTableProps) {
  const total = tiers.reduce((s, t) => s + t.this_amount, 0);
  const totalCommitment = members.reduce((s, m) => s + m.commitment_amount, 0);
  const used = DISTRIBUTION_COMPONENTS.filter((c) => members.some((m) => m.components[c]));

  return (
    <div className="space-y-4">
      <ol className="grid gap-2 sm:grid-cols-4">
        {tiers.map((t, i) => (
          <li key={t.component} className={`rounded-xl border px-4 py-3 ${t.this_amount > 0 ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white"}`}>
            <p className="text-xs text-slate-500">
              {i + 1}단계 · {DISTRIBUTION_COMPONENT_LABEL[t.component]}
            </p>
            <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{formatKRWFull(t.this_amount)}</p>
            <p className="text-[11px] text-slate-400">{TIER_NOTE[t.component]}</p>
            {t.cap_amount != null && (
              <p className="mt-1 text-[11px] text-slate-500">
                한도 {formatKRWFull(t.cap_amount)} · 이전 분배 {formatKRWFull(t.previously_amount ?? 0)}
              </p>
            )}
          </li>
        ))}
      </ol>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-2.5">조합원</th>
              <th className="px-3 py-2.5 text-right">지분율</th>
              {used.map((c) => (
                <th key={c} className="px-3 py-2.5 text-right">
                  {DISTRIBUTION_COMPONENT_LABEL[c]}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right">분배액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.member_id}>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {m.member_name}
                  {m.member_type === "gp" && <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">GP</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{totalCommitment ? formatPercent(m.commitment_amount / totalCommitment, 2) : "-"}</td>
                {used.map((c) => (
                  <td key={c} className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {m.components[c] ? formatKRWFull(m.components[c]) : "-"}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatKRWFull(m.total_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
            <tr>
              <td className="px-4 py-2.5" colSpan={2}>
                합계
              </td>
              {used.map((c) => (
                <td key={c} className="px-3 py-2.5 text-right tabular-nums">
                  {formatKRWFull(members.reduce((s, m) => s + (m.components[c] ?? 0), 0))}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right tabular-nums">{formatKRWFull(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
