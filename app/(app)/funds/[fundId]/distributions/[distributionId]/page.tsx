import Link from "next/link";
import DistributionActions from "@/components/distribution-actions";
import WaterfallTable from "@/components/waterfall-table";
import { formatDate, formatKRWFull } from "@/lib/format";
import { DISTRIBUTION_STATUS_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getDistribution } from "@/lib/services/distributions";

// 분배 상세: 조합원 × 단계별 분배액 + 확정·지급 (BR-DIST-04~06)

const STEPS = [
  { key: "draft", label: "초안", note: "워터폴 계산 결과 저장. 삭제할 수 있음" },
  { key: "confirmed", label: "확정", note: "잠금 + LP 조합원에게 분배 통지" },
  { key: "paid", label: "지급", note: "조합원 분배 원장 + 회계 분개" },
] as const;

export default async function DistributionDetailPage(props: PageProps<"/funds/[fundId]/distributions/[distributionId]">) {
  const { fundId, distributionId } = await props.params;
  const d = await loadOrNotFound(() => getDistribution(fundId, distributionId));
  const title = d.is_final ? "최종 분배" : `제${d.distribution_no}차 분배`;
  const step = STEPS.findIndex((s) => s.key === d.status);

  return (
    <div className="space-y-6">
      <Link href={`/funds/${fundId}/distributions`} className="text-sm text-slate-500 hover:text-indigo-600">
        ← 분배 목록
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {title} <span className="ml-1 text-base font-semibold text-slate-500">{DISTRIBUTION_STATUS_LABEL[d.status]}</span>
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              분배일 {formatDate(d.distribution_date)} · 분배 금액 <b className="tabular-nums text-slate-900">{formatKRWFull(d.distributable_amount)}</b>
              {d.memo && <> · {d.memo}</>}
            </p>
          </div>
          <DistributionActions fundId={fundId} distributionId={d.id} status={d.status} amount={d.distributable_amount} date={d.distribution_date} title={title} />
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`rounded-lg border px-3 py-2 text-sm ${i <= step ? "border-indigo-200 bg-indigo-50/50" : "border-slate-200"}`}>
              <span className={`font-semibold ${i <= step ? "text-indigo-700" : "text-slate-400"}`}>
                {i + 1}. {s.label} {i <= step && "✓"}
              </span>
              <span className="block text-xs text-slate-500">
                {s.key === "confirmed" && d.confirmed_at ? `${formatDate(d.confirmed_at)} 확정` : s.key === "paid" && d.paid_at ? `${formatDate(d.distribution_date)} 지급` : s.note}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">조합원별 분배액</h2>
        <WaterfallTable tiers={d.tiers.map((t) => ({ component: t.component, this_amount: t.amount }))} members={d.members} />
        <p className="mt-3 text-xs text-slate-500">
          지급하면 조합원별 합계가 분배 원장에 기록됩니다 (GP 성과보수는 GP 조합원 원장). 회계는 원금 반환분을 <b>출자금반환</b>, 나머지를 <b>이익분배금</b>으로 분개합니다.
        </p>
      </section>
    </div>
  );
}
