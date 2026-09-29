import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate, formatKRWFull } from "@/lib/format";
import type { CashFlowKind, ExpenseType, FundStatus } from "@/lib/labels";
import { correctionDate, journalForExpense, reverseSourceJournal } from "@/lib/services/accounting";

// 조합 재무 (D34)
// · 요약: 약정·납입·투자·비용·회수·분배·현금·투자 가능 잔액 (v_fund_summary)
// · 현금 흐름 장부: 조합 통장에 들어오고 나간 모든 돈을 날짜순으로, 누적 잔액과 함께 보여준다
//     들어옴: 출자금 납입, 투자 회수 / 나감: 투자 집행, 관리보수, 기타 비용, 분배
//   원본은 각 업무 테이블이고, 이 장부는 그것을 모아 보여주기만 한다 (따로 저장하지 않음, D7)
// · 기타 비용: 관리보수 외 조합 비용을 기록한다. 틀리면 지우지 않고 취소 표시를 남긴다

export type FinanceSummary = {
  fund_status: FundStatus;
  formation_date: string | null;
  commitment_amount: number;
  paid_amount: number;
  invested_amount: number;
  fee_amount: number;
  expense_amount: number;
  proceeds_amount: number;
  distributed_amount: number;
  cash_amount: number;
  investable_amount: number;
};

export type CashFlow = {
  date: string;
  kind: CashFlowKind;
  description: string;
  counterparty: string | null;
  amount: number; // 들어오면 +, 나가면 −
  balance: number; // 이 거래 후 현금 잔액
  link: string | null; // 원본 화면
};

export type Expense = {
  id: string;
  expense_type: ExpenseType;
  description: string;
  payee: string | null;
  amount: number;
  paid_date: string;
  cancelled_at: Date | null;
  cancel_reason: string | null;
};

const EXPENSE_STATUSES: FundStatus[] = ["formed", "operating", "dissolved"];
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export async function getFinanceSummary(fundId: string, tx: typeof sql = sql): Promise<FinanceSummary> {
  assertUuid(fundId, "조합을");
  const [row] = await tx<FinanceSummary[]>`
    select f.status as fund_status, f.formation_date,
           s.total_commitment_amount as commitment_amount, s.total_paid_amount as paid_amount,
           s.total_invested_amount as invested_amount, s.total_fee_amount as fee_amount, s.total_expense_amount as expense_amount,
           s.total_proceeds_amount as proceeds_amount, s.total_distributed_amount as distributed_amount,
           s.cash_amount, s.investable_amount
    from funds f join v_fund_summary s on s.fund_id = f.id where f.id = ${fundId}
  `;
  if (!row) throw notFound("조합을");
  return row;
}

// 현금 흐름 장부. 같은 날짜 안에서는 들어온 돈을 먼저 둔다 (잔액이 잠깐 음수로 보이지 않게)
export async function listCashFlows(fundId: string, filter: { from?: string | null; to?: string | null; kind?: CashFlowKind | null } = {}) {
  assertUuid(fundId, "조합을");
  const rows = await sql<(Omit<CashFlow, "balance"> & { sort_key: string })[]>`
    select * from (
      select e.entry_date as date, 'contribution' as kind,
             case when e.reversal_of_id is null then '출자금 납입' else '출자금 납입 취소' end || coalesce(' · ' || e.memo, '') as description,
             coalesce(lp.name, 'GP') as counterparty, e.amount::bigint as amount,
             '/funds/' || e.fund_id || '/members' as link, e.created_at::text as sort_key
      from ledger_entries e join fund_members m on m.id = e.member_id left join limited_partners lp on lp.id = m.lp_id
      where e.fund_id = ${fundId} and e.entry_type = 'contribution'
      union all
      select e.entry_date, 'distribution', '분배' || coalesce(' · ' || e.memo, ''), coalesce(lp.name, 'GP'), -e.amount::bigint,
             '/funds/' || e.fund_id || '/members', e.created_at::text
      from ledger_entries e join fund_members m on m.id = e.member_id left join limited_partners lp on lp.id = m.lp_id
      where e.fund_id = ${fundId} and e.entry_type = 'distribution'
      union all
      select i.investment_date, 'investment', case when i.is_follow_on then '후속 투자' else '신규 투자' end, c.name, -i.investment_amount::bigint,
             '/funds/' || i.fund_id || '/investments', i.created_at::text
      from investments i join companies c on c.id = i.company_id where i.fund_id = ${fundId}
      union all
      select x.exit_date, 'exit', '투자 회수', c.name, x.proceeds_amount::bigint,
             '/funds/' || x.fund_id || '/portfolio', x.created_at::text
      from exits x join companies c on c.id = x.company_id where x.fund_id = ${fundId} and x.proceeds_amount > 0 and x.cancelled_at is null
      union all
      select m.charged_date, 'management_fee', '관리보수 (' || to_char(m.period_start, 'YYYY.MM.DD') || ' ~ ' || to_char(m.period_end, 'YYYY.MM.DD') || ')',
             '운용사 (GP)', -m.fee_amount::bigint, '/funds/' || m.fund_id || '/management-fees', m.created_at::text
      from management_fee_charges m where m.fund_id = ${fundId} and m.fee_amount > 0
      union all
      select x.paid_date, 'expense', x.description, x.payee, -x.amount::bigint, '/funds/' || x.fund_id || '/finance', x.created_at::text
      from fund_expenses x where x.fund_id = ${fundId} and x.cancelled_at is null
    ) t
    order by date, (amount < 0), sort_key
  `;

  // 누적 잔액은 전체 기간으로 계산한 뒤 걸러낸다 (걸러도 잔액은 실제 잔액이 되도록)
  let balance = 0;
  const all: CashFlow[] = rows.map((r) => {
    balance += r.amount;
    return { date: r.date, kind: r.kind, description: r.description, counterparty: r.counterparty, amount: r.amount, balance, link: r.link };
  });
  const filtered = all.filter(
    (r) => (!filter.from || r.date >= filter.from) && (!filter.to || r.date <= filter.to) && (!filter.kind || r.kind === filter.kind),
  );
  const inflow = filtered.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const outflow = filtered.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
  return { flows: filtered.reverse(), inflow, outflow, count: filtered.length }; // 최신순으로 보여준다
}

