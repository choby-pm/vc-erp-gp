import Link from "next/link";
import ValuationForm from "@/components/valuation-form";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { getPortfolio, type HoldingStatus } from "@/lib/services/portfolio";

const HOLDING_LABEL: Record<HoldingStatus, string> = { holding: "보유 중", partially_exited: "일부 회수", exited: "전액 회수" };
const HOLDING_COLOR: Record<HoldingStatus, string> = {
  holding: "bg-emerald-100 text-emerald-800",
  partially_exited: "bg-amber-100 text-amber-800",
  exited: "bg-slate-100 text-slate-500",
};

const multiple = (v: number | null) => (v === null ? "-" : `${v.toFixed(2)}x`);

export default async function PortfolioPage(props: PageProps<"/funds/[fundId]/portfolio">) {
  const { fundId } = await props.params;
  const data = await getPortfolio(fundId);
  const t = data.totals;
  const holdings = data.items.filter((i) => i.holding_status !== "exited");

  const cards: [string, string, string?][] = [
    ["투자 기업", `${t.company_count}개`, `보유 중 ${t.holding_count}개`],
    ["투자 원금", formatKRW(t.invested_amount), formatKRWFull(t.invested_amount)],
    ["보유 평가액", formatKRW(t.current_value_amount), `남은 원금 ${formatKRW(t.remaining_cost_amount)}`],
    ["총 가치 배수", multiple(t.total_multiple), "(회수액 + 보유 평가액) ÷ 투자 원금"],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</dd>
            {note && <p className="text-[11px] text-slate-400">{note}</p>}
          </div>
        ))}
      </dl>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">포트폴리오</h2>
          <p className="mt-0.5 text-xs text-slate-500">평가액: 평가 기록이 있으면 최신 평가액, 없으면 남은 원금. 전액 회수된 기업은 0원 (BR-VAL-03)</p>
        </div>
        {data.items.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 투자한 기업이 없습니다. 투자 집행 탭에서 투자를 기록하세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">기업</th>
                  <th className="px-3 py-2.5">상태</th>
                  <th className="px-3 py-2.5 text-right">투자 원금</th>
                  <th className="px-3 py-2.5 text-right">회수액</th>
                  <th className="px-3 py-2.5 text-right">남은 원금</th>
                  <th className="px-3 py-2.5 text-right">평가액</th>
                  <th className="px-6 py-2.5 text-right">평가 배수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((i) => (
                  <tr key={i.company_id} className={i.holding_status === "exited" ? "text-slate-400" : ""}>
                    <td className="px-6 py-2.5">
                      <Link href={`/companies/${i.company_id}`} className="font-medium hover:text-indigo-600">
                        {i.company_name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {i.sector ? `${i.sector} · ` : ""}첫 투자 {formatDate(i.first_investment_date)} · {i.investment_count}건
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${HOLDING_COLOR[i.holding_status]}`}>{HOLDING_LABEL[i.holding_status]}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatKRW(i.invested_amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{i.proceeds_amount ? formatKRW(i.proceeds_amount) : "-"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatKRW(i.remaining_cost_amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatKRW(i.current_value_amount)}
                      <p className="text-[11px] text-slate-400">{i.latest_valuation_date ? `${formatDate(i.latest_valuation_date)} 평가` : "평가 없음 (원금)"}</p>
                    </td>
                    <td className={`px-6 py-2.5 text-right tabular-nums ${i.unrealized_multiple !== null && i.unrealized_multiple < 1 ? "text-rose-600" : ""}`}>
                      {multiple(i.unrealized_multiple)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.can_value && holdings.length > 0 && <ValuationForm fundId={fundId} holdings={holdings} />}

      {data.valuations.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">평가 이력 {data.valuations.length}건</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {data.valuations.map((v) => (
                <tr key={v.id}>
                  <td className="px-6 py-2.5">{formatDate(v.valuation_date)}</td>
                  <td className="px-3 py-2.5 font-medium">{v.company_name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{v.method ?? "-"}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums">{formatKRWFull(v.fair_value_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
