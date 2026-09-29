import Link from "next/link";
import DistributionForm from "@/components/distribution-form";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { DISTRIBUTION_STATUS_LABEL, type DistributionStatus } from "@/lib/labels";
import { listDistributions } from "@/lib/services/distributions";

// 투자·회수 > 분배: 분배 만들기(워터폴 계산) + 분배 이력 (04 업무 규칙 10)

const STATUS_COLOR: Record<DistributionStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  confirmed: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-600",
};

export default async function DistributionsPage(props: PageProps<"/funds/[fundId]/distributions">) {
  const { fundId } = await props.params;
  const data = await listDistributions(fundId);
  const allowed = data.fund_status === "operating" || data.fund_status === "dissolved";

  const cards: [string, number, string][] = [
    ["분배 지급 누계", data.totals.paid_amount, `${data.items.filter((d) => d.status === "paid").length}회`],
    ["GP 성과보수 누계", data.totals.carried_interest_amount, "초과수익 중 성과보수율만큼"],
    ["현금및현금성자산", data.cash_amount, "분배할 수 있는 현금"],
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-3">
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

      {!allowed ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">분배는 운용·해산 중인 조합에서 합니다.</p>
      ) : data.open_distribution_id ? (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          진행 중인 분배가 있습니다. 지급을 마치거나 초안을 삭제한 뒤 새 분배를 만들 수 있습니다.{" "}
          <Link href={`/funds/${fundId}/distributions/${data.open_distribution_id}`} className="font-semibold text-indigo-600 hover:underline">
            진행 중인 분배 보기 →
          </Link>
        </p>
      ) : (
        <DistributionForm fundId={fundId} cash={data.cash_amount} canFinal={data.can_final} />
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">분배 이력 {data.items.length}건</h2>
        {data.items.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 분배한 적이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((d) => (
              <li key={d.id}>
                <Link href={`/funds/${fundId}/distributions/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5 hover:bg-slate-50">
                  <span className="font-semibold text-slate-900">{d.is_final ? "최종 분배" : `제${d.distribution_no}차 분배`}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[d.status]}`}>{DISTRIBUTION_STATUS_LABEL[d.status]}</span>
                  <span className="text-sm text-slate-500">{formatDate(d.distribution_date)}</span>
                  {d.memo && <span className="text-sm text-slate-500">{d.memo}</span>}
                  {d.cancel_reason && <span className="text-sm text-rose-600">취소 · {d.cancel_reason}</span>}
                  <span className="ml-auto text-right">
                    <span className={`block font-semibold tabular-nums ${d.status === "cancelled" ? "text-slate-400 line-through" : "text-slate-900"}`}>{formatKRWFull(d.distributable_amount)}</span>
                    {d.carried_interest_amount > 0 && <span className="block text-xs text-slate-500">성과보수 {formatKRWFull(d.carried_interest_amount)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
