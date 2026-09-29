import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { formatDate, formatKRWFull } from "@/lib/format";
import type { ExpenseType } from "@/lib/labels";

// 조합 회계 (D35)
// · 복식부기 분개장: 업무 기록(납입·투자·관리보수·비용·회수·분배)과 같은 트랜잭션에서 자동 분개를 남긴다
// · 분개는 추가만 가능하다. 정정은 역분개. 차변 합 = 대변 합은 DB가 커밋 시점에 한 번 더 검사한다
// · 장부: 분개장, 계정별 원장, 시산표, 재무상태표, 손익계산서
// · 결산: 사업연도(1/1~12/31, 첫해는 결성일부터 ⚠️)의 수익·비용을 이익잉여금으로 대체하고 그 기간을 잠근다
// · 투자자산은 원가법. 공정가치 평가는 분개하지 않고 참고로만 보여준다 (⚠️ 실무 확인 27번)

export type AccountCategory = "asset" | "liability" | "equity" | "revenue" | "expense";
export type SourceType = "contribution" | "distribution" | "investment" | "exit" | "management_fee" | "expense" | "manual" | "closing";

export const CATEGORY_LABEL: Record<AccountCategory, string> = { asset: "자산", liability: "부채", equity: "자본", revenue: "수익", expense: "비용" };
export const SOURCE_LABEL: Record<SourceType, string> = {
  contribution: "출자금 납입",
  distribution: "분배금 지급",
  investment: "투자자산 취득",
  exit: "투자자산 처분",
  management_fee: "관리보수",
  expense: "비용",
  manual: "수동 분개",
  closing: "결산 대체",
};

// 계정 코드 (008_accounting.sql 과 같다)
export const ACCOUNT = {
  cash: "1010",
  investments: "1110",
  receivable: "1210",
  accruedFee: "2010",
  accruedExpense: "2020",
  distributionPayable: "2030",
  capital: "3010",
  distributions: "3020", // 출자금반환 (분배금 중 원금 반환분)
  profitDistributions: "3110", // 이익분배금 (기준수익·초과수익·성과보수)
  retainedEarnings: "3100",
  gainOnDisposal: "4010",
  managementFee: "5010",
  lossOnDisposal: "5020",
} as const;

export const EXPENSE_ACCOUNT: Record<ExpenseType, string> = {
  audit: "5110",
  custody: "5120",
  administration: "5130",
  organization: "5140",
  legal: "5150",
  tax: "5160",
  other: "5190",
};

export type Account = { code: string; name: string; category: AccountCategory; normal_side: "debit" | "credit"; is_contra: boolean; sort_order: number; description: string | null };
export type JournalLineInput = { account: string; debit?: number; credit?: number; memo?: string | null };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// ─── 분개 기록 ─────────────────────────────────────────────────────────────

// 모든 분개가 거치는 한 곳. 호출하는 쪽이 조합 행을 잠근 트랜잭션 안에서 부른다 (entry_no 순번이 겹치지 않게)
export async function postJournal(
  tx: typeof sql,
  entry: {
    fund_id: string;
    entry_date: string;
    description: string;
    source_type: SourceType;
    source_id?: string | null;
    reversal_of_id?: string | null;
    lines: JournalLineInput[];
    created_by: string | null;
  },
) {
  const lines = entry.lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
  const debit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (lines.length < 2 || debit !== credit) {
    throw new AppError(422, "JOURNAL_NOT_BALANCED", `차변 합(${formatKRWFull(debit)})과 대변 합(${formatKRWFull(credit)})이 같아야 합니다`, "BR-ACC-01");
  }
  for (const l of lines) {
    if ((l.debit ?? 0) > 0 && (l.credit ?? 0) > 0) throw new AppError(422, "JOURNAL_NOT_BALANCED", "한 줄에는 차변이나 대변 하나만 적습니다", "BR-ACC-01");
  }
  await assertOpenPeriod(tx, entry.fund_id, entry.entry_date);

  const [{ next }] = await tx<{ next: number }[]>`
    select coalesce(max(entry_no), 0) + 1 as next from journal_entries where fund_id = ${entry.fund_id}
  `;
  const [created] = await tx<{ id: string }[]>`
    insert into journal_entries (fund_id, entry_no, entry_date, description, source_type, source_id, reversal_of_id, created_by)
    values (${entry.fund_id}, ${next}, ${entry.entry_date}, ${entry.description}, ${entry.source_type},
            ${entry.source_id ?? null}, ${entry.reversal_of_id ?? null}, ${entry.created_by})
    returning id
  `;
  for (const [i, l] of lines.entries()) {
    await tx`
      insert into journal_lines (entry_id, line_no, account_code, debit, credit, memo)
      values (${created.id}, ${i + 1}, ${l.account}, ${l.debit ?? 0}, ${l.credit ?? 0}, ${l.memo ?? null})
    `;
  }
  return { id: created.id, entry_no: next };
}

