import Link from "next/link";
import { FundLifecycle } from "@/components/fund-status";
import FundNextStep from "@/components/fund-next-step";
import FundraisingProgress from "@/components/fundraising-progress";
import { formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { listUnpaidItems } from "@/lib/services/capital-calls";
import { getFinancialStatements } from "@/lib/services/finance";
import { SUPPORTED_NEXT, checkTransition } from "@/lib/services/fund-transitions";
import { getFund } from "@/lib/services/funds";
import { getInvestmentSummary } from "@/lib/services/investments";
import { listMeetings } from "@/lib/services/meetings";
import { listProposals } from "@/lib/services/proposals";
import { listReports } from "@/lib/services/reports";
import { loadOrNotFound } from "@/lib/page-helpers";

// 개요 > 요약: 진행 단계, 다음 할 일, 핵심 숫자, 확인할 일. 상세 정보는 "조합 정보" 탭에 있다

export default async function FundSummaryPage(props: PageProps<"/funds/[fundId]">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const next = SUPPORTED_NEXT[fund.status];
  const [check, investment, statements, proposals, unpaid, meetings, reports] = await Promise.all([
    next ? checkTransition(fundId, next) : null,
    getInvestmentSummary(fundId),
    getFinancialStatements(fundId),
    listProposals(fundId),
    listUnpaidItems(fundId),
    listMeetings(fundId),
    listReports(fundId),
  ]);
  const base = `/funds/${fund.id}`;
  const preFormation = fund.status === "planning" || fund.status === "fundraising";
  const bs = statements.balance_sheet;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const matured = fund.maturity_date !== null && fund.maturity_date <= today;
  // 운용 중에는 해산 조건표를 늘 보여주지 않는다. 해산 안건이 가결됐거나 존속 기간이 지났을 때만 (BR-FUND-07)
  const showNext = check && (fund.status !== "operating" || check.ready || matured);

  // 핵심 숫자 (누르면 해당 화면으로)
  const kpis: { label: string; value: number | null; note: string; href: string }[] = [
    { label: "약정 총액", value: fund.total_commitment_amount, note: fund.total_commitment_amount ? `목표 대비 ${formatPercent(fund.total_commitment_amount / fund.target_amount, 0)}` : "명부 확정 전", href: `${base}/members` },
    { label: "납입 출자금", value: fund.total_paid_amount, note: fund.total_commitment_amount ? `납입률 ${formatPercent(fund.total_paid_amount / fund.total_commitment_amount, 1)}` : "-", href: `${base}/capital-calls` },
    { label: "투자자산 (원가)", value: bs.assets.investments_at_cost, note: `투자 가능 잔액 ${formatKRW(investment.investable_amount)}`, href: `${base}/portfolio` },
    { label: "현금및현금성자산", value: bs.assets.cash, note: "조합 계좌 잔액", href: `${base}/finance` },
    { label: "순자산가치 (NAV)", value: statements.fair_value.net_asset_value, note: "공정가치 기준", href: `${base}/accounting?view=statements` },
  ];

  // 확인할 일 (있는 것만)
  const unpaidTotal = unpaid.reduce((s, u) => s + u.unpaid_amount, 0);
  const overdue = unpaid.filter((u) => u.payment_status === "overdue").length;
  const scheduled = meetings.meetings.filter((m) => m.status === "scheduled");
  const drafts = reports.reports.filter((r) => r.status === "draft");
  const todos: { text: string; href: string; tone: "rose" | "amber" | "slate" }[] = [
    ...investment.warnings.map((w) => ({ text: `${w.level === "shortfall" ? "의무투자 미달" : "의무투자 주의"} · ${w.message}`, href: `${base}/investments`, tone: (w.level === "shortfall" ? "rose" : "amber") as "rose" | "amber" })),
    ...(unpaid.length ? [{ text: `캐피탈콜 미납 ${unpaid.length}건 · ${formatKRW(unpaidTotal)}${overdue ? ` (기한 초과 ${overdue}건)` : ""}`, href: `${base}/capital-calls`, tone: (overdue ? "rose" : "amber") as "rose" | "amber" }] : []),
    ...scheduled.map((m) => ({ text: `예정된 총회 · ${m.meeting_date}${m.convened_at ? "" : " (소집 통지 전)"}`, href: `${base}/meetings/${m.id}`, tone: "slate" as const })),
    ...(drafts.length ? [{ text: `작성 중인 정기 보고 ${drafts.length}건`, href: `${base}/reports`, tone: "slate" as const }] : []),
  ];
  const toneClass = { rose: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-800", slate: "bg-slate-50 text-slate-700" };

  return (
    <div className="space-y-6">
      <FundLifecycle status={fund.status} />

      {matured && fund.status === "operating" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">존속 기간 만기일이 지났습니다. 총회에서 기간을 연장하거나 해산총회를 열어 해산 절차를 시작하세요.</p>
      )}

      {showNext && check && <FundNextStep fundId={fund.id} check={check} />}

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 hover:border-indigo-300">
            <dt className="text-xs text-slate-500">{k.label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900" title={k.value === null ? undefined : formatKRWFull(k.value)}>
              {k.value ? formatKRW(k.value) : "-"}
            </dd>
            <p className="text-[11px] text-slate-400">{k.note}</p>
          </Link>
        ))}
      </dl>

      {todos.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">확인할 일</h2>
          <ul className="mt-3 space-y-2">
            {todos.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className={`block rounded-lg px-4 py-2.5 text-sm hover:opacity-80 ${toneClass[t.tone]}`}>
                  {t.text} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preFormation && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">모집 현황</h2>
            <Link href={`${base}/proposals`} className="text-sm font-semibold text-indigo-600 hover:underline">
              출자 제안 {proposals.items.length}건 →
            </Link>
          </div>
          <div className="mt-4">
            <FundraisingProgress summary={proposals.summary} />
          </div>
        </section>
      )}
    </div>
  );
}
