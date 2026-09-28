import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate, formatKRWFull, formatPercent } from "@/lib/format";
import type { FundStatus, SecurityType } from "@/lib/labels";
import type { InvestmentInput } from "@/lib/schemas/investment";
import { journalForInvestment } from "@/lib/services/accounting";
import { assertCashAvailable } from "@/lib/services/finance";

// 투자 집행 서비스 (BR-INV-01~06, D14)
// · 신규 투자: 운용 중 + 투자 기간 안 + 이 조합으로 투자 확정된 딜 + 딜당 신규 투자 1건
// · 후속 투자: 운용 중 + 이미 투자했고 전액 회수되지 않은 기업 (투자 기간이 지나도 허용 ⚠️)
// · 두 경우 모두 투자 가능 잔액(약정 − 투자 − 관리보수)과 현금 잔액(납입 + 회수 − 투자 − 관리보수 − 분배)을 넘을 수 없다
// · 투자 내역은 LP에게 원본 대신 정기 보고의 요약 숫자로만 공개한다 (🟡) → 연동 이벤트를 만들지 않는다

export type Investment = {
  id: string;
  company_id: string;
  company_name: string;
  deal_id: string | null;
  investment_date: string;
  investment_amount: number;
  security_type: SecurityType;
  shares: number | null;
  price_per_share: number | null;
  is_follow_on: boolean;
  is_primary_purpose: boolean;
};

export type PrimaryPurposeWarning = { code: "PRIMARY_PURPOSE_BELOW_MIN"; level: "caution" | "shortfall"; message: string };

export type FundInvestmentSummary = {
  fund_status: FundStatus;
  formation_date: string | null;
  investment_period_end_date: string | null;
  in_investment_period: boolean;
  total_commitment_amount: number;
  total_invested_amount: number;
  total_fee_amount: number;
  investable_amount: number; // 약정 − 투자 − 관리보수 (BR-INV-03)
  cash_amount: number; // BR-INV-04
  primary_purpose_amount: number;
  primary_purpose_ratio: number; // 주목적 투자액 ÷ 약정 총액 (BR-INV-06 ⚠️)
  primary_purpose_min_ratio: number;
  warnings: PrimaryPurposeWarning[];
};

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ─── 요약·경고 ─────────────────────────────────────────────────────────────

// BR-INV-06: 투자 기간이 1년 이내로 남았거나 끝났는데 주목적 비율이 의무 비율보다 낮으면 경고 (차단하지 않음)
function primaryPurposeWarnings(s: Omit<FundInvestmentSummary, "warnings">): PrimaryPurposeWarning[] {
  if (!s.investment_period_end_date || s.total_commitment_amount === 0) return [];
  if (s.primary_purpose_ratio >= s.primary_purpose_min_ratio) return [];
  const now = today();
  const ratio = `주목적 투자 비율(${formatPercent(s.primary_purpose_ratio, 1)})이 의무 비율(${formatPercent(s.primary_purpose_min_ratio)})보다 낮습니다`;
  if (now >= s.investment_period_end_date) {
    return [{ code: "PRIMARY_PURPOSE_BELOW_MIN", level: "shortfall", message: `투자 기간이 끝났는데 ${ratio}` }];
  }
  if (now >= addDays(s.investment_period_end_date, -365)) {
    return [{ code: "PRIMARY_PURPOSE_BELOW_MIN", level: "caution", message: `투자 기간이 ${formatDate(s.investment_period_end_date)}에 끝나는데 ${ratio}` }];
  }
  return [];
}