// BR-ACC-03: 결산한 기간에는 분개를 넣을 수 없다 (업무 기록도 함께 막힌다). 재개한 결산은 잠그지 않는다 (BR-ACC-07)
async function closedPeriodOf(tx: typeof sql, fundId: string, date: string) {
  const [closed] = await tx<{ fiscal_year: number; period_end: string }[]>`
    select fiscal_year, period_end from fiscal_closings where fund_id = ${fundId} and period_end >= ${date} and reopened_at is null
    order by period_end desc limit 1
  `;
  return closed ?? null;
}

// 정정(취소)의 역분개일: 원래 거래일로 적되, 그 기간이 결산됐으면 오늘로 적는다
export async function correctionDate(tx: typeof sql, fundId: string, originalDate: string) {
  return (await closedPeriodOf(tx, fundId, originalDate)) ? today() : originalDate;
}

async function assertOpenPeriod(tx: typeof sql, fundId: string, date: string) {
  const closed = await closedPeriodOf(tx, fundId, date);
  if (closed) {
    throw new AppError(409, "PERIOD_CLOSED", `${closed.fiscal_year} 사업연도(~${formatDate(closed.period_end)})는 결산이 끝나 기록할 수 없습니다. 이후 날짜로 기록하세요`, "BR-ACC-03", {
      fields: { date: `${formatDate(closed.period_end)} 이후 날짜를 입력하세요` },
    });
  }
}

// 역분개: 원래 분개의 차변·대변을 바꿔 새 분개를 남긴다
export async function reverseJournal(tx: typeof sql, journalId: string, entryDate: string, description: string, createdBy: string | null) {
  const [orig] = await tx<{ id: string; fund_id: string; source_type: SourceType; source_id: string | null }[]>`
    select id, fund_id, source_type, source_id from journal_entries where id = ${journalId}
  `;
  if (!orig) throw notFound("분개를");
  const [done] = await tx`select 1 from journal_entries where reversal_of_id = ${journalId}`;
  if (done) throw new AppError(409, "ALREADY_REVERSED", "이미 역분개한 분개입니다", "BR-ACC-02");
  const lines = await tx<{ account_code: string; debit: number; credit: number; memo: string | null }[]>`
    select account_code, debit, credit, memo from journal_lines where entry_id = ${journalId} order by line_no
  `;
  return postJournal(tx, {
    fund_id: orig.fund_id,
    entry_date: entryDate,
    description,
    source_type: orig.source_type,
    source_id: orig.source_id,
    reversal_of_id: journalId,
    lines: lines.map((l) => ({ account: l.account_code, debit: l.credit, credit: l.debit, memo: l.memo })),
    created_by: createdBy,
  });
}

// ─── 업무 기록 → 자동 분개 규칙 (BR-ACC-02) ───────────────────────────────

