import Link from "next/link";
import { FundLifecycle, FundStatusBadge } from "@/components/fund-status";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { FUND_TYPE_LABEL, GP_TYPE_LABEL } from "@/lib/labels";
import { getFund } from "@/lib/services/funds";
import { loadOrNotFound } from "@/lib/page-helpers";

export default async function FundDetailPage(props: PageProps<"/funds/[fundId]">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const t = fund.terms;

  const basic: [string, React.ReactNode][] = [
    ["조합 유형", FUND_TYPE_LABEL[fund.fund_type]],
    ["결성 주체", GP_TYPE_LABEL[fund.gp_type]],
    ["목표 결성액", <span key="t" title={formatKRWFull(fund.target_amount)}>{formatKRW(fund.target_amount)}</span>],
    [
      "최소 결성액",
      fund.minimum.minFundAmount !== null ? (
        formatKRW(fund.minimum.minFundAmount)
      ) : (
        <span key="m" className="text-amber-700">기준 확인 필요</span>
      ),
    ],
    ["존속 기간", `${fund.term_years}년`],
    ["투자 기간", `${fund.investment_period_years}년`],
    ["결성일", fund.formation_date ? formatDate(fund.formation_date) : "결성 전"],
    ["만기일", fund.maturity_date ? formatDate(fund.maturity_date) : "결성 후 계산"],
  ];

  const terms: [string, string][] = [
    ["주목적 투자 분야", t.primary_purpose],
    ["1좌 금액", formatKRWFull(t.unit_amount)],
    ["주목적 의무 비율", formatPercent(t.primary_purpose_min_ratio)],
    ["GP 의무 출자 비율", formatPercent(t.gp_commitment_min_ratio)],
    ["관리보수율 (투자 기간)", `연 ${formatPercent(t.management_fee_rate)} · 약정 총액 기준`],
    ["관리보수율 (투자 기간 후)", `연 ${formatPercent(t.management_fee_rate_after)} · 투자 잔액 기준`],
    ["성과보수율", formatPercent(t.carry_rate)],
    ["기준수익률", `연 ${formatPercent(t.hurdle_rate)}`],
    ["총회 가결 기준", `전체 의결권의 ${formatPercent(t.quorum_ratio)} 이상 찬성`],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/funds" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 조합 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{fund.name}</h1>
          <FundStatusBadge status={fund.status} />
          {fund.editable && (
            <Link href={`/funds/${fund.id}/edit`} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              수정
            </Link>
          )}
        </div>
      </div>

      <FundLifecycle status={fund.status} />

      <div className="grid gap-6 lg:grid-cols-2">
        <InfoCard title="기본 정보" rows={basic} />
        <InfoCard
          title={`규약 핵심 조건 · 버전 ${t.version}`}
          note={fund.editable ? "결성 전까지 수정할 수 있습니다" : "결성 이후 변경은 총회 가결이 필요합니다"}
          rows={terms}
        />
      </div>
    </div>
  );
}

function InfoCard({ title, note, rows }: { title: string; note?: string; rows: [string, React.ReactNode][] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      <dl className="mt-4 divide-y divide-slate-100 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
