import Link from "next/link";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { DISTRIBUTION_STATUS_LABEL } from "@/lib/labels";
import { getCarrySummary } from "@/lib/services/distributions";

// 재무·회계 > 성과보수 (04 업무 규칙 10, D37)
// 성과보수는 따로 청구하지 않고 분배 워터폴의 3단계(초과수익)에서 GP 몫으로 계산·지급된다.
// 이 화면은 규약 조건, 발생 기준선까지 남은 금액, 지급 내역, 공정가치 기준 예상액을 보여준다

export default async function CarriedInterestPage(props: PageProps<"/funds/[fundId]/carried-interest">) {
  const { fundId } = await props.params;
  const c = await getCarrySummary(fundId);
  const progress = c.threshold_amount > 0 ? Math.min(1, c.distributed_amount / c.threshold_amount) : 0;
  const inCarry = c.threshold_amount > 0 && c.remaining_to_carry_amount === 0;

  const cards: [string, string, string][] = [
    ["성과보수율", formatPercent(c.terms.carry_rate), `규약 버전 ${c.terms.version} · 초과수익 중 GP 몫`],
    ["기준수익률", `연 ${formatPercent(c.terms.hurdle_rate)}`, "단리 · 이 수익까지는 조합원 전원 몫"],
    ["지급한 성과보수", formatKRW(c.carried_paid_amount), c.carried_confirmed_amount ? `확정·지급 대기 ${formatKRW(c.carried_confirmed_amount)}` : "분배 지급 시 GP 조합원 원장에 기록"],
    ["예상 성과보수", formatKRW(c.estimate.carried_interest_amount), "현재 공정가치로 전부 분배한다고 가정"],
  ];

  if (c.fund_status === "planning" || c.fund_status === "fundraising") {
    return (
      <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        성과보수는 조합을 결성하고 운용한 뒤 분배할 때 계산됩니다. 적용될 조건: 성과보수율 {formatPercent(c.terms.carry_rate)}, 기준수익률 연 {formatPercent(c.terms.hurdle_rate)} (규약 버전 {c.terms.version}).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</dd>
            <p className="text-[11px] text-slate-400">{note}</p>
          </div>
        ))}
      </dl>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">성과보수 발생 기준선</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          누적 분배가 <b>누적 납입액 + 기준수익</b>을 넘은 뒤부터 초과수익이 생기고, 그중 성과보수율만큼이 GP 성과보수입니다. ({formatDate(c.as_of)} 기준)
        </p>

        <div className="mt-5">
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${inCarry ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
            <span>
              누적 분배 <b className="tabular-nums text-slate-900">{formatKRWFull(c.distributed_amount)}</b> ({formatPercent(progress, 1)})
            </span>
            <span>
              기준선 <b className="tabular-nums text-slate-900">{formatKRWFull(c.threshold_amount)}</b>
            </span>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-slate-100 text-sm">
          {[
            ["1단계 원금 반환 한도 (누적 납입액)", formatKRWFull(c.paid_in_amount)],
            [`2단계 기준수익 (연 ${formatPercent(c.terms.hurdle_rate)}, 오늘까지)`, formatKRWFull(c.hurdle_amount)],
            ["성과보수 발생 기준선", formatKRWFull(c.threshold_amount)],
            ["누적 분배 (확정·지급)", formatKRWFull(c.distributed_amount)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium tabular-nums text-slate-900">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="font-semibold text-slate-900">성과보수 발생까지 남은 분배액</dt>
            <dd className={`font-semibold tabular-nums ${inCarry ? "text-emerald-700" : "text-slate-900"}`}>{inCarry ? "기준선 초과 · 이후 분배부터 성과보수 발생" : formatKRWFull(c.remaining_to_carry_amount)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">예상 성과보수 (공정가치 기준)</h2>
        <p className="mt-0.5 text-xs text-slate-500">지금 남은 현금과 보유 기업을 현재 공정가치로 모두 회수해 분배한다고 가정한 값입니다.</p>
        <dl className="mt-4 divide-y divide-slate-100 text-sm">
          {[
            ["누적 분배", formatKRWFull(c.distributed_amount)],
            ["+ 현금및현금성자산", formatKRWFull(c.estimate.cash_amount)],
            ["+ 보유 기업 공정가치", formatKRWFull(c.estimate.fair_value_amount)],
            ["= 조합 총 가치", formatKRWFull(c.estimate.total_value_amount)],
            ["− 성과보수 발생 기준선", formatKRWFull(c.threshold_amount)],
            ["= 초과수익", formatKRWFull(c.estimate.excess_amount)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium tabular-nums text-slate-900">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="font-semibold text-slate-900">× 성과보수율 {formatPercent(c.terms.carry_rate)} = 예상 성과보수</dt>
            <dd className="font-semibold tabular-nums text-indigo-700">{formatKRWFull(c.estimate.carried_interest_amount)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-amber-700">⚠️ 앞으로 낼 관리보수·비용과 시간이 지나며 늘어나는 기준수익은 반영하지 않은 추정치입니다. GP 캐치업·클로백은 없는 단순화한 구조입니다.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">분배별 성과보수 내역</h2>
          <Link href={`/funds/${fundId}/distributions`} className="text-sm font-semibold text-indigo-600 hover:underline">
            분배 화면 →
          </Link>
        </div>
        {c.history.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 확정한 분배가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">분배</th>
                  <th className="px-3 py-2.5">분배일</th>
                  <th className="px-3 py-2.5">상태</th>
                  <th className="px-3 py-2.5 text-right">분배 금액</th>
                  <th className="px-3 py-2.5 text-right">초과수익 (조합원)</th>
                  <th className="px-6 py-2.5 text-right">성과보수 (GP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.history.map((h) => (
                  <tr key={h.distribution_id}>
                    <td className="px-6 py-2.5">
                      <Link href={`/funds/${fundId}/distributions/${h.distribution_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {h.is_final ? "최종 분배" : `제${h.distribution_no}차 분배`}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(h.distribution_date)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{DISTRIBUTION_STATUS_LABEL[h.status]}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatKRWFull(h.distributable_amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatKRWFull(h.profit_amount)}</td>
                    <td className="px-6 py-2.5 text-right font-semibold tabular-nums">{formatKRWFull(h.carried_interest_amount)}</td>
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