// 출자금 납입 (원장 contribution). 납입 취소 행(음수)은 반대 방향으로 적는다
export function journalForContribution(tx: typeof sql, e: { fund_id: string; ledger_id: string; amount: number; entry_date: string; member_name: string; created_by: string | null }) {
  const amt = Math.abs(e.amount);
  const cancel = e.amount < 0;
  return postJournal(tx, {
    fund_id: e.fund_id,
    entry_date: e.entry_date,
    description: `${e.member_name} 출자금 ${cancel ? "납입 취소" : "납입"}`,
    source_type: "contribution",
    source_id: e.ledger_id,
    lines: cancel
      ? [{ account: ACCOUNT.capital, debit: amt }, { account: ACCOUNT.cash, credit: amt }]
      : [{ account: ACCOUNT.cash, debit: amt }, { account: ACCOUNT.capital, credit: amt }],
    created_by: e.created_by,
  });
}

// 분배금 지급 (원장 distribution). 출자금 반환·이익 분배 구분은 R6에서 나눈다
export function journalForDistribution(tx: typeof sql, e: { fund_id: string; ledger_id: string; amount: number; entry_date: string; member_name: string; created_by: string | null }) {
  const amt = Math.abs(e.amount);
  const cancel = e.amount < 0;
  return postJournal(tx, {
    fund_id: e.fund_id,
    entry_date: e.entry_date,
    description: `${e.member_name} 분배금 ${cancel ? "지급 취소" : "지급"}`,
    source_type: "distribution",
    source_id: e.ledger_id,
    lines: cancel
      ? [{ account: ACCOUNT.cash, debit: amt }, { account: ACCOUNT.distributions, credit: amt }]
      : [{ account: ACCOUNT.distributions, debit: amt }, { account: ACCOUNT.cash, credit: amt }],
    created_by: e.created_by,
  });
}

// 분배 지급 (R6, D37): 분배 1건 = 분개 1건. 원금 반환분은 출자금반환, 나머지(기준수익·초과수익·성과보수)는 이익분배금
export function journalForDistributionPayment(
  tx: typeof sql,
  e: { fund_id: string; distribution_id: string; distribution_no: number; date: string; return_of_capital: number; profit: number; created_by: string | null },
) {
  return postJournal(tx, {
    fund_id: e.fund_id,
    entry_date: e.date,
    description: `제${e.distribution_no}차 분배금 지급`,
    source_type: "distribution",
    source_id: e.distribution_id,
    lines: [
      { account: ACCOUNT.distributions, debit: e.return_of_capital },
      { account: ACCOUNT.profitDistributions, debit: e.profit },
      { account: ACCOUNT.cash, credit: e.return_of_capital + e.profit },
    ],
    created_by: e.created_by,
  });
}

export function journalForInvestment(tx: typeof sql, e: { fund_id: string; investment_id: string; amount: number; date: string; company_name: string; follow_on: boolean; created_by: string | null }) {
  return postJournal(tx, {
    fund_id: e.fund_id,
    entry_date: e.date,
    description: `${e.company_name} ${e.follow_on ? "후속" : "신규"} 투자`,
    source_type: "investment",
    source_id: e.investment_id,
    lines: [{ account: ACCOUNT.investments, debit: e.amount }, { account: ACCOUNT.cash, credit: e.amount }],
    created_by: e.created_by,
  });
}

// 투자자산 처분: 현금(처분대가) / 투자자산(처분 원가) + 처분이익(대변) 또는 처분손실(차변)
export function journalForExit(tx: typeof sql, e: { fund_id: string; exit_id: string; proceeds: number; cost: number; date: string; company_name: string; created_by: string | null }) {
  const gain = e.proceeds - e.cost;
  return postJournal(tx, {
    fund_id: e.fund_id,
    entry_date: e.date,
    description: `${e.company_name} 투자자산 처분`,
    source_type: "exit",
    source_id: e.exit_id,
    lines: [
      { account: ACCOUNT.cash, debit: e.proceeds },
      { account: ACCOUNT.lossOnDisposal, debit: gain < 0 ? -gain : 0 },
      { account: ACCOUNT.investments, credit: e.cost },
      { account: ACCOUNT.gainOnDisposal, credit: gain > 0 ? gain : 0 },
    ],
    created_by: e.created_by,
  });
}

