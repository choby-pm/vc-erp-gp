import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import type { FundStatus } from "@/lib/labels";
import { recordEvent } from "@/lib/services/events";

// 정기 보고 서비스 (BR-RPT-01~05)
// · 초안(draft): 조회할 때마다 보고 기간 종료일 기준 숫자를 다시 계산한다
// · 발행(published): 그 순간의 숫자를 snapshot 에 얼려 저장하고 잠근다. LP 조합원 전원에게 report 통지
// · 발행본은 고치지 않는다. 틀리면 같은 기간의 정정 보고서를 새로 발행한다
// · 투자·평가·관리보수 원본은 LP에게 공개하지 않고(🟡·🔴), 이 스냅샷의 요약 숫자로만 공개한다

export type PeriodType = "monthly" | "quarterly" | "semiannual" | "annual";

export type ReportSnapshot = {
  as_of: string; // 기준일 = 보고 기간 종료일
  period: { start: string; end: string };
  totals: {
    commitment_amount: number; // 약정 총액
    paid_amount: number; // 누적 납입
    paid_ratio: number; // 납입률 = 누적 납입 ÷ 약정 총액
    invested_amount: number; // 누적 투자
    invested_balance_amount: number; // 투자 잔액 (투자 − 회수 원금)
    current_value_amount: number; // 보유 기업 평가액 합계
    proceeds_amount: number; // 누적 회수
    distributed_amount: number; // 누적 분배
    fee_amount: number; // 누적 관리보수
    expense_amount?: number; // 누적 기타 비용 (D34 이후 발행분부터)
    cash_amount: number; // 현금 잔액
    primary_purpose_ratio: number; // 주목적 투자 비율
    tvpi: number | null; // 총 가치 배수 (LP 관점) = (분배 + 잔여 가치) ÷ 납입. 잔여 가치 = 평가액 + 현금
  };
  period_flows: { paid_amount: number; invested_amount: number; proceeds_amount: number; distributed_amount: number; fee_amount: number; expense_amount?: number };
  portfolio: { company_name: string; invested_amount: number; current_value_amount: number; status: "holding" | "partially_exited" | "exited" }[];
};

export type ReportListItem = {
  id: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  status: "draft" | "published";
  published_at: Date | null;
  is_correction: boolean; // 같은 기간에 먼저 발행된 보고서가 있는 정정 보고서
  created_at: Date;
};

export type ReportDetail = ReportListItem & {
  gp_comment: string | null;
  snapshot: ReportSnapshot; // 초안이면 지금 계산한 값, 발행본이면 저장된 값
  can_publish: boolean;
  publish_blocked_reason: string | null;
};

const REPORT_STATUSES: FundStatus[] = ["formed", "operating", "dissolved"]; // BR-RPT-01
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 보고서 이름: "2026년 9월 보고", "2026년 3분기 보고", "2026년 상반기 보고", "2026년 연간 보고"
export function periodLabel(type: PeriodType, start: string) {
  const year = start.slice(0, 4);
  const month = Number(start.slice(5, 7));
  if (type === "monthly") return `${year}년 ${month}월 보고`;
  if (type === "quarterly") return `${year}년 ${Math.floor((month - 1) / 3) + 1}분기 보고`;
  if (type === "semiannual") return `${year}년 ${month <= 6 ? "상반기" : "하반기"} 보고`;
  return `${year}년 연간 보고`;
}