// ─── 약식 재무제표 (BR-FIN-03) ─────────────────────────────────────────────

// 업무 기록에서 바로 만드는 약식 재무상태표·손익계산서 (원가 기준).
// 회계 모듈(분개·계정별 원장·결산)이 생기기 전까지의 요약이며, 다음 한계가 있다:
//   · 비용은 지급할 때 인식한다 (미지급비용 같은 부채를 아직 기록하지 않음)
//   · 투자자산은 취득원가로 적고, 공정가치(평가액)와의 차이는 미실현 평가손익으로 따로 보여준다
//   · 분배는 출자금 반환과 이익 분배를 아직 나누지 않는다 (R6 분배에서 구분)
// 항등식: 자산총계 = 부채총계 + 자본총계 (현금 + 투자자산 = 출자금 − 분배금 + 이익잉여금)

export type FinancialStatements = {
  as_of: string;
  balance_sheet: {
    assets: { cash: number; investments_at_cost: number; total: number };
    liabilities: { total: number };
    equity: { paid_in_capital: number; distributions: number; retained_earnings: number; total: number };
    balanced: boolean;
  };
  income_statement: {
    revenue: { realized_gain: number; total: number }; // 투자자산처분손익 = 처분대가 − 처분 원가
    expenses: { management_fee: number; other: { type: ExpenseType; amount: number }[]; total: number };
    net_income: number;
  };
  fair_value: { investments_at_fair_value: number; unrealized_gain: number; net_asset_value: number }; // 공정가치 기준 순자산
  commitment: { committed: number; paid_in: number; unpaid: number }; // 출자 약정 (주석 사항)
};

export async function getFinancialStatements(fundId: string): Promise<FinancialStatements> {
  const s = await getFinanceSummary(fundId);
  const [pf] = await sql<{ exited_cost: number; fair_value: number; book_value: number }[]>`
    select coalesce(sum(exited_cost_amount), 0)::bigint as exited_cost,
           coalesce(sum(current_value_amount), 0)::bigint as fair_value,
           coalesce(sum(remaining_cost_amount), 0)::bigint as book_value
    from v_portfolio where fund_id = ${fundId}
  `;
  const other = await sql<{ type: ExpenseType; amount: number }[]>`
    select expense_type as type, sum(amount)::bigint as amount from fund_expenses
    where fund_id = ${fundId} and cancelled_at is null group by expense_type order by sum(amount) desc
  `;
  const realizedGain = s.proceeds_amount - pf.exited_cost;
  const expenseTotal = s.fee_amount + s.expense_amount;
  const netIncome = realizedGain - expenseTotal;
  const assets = s.cash_amount + pf.book_value;
  const equity = s.paid_amount - s.distributed_amount + netIncome;
  return {
    as_of: today(),
    balance_sheet: {
      assets: { cash: s.cash_amount, investments_at_cost: pf.book_value, total: assets },
      liabilities: { total: 0 },
      equity: { paid_in_capital: s.paid_amount, distributions: s.distributed_amount, retained_earnings: netIncome, total: equity },
      balanced: assets === equity,
    },
    income_statement: {
      revenue: { realized_gain: realizedGain, total: realizedGain },
      expenses: { management_fee: s.fee_amount, other, total: expenseTotal },
      net_income: netIncome,
    },
    fair_value: { investments_at_fair_value: pf.fair_value, unrealized_gain: pf.fair_value - pf.book_value, net_asset_value: equity + (pf.fair_value - pf.book_value) },
    commitment: { committed: s.commitment_amount, paid_in: s.paid_amount, unpaid: s.commitment_amount - s.paid_amount },
  };
}

// ─── 거래일 기준 사용 가능 현금 (BR-FIN-02) ────────────────────────────────

