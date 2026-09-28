import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import type { FundStatus } from "@/lib/labels";
import type { ValuationInput } from "@/lib/schemas/valuation";

// 포트폴리오와 기업가치 평가 (BR-VAL-01~03)
// · 포트폴리오는 조합 × 기업당 1행 (v_portfolio): 투자 원금, 회수, 남은 원금, 최신 평가액, 보유 상태
// · 평가액: 전액 회수면 0, 평가 기록이 있으면 최신 평가액, 없으면 남은 원금 (BR-VAL-03)
// · 평가는 결성 이후 운용·해산 중에만 기록한다 (04 업무 규칙 2-2)

export type HoldingStatus = "holding" | "partially_exited" | "exited";

export type PortfolioItem = {
  company_id: string;
  company_name: string;
  sector: string | null;
  invested_amount: number;
  investment_count: number;
  first_investment_date: string;
  proceeds_amount: number;
  exited_cost_amount: number;
  remaining_cost_amount: number;
  holding_status: HoldingStatus;
  current_value_amount: number;
  latest_valuation_date: string | null;
  unrealized_multiple: number | null; // 평가액 ÷ 남은 원금
};

export type Valuation = { id: string; company_id: string; company_name: string; valuation_date: string; fair_value_amount: number; method: string | null };

const VALUATION_STATUSES: FundStatus[] = ["operating", "dissolved"];

export async function getPortfolio(fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  const items = await sql<PortfolioItem[]>`
    select p.company_id, p.company_name, c.sector, p.invested_amount, p.investment_count, p.first_investment_date,
           p.proceeds_amount, p.exited_cost_amount, p.remaining_cost_amount, p.holding_status, p.current_value_amount,
           p.latest_valuation_date,
           case when p.remaining_cost_amount > 0 then round(p.current_value_amount::numeric / p.remaining_cost_amount, 2)::float8 end as unrealized_multiple
    from v_portfolio p join companies c on c.id = p.company_id
    where p.fund_id = ${fundId}
    order by p.holding_status = 'exited', p.invested_amount desc
  `;
  const valuations = await sql<Valuation[]>`
    select v.id, v.company_id, c.name as company_name, v.valuation_date, v.fair_value_amount, v.method
    from valuations v join companies c on c.id = v.company_id
    where v.fund_id = ${fundId}
    order by v.valuation_date desc, c.name
  `;
  const sum = (key: "invested_amount" | "proceeds_amount" | "remaining_cost_amount" | "current_value_amount") => items.reduce((s, i) => s + i[key], 0);
  const invested = sum("invested_amount");
  return {
    fund_status: fund.status,
    can_value: VALUATION_STATUSES.includes(fund.status),
    totals: {
      company_count: items.length,
      holding_count: items.filter((i) => i.holding_status !== "exited").length,
      invested_amount: invested,
      proceeds_amount: sum("proceeds_amount"),
      remaining_cost_amount: sum("remaining_cost_amount"),
      current_value_amount: sum("current_value_amount"),
      // 총 가치 배수 = (회수액 + 보유 평가액) ÷ 투자 원금
      total_multiple: invested > 0 ? (sum("proceeds_amount") + sum("current_value_amount")) / invested : null,
    },
    items,
    valuations,
  };
}

export async function recordValuation(fundId: string, input: ValuationInput, userId: string) {
  assertUuid(fundId, "조합을");
  await sql.begin(async (tx) => {
    const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`;
    if (!fund) throw notFound("조합을");
    if (!VALUATION_STATUSES.includes(fund.status)) throw statusNotAllowed("BR-FUND-08", "기업가치 평가는 운용·해산 중인 조합에서 기록합니다");

    // BR-VAL-01: 이 조합이 투자한 기업만. BR-VAL-03: 전액 회수된 기업은 평가하지 않는다
    const [holding] = await tx<{ first_investment_date: string; holding_status: HoldingStatus }[]>`
      select first_investment_date, holding_status from v_portfolio where fund_id = ${fundId} and company_id = ${input.company_id}
    `;
    const fail = (code: string, message: string, rule: string, field: string, status = 422) =>
      new AppError(status, code, message, rule, { fields: { [field]: message } });
    if (!holding) throw fail("NOT_A_HOLDING", "이 조합이 투자한 기업만 평가할 수 있습니다", "BR-VAL-01", "company_id");
    if (holding.holding_status === "exited") throw fail("VALUATION_NOT_ALLOWED", "전액 회수된 기업은 평가하지 않습니다", "BR-VAL-03", "company_id");
    // BR-VAL-02: 기준일 ≥ 첫 투자일, 미래 불가, 같은 기준일 중복 불가
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (input.valuation_date < holding.first_investment_date || input.valuation_date > today) {
      throw fail("INVALID_DATE", `평가 기준일은 첫 투자일(${formatDate(holding.first_investment_date)})부터 오늘 사이여야 합니다`, "BR-VAL-02", "valuation_date");
    }
    const [dup] = await tx`select 1 from valuations where fund_id = ${fundId} and company_id = ${input.company_id} and valuation_date = ${input.valuation_date}`;
    if (dup) throw fail("DUPLICATE_VALUATION", "같은 기준일의 평가가 이미 있습니다", "BR-VAL-02", "valuation_date", 409);

    await tx`
      insert into valuations (fund_id, company_id, valuation_date, fair_value_amount, method, created_by)
      values (${fundId}, ${input.company_id}, ${input.valuation_date}, ${input.fair_value_amount}, ${input.method}, ${userId})
    `;
  });
}