export function journalForManagementFee(tx: typeof sql, e: { fund_id: string; charge_id: string; amount: number; date: string; period: string; created_by: string | null }) {
  return postJournal(tx, {
    fund_id: e.fund_id,
    entry_date: e.date,
    description: `관리보수 (${e.period})`,
    source_type: "management_fee",
    source_id: e.charge_id,
    lines: [{ account: ACCOUNT.managementFee, debit: e.amount }, { account: ACCOUNT.cash, credit: e.amount }],
    created_by: e.created_by,
  });
}

export function journalForExpense(tx: typeof sql, e: { fund_id: string; expense_id: string; type: ExpenseType; amount: number; date: string; description: string; created_by: string | null }) {
  return postJournal(tx, {
    fund_id: e.fund_id,
    entry_date: e.date,
    description: e.description,
    source_type: "expense",
    source_id: e.expense_id,
    lines: [{ account: EXPENSE_ACCOUNT[e.type], debit: e.amount }, { account: ACCOUNT.cash, credit: e.amount }],
    created_by: e.created_by,
  });
}

// 업무 기록의 자동 분개를 찾아 역분개한다 (비용 취소 등)
export async function reverseSourceJournal(tx: typeof sql, sourceType: SourceType, sourceId: string, entryDate: string, description: string, createdBy: string | null) {
  const [j] = await tx<{ id: string }[]>`
    select id from journal_entries where source_type = ${sourceType} and source_id = ${sourceId} and reversal_of_id is null
  `;
  if (!j) return null; // 회계 모듈 이전 기록이면 소급 분개가 없을 수 있다
  return reverseJournal(tx, j.id, entryDate, description, createdBy);
}

// ─── 장부 조회 ─────────────────────────────────────────────────────────────

export async function listAccounts() {
  return sql<Account[]>`select code, name, category, normal_side, is_contra, sort_order, description from accounts order by sort_order`;
}

export type JournalEntry = {
  id: string;
  entry_no: number;
  entry_date: string;
  description: string;
  source_type: SourceType;
  source_id: string | null;
  reversal_of_id: string | null;
  reversed: boolean;
  created_at: Date;
  lines: { account_code: string; account_name: string; debit: number; credit: number; memo: string | null }[];
};

export async function listJournal(fundId: string, filter: { from?: string | null; to?: string | null; limit?: number } = {}) {
  assertUuid(fundId, "조합을");
  const entries = await sql<Omit<JournalEntry, "lines">[]>`
    select e.id, e.entry_no, e.entry_date, e.description, e.source_type, e.source_id, e.reversal_of_id, e.created_at,
           exists (select 1 from journal_entries r where r.reversal_of_id = e.id) as reversed
    from journal_entries e
    where e.fund_id = ${fundId}
      and (${filter.from ?? null}::date is null or e.entry_date >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or e.entry_date <= ${filter.to ?? null}::date)
    order by e.entry_date desc, e.entry_no desc
    limit ${filter.limit ?? 200}
  `;
  const ids = entries.map((e) => e.id);
  const lines = ids.length
    ? await sql<{ entry_id: string; account_code: string; account_name: string; debit: number; credit: number; memo: string | null }[]>`
        select l.entry_id, l.account_code, a.name as account_name, l.debit, l.credit, l.memo
        from journal_lines l join accounts a on a.code = l.account_code
        where l.entry_id in ${sql(ids)} order by l.entry_id, l.line_no
      `
    : [];
  return entries.map((e) => ({
    ...e,
    lines: lines
      .filter((l) => l.entry_id === e.id)
      .map((l) => ({ account_code: l.account_code, account_name: l.account_name, debit: l.debit, credit: l.credit, memo: l.memo })),
  })) as JournalEntry[];
}