// 그 날짜에 새로 돈을 내보내도 되는 한도.
// = min(그날 기준 잔액, 그 뒤 모든 날의 날짜별 마감 잔액).
// 과거 날짜로 출금을 기록하면 그 날짜 이후의 모든 잔액이 같이 줄어들기 때문에, 이후 어느 시점도 음수가 되지 않게 한다
export async function availableCashOn(tx: typeof sql, fundId: string, date: string) {
  const [row] = await tx<{ available: number }[]>`
    with flows as (
      select entry_date as d, amount::bigint as amt from ledger_entries where fund_id = ${fundId} and entry_type = 'contribution'
      union all select entry_date, -amount::bigint from ledger_entries where fund_id = ${fundId} and entry_type = 'distribution'
      union all select investment_date, -investment_amount::bigint from investments where fund_id = ${fundId}
      union all select exit_date, proceeds_amount::bigint from exits where fund_id = ${fundId} and cancelled_at is null
      union all select charged_date, -fee_amount::bigint from management_fee_charges where fund_id = ${fundId}
      union all select paid_date, -amount::bigint from fund_expenses where fund_id = ${fundId} and cancelled_at is null
    ), daily as (
      select d, sum(amt) over (order by d) as bal from (select d, sum(amt) as amt from flows group by d) x
    )
    select least(
      coalesce((select bal from daily where d <= ${date} order by d desc limit 1), 0),
      coalesce((select min(bal) from daily where d > ${date}), ${Number.MAX_SAFE_INTEGER}::bigint)
    )::bigint as available
  `;
  return row.available;
}

// 출금 전 확인: 부족하면 INSUFFICIENT_CASH (거래일과 한도를 함께 알려준다)
export async function assertCashAvailable(tx: typeof sql, fundId: string, date: string, amount: number, rule: string, field?: string) {
  const available = await availableCashOn(tx, fundId, date);
  if (amount > available) {
    const message = `${formatDate(date)} 기준으로 쓸 수 있는 현금은 ${formatKRWFull(Math.max(0, available))}입니다. 거래일을 납입일 이후로 하거나 캐피탈콜로 먼저 자금을 확보하세요`;
    throw new AppError(422, "INSUFFICIENT_CASH", message, rule, {
      date,
      available_amount: available,
      requested_amount: amount,
      ...(field ? { fields: { [field]: message } } : {}),
    });
  }
}

export async function listExpenses(fundId: string) {
  assertUuid(fundId, "조합을");
  return sql<Expense[]>`
    select id, expense_type, description, payee, amount, paid_date, cancelled_at, cancel_reason
    from fund_expenses where fund_id = ${fundId}
    order by paid_date desc, created_at desc
  `;
}

// ─── 기타 비용 기록·취소 ──────────────────────────────────────────────────

export async function createExpense(
  fundId: string,
  input: { expense_type: ExpenseType; description: string; payee: string | null; amount: number; paid_date: string },
  userId: string,
) {
  assertUuid(fundId, "조합을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`; // BR-COM-02
    if (!fund) throw notFound("조합을");
    if (!EXPENSE_STATUSES.includes(fund.status)) throw statusNotAllowed("BR-EXP-01", "기타 비용은 결성 이후에 기록합니다");
    if (input.paid_date > today()) {
      throw new AppError(422, "INVALID_DATE", "지급일은 오늘 이후로 입력할 수 없습니다", "BR-EXP-01", { fields: { paid_date: "오늘 이전 날짜를 입력하세요" } });
    }
    // 지급일 기준 현금이 있어야 한다 (BR-FIN-02)
    await assertCashAvailable(t, fundId, input.paid_date, input.amount, "BR-FIN-02", "amount");
    const [created] = await tx<{ id: string }[]>`
      insert into fund_expenses ${tx({ ...input, fund_id: fundId, created_by: userId })} returning id
    `;
    // 회계 (D35): 해당 비용 계정 / 현금
    await journalForExpense(t, { fund_id: fundId, expense_id: created.id, type: input.expense_type, amount: input.amount, date: input.paid_date, description: input.description, created_by: userId });
    return created;
  });
}

export async function cancelExpense(fundId: string, expenseId: string, reason: string, userId: string) {
  assertUuid(fundId, "조합을");
  assertUuid(expenseId, "비용을");
  await sql.begin(async (tx) => {
    await tx`select 1 from funds where id = ${fundId} for update`;
    const [expense] = await tx<{ cancelled_at: Date | null; paid_date: string }[]>`
      select cancelled_at, paid_date from fund_expenses where id = ${expenseId} and fund_id = ${fundId} for update
    `;
    if (!expense) throw notFound("비용을");
    if (expense.cancelled_at) throw new AppError(409, "ALREADY_REVERSED", `이미 취소된 비용입니다 (${formatDate(expense.cancelled_at)})`, "BR-EXP-02");
    await tx`update fund_expenses set cancelled_at = now(), cancelled_by = ${userId}, cancel_reason = ${reason} where id = ${expenseId}`;
    // 회계 (D35): 원래 분개를 역분개한다. 현금출납장처럼 지급일에서 빠지도록 지급일로 적고, 그 기간이 결산됐으면 오늘로 적는다
    const t = tx as unknown as typeof sql;
    await reverseSourceJournal(t, "expense", expenseId, await correctionDate(t, fundId, expense.paid_date), `비용 취소: ${reason}`, userId);
  });
}