export async function getInvestmentSummary(fundId: string, tx: typeof sql = sql): Promise<FundInvestmentSummary> {
  assertUuid(fundId, "조합을");
  const [row] = await tx<(Omit<FundInvestmentSummary, "warnings" | "in_investment_period" | "primary_purpose_amount" | "primary_purpose_min_ratio" | "primary_purpose_ratio"> & { primary_purpose_ratio: string | null; primary_purpose_min_ratio: string })[]>`
    select f.status as fund_status, f.formation_date, s.investment_period_end_date, s.total_commitment_amount, s.total_invested_amount,
           s.total_fee_amount, s.investable_amount, s.cash_amount, s.primary_purpose_ratio,
           (select t.primary_purpose_min_ratio from fund_terms t where t.fund_id = f.id and t.effective_date <= current_date order by t.version desc limit 1) as primary_purpose_min_ratio
    from funds f join v_fund_summary s on s.fund_id = f.id
    where f.id = ${fundId}
  `;
  if (!row) throw notFound("조합을");
  const [pp] = await tx<{ amount: number }[]>`
    select coalesce(sum(investment_amount), 0)::bigint as amount from investments where fund_id = ${fundId} and is_primary_purpose
  `;
  const now = today();
  const base = {
    ...row,
    in_investment_period: Boolean(row.formation_date && row.investment_period_end_date && now >= row.formation_date && now < row.investment_period_end_date),
    primary_purpose_amount: pp.amount,
    primary_purpose_ratio: Number(row.primary_purpose_ratio ?? 0),
    primary_purpose_min_ratio: Number(row.primary_purpose_min_ratio ?? 0),
  };
  return { ...base, warnings: primaryPurposeWarnings(base) };
}

// ─── 조회 ──────────────────────────────────────────────────────────────────

export async function listInvestments(fundId: string) {
  assertUuid(fundId, "조합을");
  return sql<Investment[]>`
    select i.id, i.company_id, c.name as company_name, i.deal_id, i.investment_date, i.investment_amount, i.security_type,
           i.shares, i.price_per_share, i.is_follow_on, i.is_primary_purpose
    from investments i join companies c on c.id = i.company_id
    where i.fund_id = ${fundId}
    order by i.investment_date desc, i.created_at desc
  `;
}

// 집행 화면의 선택지: 신규 투자할 수 있는 확정 딜, 후속 투자할 수 있는 보유 기업
export async function investmentOptions(fundId: string) {
  assertUuid(fundId, "조합을");
  const deals = await sql<{ deal_id: string; company_id: string; company_name: string; expected_amount: number | null }[]>`
    select d.id as deal_id, d.company_id, c.name as company_name, d.expected_amount
    from deals d join companies c on c.id = d.company_id
    where d.target_fund_id = ${fundId} and d.stage = 'approved'
      and not exists (select 1 from investments i where i.deal_id = d.id and not i.is_follow_on)
    order by c.name
  `;
  const holdings = await sql<{ company_id: string; company_name: string; remaining_cost_amount: number }[]>`
    select company_id, company_name, remaining_cost_amount from v_portfolio
    where fund_id = ${fundId} and holding_status <> 'exited'
    order by company_name
  `;
  return { deals, holdings };
}

// ─── 집행 ──────────────────────────────────────────────────────────────────

const fail = (status: number, code: string, message: string, rule: string, field?: string, details: Record<string, unknown> = {}) =>
  new AppError(status, code, message, rule, { ...details, ...(field ? { fields: { [field]: message } } : {}) });