export type TrialBalanceRow = Account & { debit: number; credit: number; balance: number }; // balance: 정상 잔액 방향 기준 (+)

// 시산표: 기준일까지 계정별 차변·대변 합계와 잔액
export async function trialBalance(fundId: string, asOf: string, from?: string | null): Promise<TrialBalanceRow[]> {
  assertUuid(fundId, "조합을");
  return sql<TrialBalanceRow[]>`
    select a.code, a.name, a.category, a.normal_side, a.is_contra, a.sort_order, a.description,
           coalesce(sum(l.debit), 0)::bigint as debit, coalesce(sum(l.credit), 0)::bigint as credit,
           (case when a.normal_side = 'debit' then coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0)
                 else coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0) end)::bigint as balance
    from accounts a
    left join (
      journal_lines l join journal_entries e on e.id = l.entry_id
        and e.fund_id = ${fundId} and e.entry_date <= ${asOf}
        and (${from ?? null}::date is null or e.entry_date >= ${from ?? null}::date)
    ) on l.account_code = a.code
    group by a.code
    order by a.sort_order
  `;
}

// 재무상태표 (기준일): 자산 = 부채 + 자본. 자본에는 아직 결산하지 않은 기간의 순이익(미처분 당기순이익)을 포함한다
export async function balanceSheet(fundId: string, asOf: string) {
  const tb = await trialBalance(fundId, asOf);
  const by = (c: AccountCategory) => tb.filter((r) => r.category === c && (r.debit > 0 || r.credit > 0));
  const signed = (r: TrialBalanceRow) => (r.is_contra ? -r.balance : r.balance); // 차감 계정은 빼서 합산
  const assets = by("asset");
  const liabilities = by("liability");
  const equity = by("equity");
  const revenue = tb.filter((r) => r.category === "revenue").reduce((s, r) => s + r.balance, 0);
  const expense = tb.filter((r) => r.category === "expense").reduce((s, r) => s + r.balance, 0);
  const unclosedIncome = revenue - expense; // 결산 전이라 이익잉여금으로 옮겨지지 않은 손익
  const totalAssets = assets.reduce((s, r) => s + signed(r), 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + signed(r), 0);
  const totalEquity = equity.reduce((s, r) => s + signed(r), 0) + unclosedIncome;
  return {
    as_of: asOf,
    assets,
    liabilities,
    equity,
    unclosed_income: unclosedIncome,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

// 손익계산서 (기간): 결산 대체 분개는 빼고 계산한다 (대체 전 손익을 보여주기 위해)
export async function incomeStatement(fundId: string, from: string, to: string) {
  assertUuid(fundId, "조합을");
  const rows = await sql<TrialBalanceRow[]>`
    select a.code, a.name, a.category, a.normal_side, a.is_contra, a.sort_order, a.description,
           coalesce(sum(l.debit), 0)::bigint as debit, coalesce(sum(l.credit), 0)::bigint as credit,
           (case when a.normal_side = 'debit' then coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0)
                 else coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0) end)::bigint as balance
    from accounts a
    left join (
      journal_lines l join journal_entries e on e.id = l.entry_id
        and e.fund_id = ${fundId} and e.entry_date between ${from} and ${to} and e.source_type <> 'closing'
    ) on l.account_code = a.code
    where a.category in ('revenue', 'expense')
    group by a.code
    order by a.sort_order
  `;
  const revenue = rows.filter((r) => r.category === "revenue");
  const expenses = rows.filter((r) => r.category === "expense");
  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.balance, 0);
  return { from, to, revenue: revenue.filter((r) => r.balance !== 0), expenses: expenses.filter((r) => r.balance !== 0), total_revenue: totalRevenue, total_expense: totalExpense, net_income: totalRevenue - totalExpense };
}

// 계정별 원장: 한 계정의 분개 줄을 날짜순으로, 누적 잔액과 함께
export async function generalLedger(fundId: string, accountCode: string, from?: string | null, to?: string | null) {
  assertUuid(fundId, "조합을");
  const [account] = await sql<Account[]>`select code, name, category, normal_side, is_contra, sort_order, description from accounts where code = ${accountCode}`;
  if (!account) throw notFound("계정을");
  const sign = account.normal_side === "debit" ? 1 : -1;
  const [opening] = from
    ? await sql<{ bal: number }[]>`
        select coalesce(sum(l.debit - l.credit), 0)::bigint as bal from journal_lines l join journal_entries e on e.id = l.entry_id
        where e.fund_id = ${fundId} and l.account_code = ${accountCode} and e.entry_date < ${from}
      `
    : [{ bal: 0 }];
  const rows = await sql<{ entry_id: string; entry_no: number; entry_date: string; description: string; source_type: SourceType; debit: number; credit: number; memo: string | null }[]>`
    select e.id as entry_id, e.entry_no, e.entry_date, e.description, e.source_type, l.debit, l.credit, l.memo
    from journal_lines l join journal_entries e on e.id = l.entry_id
    where e.fund_id = ${fundId} and l.account_code = ${accountCode}
      and (${from ?? null}::date is null or e.entry_date >= ${from ?? null}::date)
      and (${to ?? null}::date is null or e.entry_date <= ${to ?? null}::date)
    order by e.entry_date, e.entry_no, l.line_no
  `;
  let balance = sign * opening.bal;
  const lines = rows.map((r) => {
    balance += sign * (r.debit - r.credit);
    return { ...r, balance };
  });
  return { account, opening_balance: sign * opening.bal, lines, closing_balance: balance };
}

// ─── 수동 분개 (BR-ACC-04) ────────────────────────────────────────────────

// 발생주의 조정(미지급비용 등)이나 이자수익처럼 업무 화면이 없는 거래를 직접 적는다
export async function createManualJournal(fundId: string, input: { entry_date: string; description: string; lines: JournalLineInput[] }, userId: string) {
  assertUuid(fundId, "조합을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ formation_date: string | null }[]>`select formation_date from funds where id = ${fundId} for update`;
    if (!fund) throw notFound("조합을");
    if (input.entry_date > today()) throw new AppError(422, "INVALID_DATE", "분개일은 오늘 이후로 입력할 수 없습니다", "BR-ACC-04", { fields: { entry_date: "오늘 이전 날짜를 입력하세요" } });
    const codes = [...new Set(input.lines.map((l) => l.account))];
    const known = await tx<{ code: string }[]>`select code from accounts where code in ${tx(codes)}`;
    if (known.length !== codes.length) throw new AppError(422, "VALIDATION_ERROR", "없는 계정과목이 있습니다", "BR-ACC-04");
    // 현금 계정을 줄이는 수동 분개도 거래일 기준 현금을 넘을 수 없다 (BR-FIN-02 와 같은 원칙)
    const cashOut = input.lines.filter((l) => l.account === ACCOUNT.cash).reduce((s, l) => s + (l.credit ?? 0) - (l.debit ?? 0), 0);
    if (cashOut > 0) {
      const { assertCashAvailable } = await import("@/lib/services/finance");
      await assertCashAvailable(t, fundId, input.entry_date, cashOut, "BR-ACC-04");
    }
    return postJournal(t, { fund_id: fundId, entry_date: input.entry_date, description: input.description, source_type: "manual", lines: input.lines, created_by: userId });
  });
}

