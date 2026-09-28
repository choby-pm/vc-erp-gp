import ManagementFeeForm from "@/components/management-fee-form";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";
import { listManagementFees } from "@/lib/services/management-fees";

export default async function ManagementFeesPage(props: PageProps<"/funds/[fundId]/management-fees">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const data = await listManagementFees(fundId);

  // 기본 선택: 이번 분기 (한국 시간 기준)
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const thisYear = kst.getFullYear();
  const thisQuarter = Math.floor(kst.getMonth() / 3) + 1;

  const summary: [string, string, string?][] = [
    ["누적 관리보수", formatKRW(data.total_fee_amount), formatKRWFull(data.total_fee_amount)],
    ["현금 잔액", formatKRW(data.cash_amount), formatKRWFull(data.cash_amount)],
    ["결성일", data.formation_date ? formatDate(data.formation_date) : "결성 전"],
    ["투자 기간 종료일", data.investment_period_end_date ? formatDate(data.investment_period_end_date) : "-"],
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        투자 기간 중 약정 총액 × 연 {formatPercent(fund.terms.management_fee_rate)}, 투자 기간 후 투자 잔액 × 연 {formatPercent(fund.terms.management_fee_rate_after)}
      </p>

      <dl className="grid gap-3 sm:grid-cols-4">
        {summary.map(([label, value, title]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900" title={title}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {data.can_charge ? (
        <ManagementFeeForm fundId={fund.id} defaultYear={thisYear} defaultQuarter={thisQuarter} />
      ) : (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">관리보수는 조합을 결성한 뒤에 청구할 수 있습니다.</p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">청구 이력 {data.charges.length}건</h2>
        {data.charges.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 청구한 관리보수가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">기간</th>
                  <th className="px-3 py-2.5">기준</th>
                  <th className="px-3 py-2.5 text-right">기준 금액</th>
                  <th className="px-3 py-2.5 text-right">요율</th>
                  <th className="px-3 py-2.5 text-right">보수</th>
                  <th className="px-6 py-2.5 text-right">청구일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.charges.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-2.5">
                      {formatDate(c.period_start)} ~ {formatDate(c.period_end)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{c.fee_basis === "commitment" ? "약정 총액" : "투자 잔액"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatKRW(c.basis_amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">연 {formatPercent(c.fee_rate)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums" title={formatKRWFull(c.fee_amount)}>
                      {formatKRWFull(c.fee_amount)}
                    </td>
                    <td className="px-6 py-2.5 text-right text-slate-500">{formatDate(c.charged_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-slate-500">관리보수 청구 원본은 LP에게 공개하지 않고, 정기 보고의 요약 숫자로만 공개합니다 (03 DB 설계 7장 ⚠️).</p>
    </div>
  );
}