export async function executeInvestment(fundId: string, input: InvestmentInput, userId: string) {
  assertUuid(fundId, "조합을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`; // BR-COM-02
    if (!fund) throw notFound("조합을");
    if (fund.status !== "operating") throw statusNotAllowed("BR-INV-01", "투자는 운용 중인 조합에서만 집행할 수 있습니다");
    const before = await getInvestmentSummary(fundId, t);

    // BR-INV-05: 결성일 ≤ 투자일 ≤ 오늘
    if (input.investment_date < before.formation_date! || input.investment_date > today()) {
      throw fail(422, "INVALID_DATE", `투자일은 결성일(${formatDate(before.formation_date)})부터 오늘 사이여야 합니다`, "BR-INV-05", "investment_date");
    }

    let companyId: string;
    let dealId: string | null = null;
    if (!input.is_follow_on) {
      // BR-INV-01: 투자 기간 안 + 이 조합으로 투자 확정된 딜 + 딜당 신규 투자 1건
      if (input.investment_date >= before.investment_period_end_date!) {
        throw fail(422, "OUTSIDE_INVESTMENT_PERIOD", `투자 기간(~${formatDate(addDays(before.investment_period_end_date!, -1))})이 지나 신규 투자를 할 수 없습니다. 보유 기업 후속 투자만 가능합니다`, "BR-INV-01", "investment_date");
      }
      if (!input.deal_id) throw fail(422, "DEAL_NOT_APPROVED", "신규 투자는 투자 확정된 딜이 필요합니다", "BR-INV-01", "deal_id");
      const [deal] = await tx<{ company_id: string; stage: string; target_fund_id: string | null }[]>`
        select company_id, stage, target_fund_id from deals where id = ${input.deal_id} for update
      `;
      if (!deal || deal.stage !== "approved") throw fail(422, "DEAL_NOT_APPROVED", "투자 확정된 딜만 투자 집행할 수 있습니다", "BR-INV-01", "deal_id");
      if (deal.target_fund_id !== fundId) throw fail(422, "DEAL_NOT_APPROVED", "이 조합으로 투자 확정된 딜이 아닙니다", "BR-INV-01", "deal_id");
      const [done] = await tx`select 1 from investments where deal_id = ${input.deal_id} and not is_follow_on`;
      if (done) throw fail(409, "DEAL_ALREADY_INVESTED", "이 딜로는 이미 신규 투자를 집행했습니다. 추가 투자는 후속 투자로 기록하세요", "BR-INV-01", "deal_id");
      companyId = deal.company_id;
      dealId = input.deal_id;
    } else {
      // BR-INV-02: 이미 투자했고 전액 회수되지 않은 기업
      if (!input.company_id) throw fail(422, "VALIDATION_ERROR", "후속 투자할 기업을 선택하세요", "BR-INV-02", "company_id");
      const [held] = await tx<{ remaining_cost_amount: number }[]>`
        select remaining_cost_amount from v_portfolio where fund_id = ${fundId} and company_id = ${input.company_id}
      `;
      if (!held || held.remaining_cost_amount <= 0) {
        throw fail(422, "NOT_A_HOLDING", "이 조합이 보유 중인 기업에만 후속 투자할 수 있습니다", "BR-INV-02", "company_id");
      }
      companyId = input.company_id;
    }

    // BR-INV-03, 04: 투자 가능 잔액과 현금 잔액을 모두 확인한다 (D14)
    if (input.investment_amount > before.investable_amount) {
      throw fail(422, "EXCEEDS_INVESTABLE_AMOUNT", `투자 가능 잔액(${formatKRWFull(before.investable_amount)})을 넘습니다`, "BR-INV-03", "investment_amount", {
        investable_amount: before.investable_amount,
      });
    }
    // BR-INV-04 + BR-FIN-02: 투자일 기준 현금 (그 뒤 어느 날의 잔액도 음수가 되면 안 된다)
    await assertCashAvailable(t, fundId, input.investment_date, input.investment_amount, "BR-INV-04", "investment_amount");

    const [created] = await tx<{ id: string }[]>`
      insert into investments (fund_id, company_id, deal_id, investment_date, investment_amount, security_type, shares, price_per_share, is_follow_on, is_primary_purpose, created_by)
      values (${fundId}, ${companyId}, ${dealId}, ${input.investment_date}, ${input.investment_amount}, ${input.security_type}, ${input.shares},
              ${input.price_per_share}, ${input.is_follow_on}, ${input.is_primary_purpose}, ${userId})
      returning id
    `;
    // 회계 (D35): 투자자산 / 현금
    const [company] = await tx<{ name: string }[]>`select name from companies where id = ${companyId}`;
    await journalForInvestment(t, {
      fund_id: fundId,
      investment_id: created.id,
      amount: input.investment_amount,
      date: input.investment_date,
      company_name: company.name,
      follow_on: input.is_follow_on,
      created_by: userId,
    });
    // BR-INV-06: 투자 후 숫자와 주목적 비율 경고를 돌려준다 (05 API 설계 4-3)
    return { investment_id: created.id, fund_after: await getInvestmentSummary(fundId, t) };
  });
}