export async function reverseManualJournal(fundId: string, journalId: string, reason: string, userId: string) {
  assertUuid(fundId, "조합을");
  assertUuid(journalId, "분개를");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await tx`select 1 from funds where id = ${fundId} for update`;
    const [j] = await tx<{ source_type: SourceType; reversal_of_id: string | null; entry_no: number }[]>`
      select source_type, reversal_of_id, entry_no from journal_entries where id = ${journalId} and fund_id = ${fundId}
    `;
    if (!j) throw notFound("분개를");
    // 자동 분개는 업무 화면에서 취소해야 업무 기록과 장부가 함께 바뀐다
    if (j.source_type !== "manual" || j.reversal_of_id) {
      throw new AppError(409, "REVERSAL_NOT_ALLOWED", "수동 분개만 여기서 역분개할 수 있습니다. 자동 분개는 원래 업무 화면에서 취소하세요", "BR-ACC-02");
    }
    return reverseJournal(t, journalId, today(), `분개 #${j.entry_no} 역분개: ${reason}`, userId);
  });
}

// ─── 결산 (BR-ACC-03) ─────────────────────────────────────────────────────

// 사업연도 기간: 1/1~12/31. 결성한 해는 결성일부터 ⚠️ 실무 확인 25번
export function fiscalPeriod(year: number, formationDate: string | null) {
  const start = formationDate && formationDate.startsWith(String(year)) ? formationDate : `${year}-01-01`;
  return { start, end: `${year}-12-31` };
}

