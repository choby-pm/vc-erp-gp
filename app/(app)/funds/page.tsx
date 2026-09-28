import Link from "next/link";
import { FundStatusBadge } from "@/components/fund-status";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { FUND_TYPE_LABEL } from "@/lib/labels";
import { listFunds } from "@/lib/services/funds";

export const metadata = { title: "조합 · VC ERP" };

export default async function FundsPage() {
  const funds = await listFunds();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">조합</h1>
          <p className="mt-1 text-sm text-slate-500">운용 중인 조합과 결성을 준비 중인 조합</p>
        </div>
        <Link href="/funds/new" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + 새 조합
        </Link>
      </div>

      {funds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-lg font-semibold text-slate-800">아직 조합이 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">조합을 기획하는 것부터 시작하세요. 규약 핵심 조건도 함께 입력합니다.</p>
          <Link href="/funds/new" className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            첫 조합 만들기
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">조합명</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">목표 결성액</th>
                <th className="px-4 py-3 text-right">약정 총액 (결성 전: 확약)</th>
                <th className="px-4 py-3 text-right">생성일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {funds.map((fund) => (
                <tr key={fund.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/funds/${fund.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                      {fund.name}
                    </Link>
                    <p className="text-xs text-slate-500">{FUND_TYPE_LABEL[fund.fund_type]}</p>
                  </td>
                  <td className="px-4 py-3">
                    <FundStatusBadge status={fund.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" title={formatKRWFull(fund.target_amount)}>
                    {formatKRW(fund.target_amount)}
                  </td>
                  {fund.total_commitment_amount > 0 ? (
                    <td className="px-4 py-3 text-right tabular-nums" title={formatKRWFull(fund.total_commitment_amount)}>
                      {formatKRW(fund.total_commitment_amount)}
                    </td>
                  ) : (
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500" title={formatKRWFull(fund.committed_loc_amount)}>
                      {fund.committed_loc_amount > 0
                        ? `확약 ${formatKRW(fund.committed_loc_amount)} (${formatPercent(fund.committed_loc_amount / fund.target_amount, 0)})`
                        : "결성 전"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-slate-500">{formatDate(fund.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