// 기간 계산: { 월간·분기·반기·연간, 연도, 순번 } → 시작·종료일
export function periodRange(type: PeriodType, year: number, no: number) {
  const months = type === "monthly" ? 1 : type === "quarterly" ? 3 : type === "semiannual" ? 6 : 12;
  const startMonth = (no - 1) * months + 1;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endMonthNext = startMonth + months;
  const next = endMonthNext > 12 ? `${year + 1}-01-01` : `${year}-${String(endMonthNext).padStart(2, "0")}-01`;
  const end = new Date(Date.parse(`${next}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}

// ─── 기준일 시점 숫자 (BR-RPT-05) ─────────────────────────────────────────

export async function computeSnapshot(tx: typeof sql, fundId: string, start: string, asOf: string): Promise<ReportSnapshot> {
  const [led] = await tx<{ commitment: number; paid: number; distributed: number; period_paid: number; period_distributed: number }[]>`
    select coalesce(sum(amount) filter (where entry_type = 'commitment'), 0)::bigint as commitment,
           coalesce(sum(amount) filter (where entry_type = 'contribution'), 0)::bigint as paid,
           coalesce(sum(amount) filter (where entry_type = 'distribution'), 0)::bigint as distributed,
           coalesce(sum(amount) filter (where entry_type = 'contribution' and entry_date >= ${start}), 0)::bigint as period_paid,
           coalesce(sum(amount) filter (where entry_type = 'distribution' and entry_date >= ${start}), 0)::bigint as period_distributed
    from ledger_entries where fund_id = ${fundId} and entry_date <= ${asOf}
  `;
  const [fee] = await tx<{ total: number; period: number }[]>`
    select coalesce(sum(fee_amount), 0)::bigint as total,
           coalesce(sum(fee_amount) filter (where charged_date >= ${start}), 0)::bigint as period
    from management_fee_charges where fund_id = ${fundId} and charged_date <= ${asOf}
  `;
  // 기타 비용 (D34): 지급일 기준, 취소된 비용 제외
  const [expense] = await tx<{ total: number; period: number }[]>`
    select coalesce(sum(amount), 0)::bigint as total,
           coalesce(sum(amount) filter (where paid_date >= ${start}), 0)::bigint as period
    from fund_expenses where fund_id = ${fundId} and paid_date <= ${asOf} and cancelled_at is null
  `;
  // 기업별: 기준일까지의 투자·회수, 기준일 이전 최신 평가 (v_portfolio 와 같은 규칙을 기준일로 다시 계산, BR-VAL-03)
  const companies = await tx<{ company_name: string; invested: number; primary_invested: number; period_invested: number; proceeds: number; period_proceeds: number; exited_cost: number; latest_value: number | null }[]>`
    with inv as (
      select company_id, sum(investment_amount)::bigint as invested,
             coalesce(sum(investment_amount) filter (where is_primary_purpose), 0)::bigint as primary_invested,
             coalesce(sum(investment_amount) filter (where investment_date >= ${start}), 0)::bigint as period_invested
      from investments where fund_id = ${fundId} and investment_date <= ${asOf} group by company_id
    ), ex as (
      select company_id, sum(proceeds_amount)::bigint as proceeds, sum(cost_basis_amount)::bigint as exited_cost,
             coalesce(sum(proceeds_amount) filter (where exit_date >= ${start}), 0)::bigint as period_proceeds
      from exits where fund_id = ${fundId} and exit_date <= ${asOf} group by company_id
    ), val as (
      select distinct on (company_id) company_id, fair_value_amount
      from valuations where fund_id = ${fundId} and valuation_date <= ${asOf}
      order by company_id, valuation_date desc
    )
    select c.name as company_name, inv.invested, inv.primary_invested, inv.period_invested,
           coalesce(ex.proceeds, 0)::bigint as proceeds, coalesce(ex.period_proceeds, 0)::bigint as period_proceeds,
           coalesce(ex.exited_cost, 0)::bigint as exited_cost, val.fair_value_amount as latest_value
    from inv join companies c on c.id = inv.company_id
    left join ex on ex.company_id = inv.company_id
    left join val on val.company_id = inv.company_id
    order by inv.invested desc
  `;

  const portfolio = companies.map((c) => {
    const remaining = c.invested - c.exited_cost;
    const status = remaining <= 0 ? "exited" : c.exited_cost > 0 ? "partially_exited" : "holding";
    return {
      company_name: c.company_name,
      invested_amount: c.invested,
      current_value_amount: remaining <= 0 ? 0 : (c.latest_value ?? remaining),
      status: status as ReportSnapshot["portfolio"][number]["status"],
    };
  });
  const sum = <K extends keyof (typeof companies)[number]>(k: K) => companies.reduce((s, c) => s + (c[k] as number), 0);
  const invested = sum("invested");
  const proceeds = sum("proceeds");
  const currentValue = portfolio.reduce((s, p) => s + p.current_value_amount, 0);
  const cash = led.paid + proceeds - invested - fee.total - expense.total - led.distributed;

  return {
    as_of: asOf,
    period: { start, end: asOf },
    totals: {
      commitment_amount: led.commitment,
      paid_amount: led.paid,
      paid_ratio: led.commitment > 0 ? led.paid / led.commitment : 0,
      invested_amount: invested,
      invested_balance_amount: invested - sum("exited_cost"),
      current_value_amount: currentValue,
      proceeds_amount: proceeds,
      distributed_amount: led.distributed,
      fee_amount: fee.total,
      expense_amount: expense.total,
      cash_amount: cash,
      primary_purpose_ratio: led.commitment > 0 ? sum("primary_invested") / led.commitment : 0,
      tvpi: led.paid > 0 ? (led.distributed + currentValue + cash) / led.paid : null,
    },
    period_flows: { paid_amount: led.period_paid, invested_amount: sum("period_invested"), proceeds_amount: sum("period_proceeds"), distributed_amount: led.period_distributed, fee_amount: fee.period, expense_amount: expense.period },
    portfolio,
  };
}

// ─── 조회 ──────────────────────────────────────────────────────────────────

const selectReports = (fundId: string) => sql<(ReportListItem & { gp_comment: string | null; snapshot: ReportSnapshot | null })[]>`
  select r.id, r.period_type, r.period_start, r.period_end, r.status, r.gp_comment, r.snapshot, r.created_at,
         (select min(n.sent_at) from notices n where n.source_type = 'report' and n.source_id = r.id) as published_at,
         exists (
           select 1 from reports o where o.fund_id = r.fund_id and o.id <> r.id and o.status = 'published'
             and o.period_start = r.period_start and o.period_end = r.period_end and o.created_at < r.created_at
         ) as is_correction
  from reports r where r.fund_id = ${fundId}
  order by r.period_end desc, r.created_at desc
`;

export async function listReports(fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  const reports: ReportListItem[] = (await selectReports(fundId)).map((r) => ({
    id: r.id,
    period_type: r.period_type,
    period_start: r.period_start,
    period_end: r.period_end,
    status: r.status,
    published_at: r.published_at,
    is_correction: r.is_correction,
    created_at: r.created_at,
  }));
  return { fund_status: fund.status, can_create: REPORT_STATUSES.includes(fund.status), reports };
}

export async function getReport(fundId: string, reportId: string): Promise<ReportDetail> {
  assertUuid(fundId, "조합을");
  assertUuid(reportId, "보고서를");
  const report = (await selectReports(fundId)).find((r) => r.id === reportId);
  if (!report) throw notFound("보고서를");
  // BR-RPT-02: 초안은 조회할 때마다 최신 데이터로 다시 계산한다
  const snapshot = report.status === "published" ? report.snapshot! : await computeSnapshot(sql, fundId, report.period_start, report.period_end);
  const blocked = report.status === "published" ? "이미 발행된 보고서입니다" : report.period_end > today() ? `보고 기간이 끝난 뒤(${formatDate(report.period_end)} 이후)에 발행할 수 있습니다` : null;
  return { ...report, snapshot, can_publish: blocked === null, publish_blocked_reason: blocked };
}

// ─── 작성·수정·발행 ────────────────────────────────────────────────────────

async function lockFund(tx: typeof sql, fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await tx<{ status: FundStatus; name: string; formation_date: string | null }[]>`
    select status, name, formation_date from funds where id = ${fundId} for update
  `;
  if (!fund) throw notFound("조합을");
  if (!REPORT_STATUSES.includes(fund.status)) throw statusNotAllowed("BR-RPT-01", "정기 보고는 결성 이후에 작성할 수 있습니다");
  return fund;
}

export async function createReport(fundId: string, input: { period_type: PeriodType; year: number; period_no: number; gp_comment: string | null }, userId: string) {
  return sql.begin(async (tx) => {
    const fund = await lockFund(tx as unknown as typeof sql, fundId);
    const max = input.period_type === "monthly" ? 12 : input.period_type === "quarterly" ? 4 : input.period_type === "semiannual" ? 2 : 1;
    if (input.period_no < 1 || input.period_no > max) throw new AppError(400, "VALIDATION_ERROR", "기간 순번을 확인하세요", undefined, { fields: { period_no: `1~${max} 중에서 고르세요` } });
    const { start, end } = periodRange(input.period_type, input.year, input.period_no);
    if (fund.formation_date && end < fund.formation_date) {
      const message = `결성일(${formatDate(fund.formation_date)}) 이전 기간은 보고할 수 없습니다`;
      throw new AppError(422, "INVALID_PERIOD", message, "BR-RPT-01", { fields: { period_no: message } });
    }
    // 같은 기간의 초안은 하나만 (발행된 보고서가 있으면 새 초안은 정정 보고서가 된다)
    const [draft] = await tx`
      select 1 from reports where fund_id = ${fundId} and period_start = ${start} and period_end = ${end} and status = 'draft'
    `;
    if (draft) throw new AppError(409, "REPORT_DRAFT_EXISTS", "같은 기간의 초안이 이미 있습니다. 기존 초안을 이어서 작성하세요", "BR-RPT-02");
    const [created] = await tx<{ id: string }[]>`
      insert into reports (fund_id, period_type, period_start, period_end, gp_comment, created_by)
      values (${fundId}, ${input.period_type}, ${start}, ${end}, ${input.gp_comment}, ${userId})
      returning id
    `;
    return created;
  });
}

async function lockDraft(tx: typeof sql, fundId: string, reportId: string) {
  assertUuid(reportId, "보고서를");
  const [report] = await tx<{ status: string; period_type: PeriodType; period_start: string; period_end: string; gp_comment: string | null }[]>`
    select status, period_type, period_start, period_end, gp_comment from reports where id = ${reportId} and fund_id = ${fundId} for update
  `;
  if (!report) throw notFound("보고서를");
  // BR-RPT-04: 발행본은 고치지 않는다
  if (report.status !== "draft") throw new AppError(409, "DOCUMENT_LOCKED", "발행된 보고서는 고칠 수 없습니다. 같은 기간의 정정 보고서를 새로 작성하세요", "BR-RPT-04");
  return report;
}

export async function updateReportComment(fundId: string, reportId: string, gpComment: string | null) {
  await sql.begin(async (tx) => {
    await lockDraft(tx as unknown as typeof sql, fundId, reportId);
    await tx`update reports set gp_comment = ${gpComment} where id = ${reportId}`;
  });
}

export async function deleteReportDraft(fundId: string, reportId: string) {
  await sql.begin(async (tx) => {
    await lockDraft(tx as unknown as typeof sql, fundId, reportId);
    await tx`delete from reports where id = ${reportId}`;
  });
}

// BR-RPT-03: 스냅샷을 얼려 저장하고 잠근 뒤, LP 조합원 전원에게 통지 + LP별 연동 이벤트 (BR-EVT-01)
export async function publishReport(fundId: string, reportId: string, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await lockFund(t, fundId);
    const report = await lockDraft(t, fundId, reportId);
    if (report.period_end > today()) {
      throw new AppError(422, "REPORT_PERIOD_NOT_ENDED", `보고 기간이 끝난 뒤(${formatDate(report.period_end)} 이후)에 발행할 수 있습니다`, "BR-RPT-03");
    }
    const lps = await tx<{ lp_id: string }[]>`
      select b.lp_id from v_member_balances b where b.fund_id = ${fundId} and b.lp_id is not null and b.commitment_amount > 0
    `;
    if (lps.length === 0) throw new AppError(409, "NO_MEMBERS", "보고서를 받을 LP 조합원이 없습니다", "BR-RPT-03");

    const snapshot = await computeSnapshot(t, fundId, report.period_start, report.period_end);
    await tx`update reports set status = 'published', snapshot = ${tx.json(snapshot as never)} where id = ${reportId}`;

    const [{ corrected }] = await tx<{ corrected: boolean }[]>`
      select exists (select 1 from reports where fund_id = ${fundId} and id <> ${reportId} and status = 'published'
                     and period_start = ${report.period_start} and period_end = ${report.period_end}) as corrected
    `;
    const label = `${periodLabel(report.period_type, report.period_start)} (${formatDate(report.period_start)} ~ ${formatDate(report.period_end)})`;
    const title = `${fund.name} ${label}${corrected ? " [정정]" : ""}`;
    const s = snapshot.totals;
    const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
    const body = [
      `${fund.name}의 ${label}를 발행합니다.${corrected ? " 이전에 발행한 같은 기간 보고서를 정정한 보고서입니다." : ""}`,
      "",
      `· 약정 총액: ${won(s.commitment_amount)} / 누적 납입: ${won(s.paid_amount)}`,
      `· 누적 투자: ${won(s.invested_amount)} / 보유 평가액: ${won(s.current_value_amount)}`,
      `· 누적 회수: ${won(s.proceeds_amount)} / 누적 분배: ${won(s.distributed_amount)}`,
      ...(report.gp_comment ? ["", "[GP 코멘트]", report.gp_comment] : []),
    ].join("\n");
    const [notice] = await tx<{ id: string; sent_at: Date }[]>`
      insert into notices (fund_id, notice_type, title, body, source_type, source_id, status, sent_at, created_by)
      values (${fundId}, 'report', ${title}, ${body}, 'report', ${reportId}, 'sent', now(), ${userId})
      returning id, sent_at
    `;
    for (const { lp_id } of lps) {
      await tx`insert into notice_recipients (notice_id, lp_id) values (${notice.id}, ${lp_id})`;
      await recordEvent(t, {
        event_type: "notice.sent",
        aggregate_type: "notice",
        aggregate_id: notice.id,
        lp_id,
        fund_id: fundId,
        data: { notice_id: notice.id, notice_type: "report", title, sent_at: notice.sent_at, report_id: reportId, period_start: report.period_start, period_end: report.period_end },
      });
    }
  });
}