export type FiscalClosing = {
  id: string;
  fiscal_year: number;
  period_start: string;
  period_end: string;
  net_income: number;
  closed_at: Date;
  closing_entry_id: string | null;
  reopened_at: Date | null; // 재개한 결산 (이력으로만 남는다)
  reopen_reason: string | null;
};

export async function listClosings(fundId: string) {
  assertUuid(fundId, "조합을");
  return sql<FiscalClosing[]>`
    select id, fiscal_year, period_start, period_end, net_income, closed_at, closing_entry_id, reopened_at, reopen_reason
    from fiscal_closings where fund_id = ${fundId} order by fiscal_year, closed_at
  `;
}

export async function closeFiscalYear(fundId: string, year: number, userId: string) {
  assertUuid(fundId, "조합을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ formation_date: string | null }[]>`select formation_date from funds where id = ${fundId} for update`;
    if (!fund) throw notFound("조합을");
    if (!fund.formation_date) throw new AppError(409, "FUND_STATUS_NOT_ALLOWED", "결성 전 조합은 결산하지 않습니다", "BR-ACC-03");
    const formationYear = Number(fund.formation_date.slice(0, 4));
    if (year < formationYear) throw new AppError(422, "INVALID_PERIOD", `결성한 해(${formationYear}) 이전 사업연도는 없습니다`, "BR-ACC-03");
    const { start, end } = fiscalPeriod(year, fund.formation_date);
    if (end >= today()) throw new AppError(422, "INVALID_PERIOD", `${year} 사업연도가 끝난 뒤(${formatDate(end)} 이후)에 결산할 수 있습니다`, "BR-ACC-03");
    const [done] = await tx`select 1 from fiscal_closings where fund_id = ${fundId} and fiscal_year = ${year} and reopened_at is null`;
    if (done) throw new AppError(409, "ALREADY_CLOSED", `${year} 사업연도는 이미 결산했습니다`, "BR-ACC-03");
    // 이전 사업연도부터 차례로 결산한다
    if (year > formationYear) {
      const [prev] = await tx`select 1 from fiscal_closings where fund_id = ${fundId} and fiscal_year = ${year - 1} and reopened_at is null`;
      if (!prev) throw new AppError(409, "PREVIOUS_YEAR_OPEN", `${year - 1} 사업연도를 먼저 결산하세요`, "BR-ACC-03");
    }

    // 수익·비용 계정 잔액을 0으로 만들고 차액을 이익잉여금으로 대체한다
    const rows = await tx<{ code: string; category: AccountCategory; balance: number }[]>`
      select a.code, a.category,
             (case when a.normal_side = 'debit' then sum(l.debit) - sum(l.credit) else sum(l.credit) - sum(l.debit) end)::bigint as balance
      from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.code = l.account_code
      where e.fund_id = ${fundId} and e.entry_date between ${start} and ${end} and a.category in ('revenue', 'expense')
      group by a.code
    `;
    const lines: JournalLineInput[] = [];
    let net = 0;
    for (const r of rows) {
      if (r.balance === 0) continue;
      if (r.category === "revenue") {
        net += r.balance;
        lines.push(r.balance > 0 ? { account: r.code, debit: r.balance } : { account: r.code, credit: -r.balance });
      } else {
        net -= r.balance;
        lines.push(r.balance > 0 ? { account: r.code, credit: r.balance } : { account: r.code, debit: -r.balance });
      }
    }
    if (net !== 0) lines.push(net > 0 ? { account: ACCOUNT.retainedEarnings, credit: net } : { account: ACCOUNT.retainedEarnings, debit: -net });
    const closing = lines.length >= 2
      ? await postJournal(t, { fund_id: fundId, entry_date: end, description: `${year} 사업연도 결산 (손익 대체)`, source_type: "closing", lines, created_by: userId })
      : null;
    await tx`
      insert into fiscal_closings (fund_id, fiscal_year, period_start, period_end, closing_entry_id, net_income, closed_by)
      values (${fundId}, ${year}, ${start}, ${end}, ${closing?.id ?? null}, ${net}, ${userId})
    `;
    return { fiscal_year: year, net_income: net, closing_entry_no: closing?.entry_no ?? null };
  });
}

