import Link from "next/link";
import InvestmentForm from "@/components/investment-form";
import PrimaryPurposeMeter from "@/components/primary-purpose-meter";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { SECURITY_TYPE_LABEL } from "@/lib/labels";
import { getInvestmentSummary, investmentOptions, listInvestments } from "@/lib/services/investments";

export default async function InvestmentsPage(props: PageProps<"/funds/[fundId]/investments">) {
  const { fundId } = await props.params;
  const [summary, investments, options] = await Promise.all([getInvestmentSummary(fundId), listInvestments(fundId), investmentOptions(fundId)]);
  const operating = summary.fund_status === "operating";

  const cards: [string, number, string][] = [
    ["투자 가능 잔액", summary.investable_amount, "약정 − 투자 − 관리보수 − 기타 비용"],
    ["현금및현금성자산", summary.cash_amount, "투자 집행에 쓸 수 있는 현금"],
    ["투자자산 취득 누계", summary.total_invested_amount, `${investments.length}건`],
    ["약정 총액", summary.total_commitment_amount, summary.investment_period_end_date ? `투자 기간 ~${formatDate(summary.investment_period_end_date)}` : "결성 전"],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900" title={formatKRWFull(value)}>
              {formatKRW(value)}
            </dd>
            <p className="text-[11px] text-slate-400">{note}</p>
          </div>
        ))}
      </dl>

      {summary.formation_date && <PrimaryPurposeMeter summary={summary} />}

      {operating ? (
        <InvestmentForm
          fundId={fundId}
          deals={options.deals}
          holdings={options.holdings}
          inInvestmentPeriod={summary.in_investment_period}
          investable={summary.investable_amount}
          cash={summary.cash_amount}
        />
      ) : (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          투자는 운용 중인 조합에서만 집행할 수 있습니다. 조합을 결성하고 등록을 마친 뒤 개요 탭에서 운용을 시작하세요.
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">투자 집행 내역 {investments.length}건</h2>
        {investments.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 집행한 투자가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">투자일</th>
                  <th className="px-3 py-2.5">기업</th>
                  <th className="px-3 py-2.5">구분</th>
                  <th className="px-3 py-2.5">투자 형태</th>
                  <th className="px-3 py-2.5 text-right">주식 수 · 주당 가격</th>
                  <th className="px-6 py-2.5 text-right">투자 금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {investments.map((i) => (
                  <tr key={i.id}>
                    <td className="px-6 py-2.5">{formatDate(i.investment_date)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/companies/${i.company_id}`} className="font-medium hover:text-indigo-600">
                        {i.company_name}
                      </Link>
                      {i.is_primary_purpose && <span className="ml-2 rounded bg-emerald-50 px-1.5 text-[11px] text-emerald-700">주목적</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {i.is_follow_on ? "후속" : i.deal_id ? <Link href={`/deals/${i.deal_id}`} className="hover:text-indigo-600">신규 (딜)</Link> : "신규"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{SECURITY_TYPE_LABEL[i.security_type]}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {i.shares ? `${i.shares.toLocaleString("ko-KR")}주` : "-"}
                      {i.price_per_share ? ` · ${i.price_per_share.toLocaleString("ko-KR")}원` : ""}
                    </td>
                    <td className="px-6 py-2.5 text-right font-semibold tabular-nums" title={formatKRWFull(i.investment_amount)}>
                      {formatKRW(i.investment_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
