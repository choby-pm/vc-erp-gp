import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate, formatKRWFull } from "@/lib/format";
import type { ExitType, FundStatus } from "@/lib/labels";
import type { ExitInput } from "@/lib/schemas/exit";
import { journalForExit } from "@/lib/services/accounting";

// 회수 (04 업무 규칙 9, BR-EXIT-01~06)
// · 한 기업을 여러 번 나눠 회수할 수 있다. 회수마다 그만큼의 원금(처분 원가)을 함께 기록한다
// · 회수 금액은 조합 현금으로 들어오고, 처분 원가만큼 투자자산이 줄어든다 (처분손익 = 회수 금액 − 원금)
// · 회계 (D35): 같은 트랜잭션에서 투자자산 처분 분개를 만든다

export type Exit = {
  id: string;
  company_id: string;
  company_name: string;
  exit_type: ExitType;
  exit_date: string;
  proceeds_amount: number;
  cost_basis_amount: number;
  gain_amount: number;
  multiple: number | null; // BR-EXIT-05: 회수 금액 ÷ 원금
  memo: string | null;
};

export const EXIT_STATUSES: FundStatus[] = ["operating", "dissolved"]; // BR-EXIT-01
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export async function listExits(fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  const exits = await sql<Exit[]>`
    select x.id, x.company_id, c.name as company_name, x.exit_type, x.exit_date, x.proceeds_amount, x.cost_basis_amount,
           (x.proceeds_amount - x.cost_basis_amount)::bigint as gain_amount,
           round(x.proceeds_amount::numeric / x.cost_basis_amount, 2)::float8 as multiple, x.memo
    from exits x join companies c on c.id = x.company_id
    where x.fund_id = ${fundId}
    order by x.exit_date desc, x.created_at desc
  `;
  // 회수할 수 있는 보유 기업 (남은 원금 > 0)
  const holdings = await sql<{ company_id: string; company_name: string; remaining_cost_amount: number; first_investment_date: string; current_value_amount: number }[]>`
    select company_id, company_name, remaining_cost_amount, first_investment_date, current_value_amount
    from v_portfolio where fund_id = ${fundId} and remaining_cost_amount > 0
    order by company_name
  `;
  const proceeds = exits.reduce((s, x) => s + x.proceeds_amount, 0);
  const cost = exits.reduce((s, x) => s + x.cost_basis_amount, 0);
  return {
    fund_status: fund.status,
    can_record: EXIT_STATUSES.includes(fund.status),
    totals: { count: exits.length, proceeds_amount: proceeds, cost_basis_amount: cost, gain_amount: proceeds - cost, multiple: cost > 0 ? proceeds / cost : null },
    exits,
    holdings,
  };
}

const fail = (status: number, code: string, message: string, rule: string, field?: string) =>
  new AppError(status, code, message, rule, field ? { fields: { [field]: message } } : undefined);

export async function recordExit(fundId: string, input: ExitInput, userId: string) {
  assertUuid(fundId, "조합을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`; // BR-COM-02
    if (!fund) throw notFound("조합을");
    if (!EXIT_STATUSES.includes(fund.status)) throw statusNotAllowed("BR-EXIT-01", "회수는 운용·해산 중인 조합에서 기록합니다");

    const [holding] = await tx<{ company_name: string; remaining_cost_amount: number; first_investment_date: string }[]>`
      select company_name, remaining_cost_amount, first_investment_date from v_portfolio where fund_id = ${fundId} and company_id = ${input.company_id}
    `;
    if (!holding || holding.remaining_cost_amount <= 0) throw fail(422, "NOT_A_HOLDING", "이 조합이 보유 중인 기업만 회수할 수 있습니다", "BR-EXIT-02", "company_id");

    // BR-EXIT-06: 첫 투자일 ≤ 회수일 ≤ 오늘
    if (input.exit_date < holding.first_investment_date || input.exit_date > today()) {
      throw fail(422, "INVALID_DATE", `회수일은 첫 투자일(${formatDate(holding.first_investment_date)})부터 오늘 사이여야 합니다`, "BR-EXIT-06", "exit_date");
    }
    // BR-EXIT-04: 상각은 회수 금액 0
    if (input.exit_type === "write_off" && input.proceeds_amount !== 0) throw fail(422, "VALIDATION_ERROR", "상각은 회수 금액이 0원입니다", "BR-EXIT-04", "proceeds_amount");
    if (input.exit_type !== "write_off" && input.proceeds_amount === 0) throw fail(422, "VALIDATION_ERROR", "회수 금액을 입력하세요. 받은 돈이 없으면 상각으로 기록합니다", "BR-EXIT-04", "proceeds_amount");

    // BR-EXIT-03: 전량 회수면 남은 원금 전액. 일부 회수면 입력한 원금 (BR-EXIT-02: 남은 원금 이하)
    const cost = input.full_exit ? holding.remaining_cost_amount : input.cost_basis_amount;
    if (!cost || cost <= 0) throw fail(422, "VALIDATION_ERROR", "일부 회수는 이번에 회수하는 원금을 입력하세요", "BR-EXIT-03", "cost_basis_amount");
    if (cost > holding.remaining_cost_amount) {
      throw fail(422, "EXIT_EXCEEDS_COST", `회수 원금이 남은 투자 원금(${formatKRWFull(holding.remaining_cost_amount)})을 넘습니다`, "BR-EXIT-02", "cost_basis_amount");
    }

    const [created] = await tx<{ id: string }[]>`
      insert into exits (fund_id, company_id, exit_type, exit_date, proceeds_amount, cost_basis_amount, memo, created_by)
      values (${fundId}, ${input.company_id}, ${input.exit_type}, ${input.exit_date}, ${input.proceeds_amount}, ${cost}, ${input.memo}, ${userId})
      returning id
    `;
    // 회계 (D35): 현금(처분대가) / 투자자산(처분 원가) ± 처분손익. 결산된 기간이면 PERIOD_CLOSED
    await journalForExit(t, {
      fund_id: fundId,
      exit_id: created.id,
      proceeds: input.proceeds_amount,
      cost,
      date: input.exit_date,
      company_name: holding.company_name,
      created_by: userId,
    });
    return { exit_id: created.id, cost_basis_amount: cost, gain_amount: input.proceeds_amount - cost };
  });
}
