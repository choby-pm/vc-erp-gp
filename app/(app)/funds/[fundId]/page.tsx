import Link from "next/link";
import FundManagersPanel from "@/components/fund-managers-panel";
import { FundLifecycle } from "@/components/fund-status";
import FundNextStep from "@/components/fund-next-step";
import { InstitutionsPanel, RegistrationPanel } from "@/components/fund-registration-panel";
import FundraisingProgress from "@/components/fundraising-progress";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { FUND_TYPE_LABEL, GP_TYPE_LABEL } from "@/lib/labels";
import { listFundManagers } from "@/lib/services/fund-managers";
import { SUPPORTED_NEXT, checkTransition } from "@/lib/services/fund-transitions";
import { getFund } from "@/lib/services/funds";
import { listInstitutions } from "@/lib/services/institutions";
import { getInvestmentSummary } from "@/lib/services/investments";
import { listProposals } from "@/lib/services/proposals";
import { listPassedAgendas } from "@/lib/services/terms";
import { listStaff } from "@/lib/services/staff";
import { loadOrNotFound } from "@/lib/page-helpers";

export default async function FundDetailPage(props: PageProps<"/funds/[fundId]">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const next = SUPPORTED_NEXT[fund.status];
  const [managers, staff, proposals, institutions, check, investment, managerAgendas] = await Promise.all([
    listFundManagers(fundId),
    listStaff("active"),
    listProposals(fundId),
    listInstitutions(fundId),
    next ? checkTransition(fundId, next) : null,
    getInvestmentSummary(fundId),
    listPassedAgendas(fundId, "manager_change"),
  ]);
  const formed = fund.formation_date !== null;
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
    ["투자 기간 종료일", fund.investment_period_end_date ? formatDate(fund.investment_period_end_date) : "결성 후 계산"],
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
      <FundLifecycle status={fund.status} />

      {/* 의무투자 경고 (BR-INV-06): 차단하지 않고 대시보드에 알린다 */}
      {investment.warnings.map((w) => (
        <Link
          key={w.message}
          href={`/funds/${fund.id}/investments`}
          className={`block rounded-lg px-4 py-3 text-sm ${w.level === "shortfall" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}
        >
          {w.level === "shortfall" ? "🔴 의무투자 미달" : "🟡 의무투자 주의"} · {w.message} →
        </Link>
      ))}

      {check && <FundNextStep fundId={fund.id} check={check} />}

      {fund.status !== "planning" || proposals.items.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">모집 현황</h2>
            <p className="text-sm text-slate-500">
              출자 제안 {proposals.items.length}건
              {fund.total_commitment_amount > 0 && ` · 약정 총액 ${formatKRW(fund.total_commitment_amount)}`}
              {fund.total_paid_amount > 0 && ` · 납입 ${formatKRW(fund.total_paid_amount)}`}
            </p>
          </div>
          <div className="mt-4">
            <FundraisingProgress summary={proposals.summary} />
          </div>
        </section>
      ) : (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-4 text-sm text-slate-600">
          <span>조건을 확정했다면 출자자에게 보낼 제안을 미리 작성해 두세요. 발송은 모집을 시작한 뒤에 할 수 있습니다.</span>
          <Link href={`/funds/${fund.id}/proposals`} className="font-semibold text-indigo-600 hover:underline">
            출자 제안 작성 →
          </Link>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <InfoCard title="기본 정보" rows={basic} />
        <InfoCard
          title={`규약 핵심 조건 · 버전 ${t.version}`}
          note={
            fund.editable
              ? "결성 전까지 수정할 수 있습니다"
              : fund.scheduled_terms
                ? `오늘 적용 중인 버전입니다. 버전 ${fund.scheduled_terms.version}이(가) ${formatDate(fund.scheduled_terms.effective_date)}부터 적용됩니다`
                : "오늘 적용 중인 버전입니다. 변경은 규약 탭에서 총회 가결 안건을 근거로 합니다"
          }
          rows={terms}
        />
      </div>

      <FundManagersPanel
        fundId={fund.id}
        managers={managers}
        staffOptions={staff.map(({ id, name, position }) => ({ id, name, position }))}
        agendas={managerAgendas}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {formed && (
          <RegistrationPanel
            fundId={fund.id}
            editable={fund.status === "formed"}
            applied={fund.registration_applied_date}
            completed={fund.registration_completed_date}
          />
        )}
        <InstitutionsPanel fundId={fund.id} institutions={institutions} editable={fund.status !== "liquidated"} />
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
