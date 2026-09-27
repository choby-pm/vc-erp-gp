import { sql } from "@/lib/db";
import { assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { EDITABLE_FUND_STATUSES, type FundStatus, type FundType } from "@/lib/labels";
import type { FundBasicInput, FundTermsInput } from "@/lib/schemas/fund";

// 펀드 서비스: SQL을 직접 작성해 펀드·규약을 조회·저장한다.
// API(쓰기)와 화면(읽기)이 모두 이 함수들을 쓴다.

export type FundListItem = {
  id: string;
  name: string;
  fund_type: FundType;
  status: FundStatus;
  target_amount: number;
  total_commitment_amount: number;
  total_paid_amount: number;
  created_at: Date;
};

export type FundTerms = {
  version: number;
  primary_purpose: string;
  primary_purpose_min_ratio: number;
  gp_commitment_min_ratio: number;
  management_fee_rate: number;
  management_fee_rate_after: number;
  carry_rate: number;
  hurdle_rate: number;
  quorum_ratio: number;
  effective_date: Date;
};

export type FundDetail = FundListItem & {
  term_years: number;
  investment_period_years: number;
  formation_date: Date | null;
  maturity_date: Date | null;
  terms: FundTerms;
  editable: boolean;
};

// numeric 컬럼은 DB에서 문자열로 오므로 숫자로 바꾼다
const RATIO_KEYS = [
  "primary_purpose_min_ratio",
  "gp_commitment_min_ratio",
  "management_fee_rate",
  "management_fee_rate_after",
  "carry_rate",
  "hurdle_rate",
  "quorum_ratio",
] as const;

function parseTerms(row: Record<string, unknown>): FundTerms {
  const terms = { ...row } as Record<string, unknown>;
  for (const key of RATIO_KEYS) terms[key] = Number(terms[key]);
  return terms as unknown as FundTerms;
}

export async function listFunds(): Promise<FundListItem[]> {
  return sql<FundListItem[]>`
    select f.id, f.name, f.fund_type, f.status, f.target_amount, f.created_at,
           s.total_commitment_amount, s.total_paid_amount
    from funds f
    join v_fund_summary s on s.fund_id = f.id
    order by f.created_at desc
  `;
}

export async function getFund(fundId: string): Promise<FundDetail> {
  assertUuid(fundId, "펀드를");

  const [fund] = await sql`
    select f.id, f.name, f.fund_type, f.status, f.target_amount, f.term_years, f.investment_period_years,
           f.formation_date, f.created_at,
           s.total_commitment_amount, s.total_paid_amount, s.maturity_date
    from funds f
    join v_fund_summary s on s.fund_id = f.id
    where f.id = ${fundId}
  `;
  if (!fund) throw notFound("펀드를");

  // 가장 최신 규약 버전 (BR-TERM-04: 오늘 기준 적용 버전은 R5 규약 변경에서 날짜 조건 추가)
  const [terms] = await sql`
    select version, primary_purpose, primary_purpose_min_ratio, gp_commitment_min_ratio,
           management_fee_rate, management_fee_rate_after, carry_rate, hurdle_rate, quorum_ratio, effective_date
    from fund_terms
    where fund_id = ${fundId}
    order by version desc
    limit 1
  `;

  return {
    ...(fund as unknown as FundListItem),
    term_years: fund.term_years,
    investment_period_years: fund.investment_period_years,
    formation_date: fund.formation_date,
    maturity_date: fund.maturity_date,
    terms: parseTerms(terms),
    editable: EDITABLE_FUND_STATUSES.includes(fund.status),
  };
}

// 펀드 생성: 펀드와 규약 버전 1을 하나의 트랜잭션으로 저장한다 (BR-COM-01)
export async function createFund(fund: FundBasicInput, terms: FundTermsInput, userId: string) {
  return sql.begin(async (tx) => {
    const [created] = await tx<{ id: string }[]>`
      insert into funds (name, fund_type, target_amount, term_years, investment_period_years, created_by)
      values (${fund.name}, ${fund.fund_type}, ${fund.target_amount}, ${fund.term_years},
              ${fund.investment_period_years}, ${userId})
      returning id
    `;
    // 결성 전 규약의 적용일은 작성일로 두고, 결성 시 결성일로 바꾼다 (R2)
    await tx`
      insert into fund_terms ${tx({ ...terms, fund_id: created.id, version: 1, effective_date: new Date(), created_by: userId })}
    `;
    return created;
  });
}

// 기획·모집 중일 때만 수정 가능. 수정하는 동안 펀드 행을 잠가 상태가 바뀌는 것을 막는다 (BR-COM-02)
async function lockEditableFund(tx: typeof sql, fundId: string, rule: string) {
  assertUuid(fundId, "펀드를");
  const [row] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`;
  if (!row) throw notFound("펀드를");
  if (!EDITABLE_FUND_STATUSES.includes(row.status)) {
    throw statusNotAllowed(rule, "결성 이후에는 수정할 수 없습니다. 규약 변경은 총회 가결 안건이 필요합니다");
  }
}

export async function updateFundBasic(fundId: string, fund: FundBasicInput) {
  await sql.begin(async (tx) => {
    await lockEditableFund(tx as unknown as typeof sql, fundId, "BR-FUND-08");
    await tx`
      update funds set ${tx(fund, "name", "fund_type", "target_amount", "term_years", "investment_period_years")}
      where id = ${fundId}
    `;
  });
}

export async function updateTermsV1(fundId: string, terms: FundTermsInput) {
  await sql.begin(async (tx) => {
    await lockEditableFund(tx as unknown as typeof sql, fundId, "BR-TERM-01");
    await tx`
      update fund_terms set ${tx(terms, ...RATIO_KEYS, "primary_purpose")}
      where fund_id = ${fundId} and version = 1
    `;
  });
}