// BR-ACC-07 결산 재개: 마지막으로 결산한 사업연도부터 거꾸로 연다. 결산 분개를 기말 날짜로 역분개하고 잠금을 푼다.
// 결산 기록은 지우지 않고 재개 표시를 남긴다. 고친 뒤 다시 결산한다
export async function reopenFiscalYear(fundId: string, year: number, reason: string, userId: string) {
  assertUuid(fundId, "조합을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [fund] = await tx<{ status: string }[]>`select status from funds where id = ${fundId} for update`;
    if (!fund) throw notFound("조합을");
    if (fund.status === "liquidated") throw new AppError(409, "FUND_STATUS_NOT_ALLOWED", "청산한 조합의 결산은 다시 열 수 없습니다", "BR-ACC-07");
    const [closing] = await tx<{ id: string; period_end: string; closing_entry_id: string | null }[]>`
      select id, period_end, closing_entry_id from fiscal_closings where fund_id = ${fundId} and fiscal_year = ${year} and reopened_at is null for update
    `;
    if (!closing) throw new AppError(409, "NOT_CLOSED", `${year} 사업연도는 결산하지 않았습니다`, "BR-ACC-07");
    const [later] = await tx<{ fiscal_year: number }[]>`
      select fiscal_year from fiscal_closings where fund_id = ${fundId} and fiscal_year > ${year} and reopened_at is null order by fiscal_year desc limit 1
    `;
    if (later) throw new AppError(409, "LATER_YEAR_CLOSED", `${later.fiscal_year} 사업연도 결산을 먼저 재개하세요. 마지막 결산부터 거꾸로 엽니다`, "BR-ACC-07");

    // 잠금을 먼저 풀어야 기말 날짜로 역분개할 수 있다
    await tx`update fiscal_closings set reopened_at = now(), reopened_by = ${userId}, reopen_reason = ${reason} where id = ${closing.id}`;
    const reversal = closing.closing_entry_id
      ? await reverseJournal(t, closing.closing_entry_id, closing.period_end, `${year} 사업연도 결산 재개: ${reason}`, userId)
      : null;
    return { fiscal_year: year, reversal_entry_no: reversal?.entry_no ?? null };
  });
}
